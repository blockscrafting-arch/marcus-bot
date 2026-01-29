import { Context } from 'grammy';
import OpenAI from 'openai';
import { openRouter, defaultChatModel } from '@/lib/ai/client';
import { getSystemPrompt } from '@/lib/ai/prompt';
import { tools, executeToolCall } from '@/lib/ai/tools';
import { retrieveMemories } from '@/lib/ai/memory/retrieval';
import { createEmbedding } from '@/lib/ai/memory/embeddings';
import { upsertUser, getUser } from '@/lib/db/users';
import { getRecentMessages, saveMessage } from '@/lib/db/messages';
import { saveMemory, deactivateMemoryByContent, matchMemories } from '@/lib/db/memories';
import { addTask } from '@/lib/db/tasks';
import { addReminder } from '@/lib/db/reminders';
import { ensureDailyCareReminder } from '@/lib/services/care';
import { formatUserTime } from '@/lib/utils/time';
import { rateLimit } from '@/lib/utils/rateLimit';
import { needsDeepResearch, needsSearch } from '@/lib/utils/complexity';
import { logger } from '@/lib/utils/logger';

const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 25000);
const EXTRACTION_TIMEOUT_MS = 15000;
/** Лимит символов контекста для extraction (сообщение + ответ), чтобы не упереться в лимит токенов. */
const EXTRACTION_MESSAGE_MAX = 3000;
const EXTRACTION_REPLY_MAX = 2000;
/** Порог similarity для «дубликат памяти» — не сохраняем, если уже есть очень похожая. */
const MEMORY_DUPLICATE_THRESHOLD = 0.98;
/** Порог similarity для деактивации по сходству (найти запись и деактивировать). */
const MEMORY_DEACTIVATE_THRESHOLD = 0.9;

const EXTRACTION_SYSTEM_PROMPT = `Ты извлекаешь из диалога данные для сохранения. Ответь ТОЛЬКО валидным JSON без markdown, без комментариев.
Формат:
{
  "memories_to_add": [{"content": "строка", "memory_type": "event"|"temporary", "importance": 0.5, "expires_at": null}],
  "memories_to_deactivate": ["точный текст памяти для деактивации"],
  "tasks_to_add": [{"title": "строка", "description": null, "due_date": null, "priority": "medium"}],
  "reminders_to_add": [{"message": "строка", "trigger_at": "ISO8601 с таймзоной", "repeat_pattern": null}]
}
Правила: memory_type temporary — для симптомов/болезни; при "выздоровел" добавь content в memories_to_deactivate. trigger_at и due_date только в ISO 8601 (например 2026-01-29T10:00:00+03:00), иначе null. Пустые массивы — [].`;

/**
 * Определяет, похоже ли сообщение на запрос напоминания.
 */
function isReminderIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  const hasReminderVerb = /(напомни|напоминани|постав(ь|ьте)\s+напоминани|будильник)/i.test(normalized);
  const hasTimeHint = /(завтра|послезавтра|утром|вечером|\bв\s?\d{1,2}(:\d{2})?)/i.test(normalized);
  const hasRoutineHint = /(каждый день|ежедневно|каждое утро|каждый вечер|по будням|по выходным|рутин)/i.test(
    normalized
  );
  return hasReminderVerb || hasTimeHint || hasRoutineHint;
}

/**
 * Проверяет, нужно ли показать список напоминаний.
 */
function isListRemindersIntent(text: string, lastAssistantMessage: string | null): boolean {
  const normalized = text.toLowerCase().trim();
  if (/спис(ок|ка)\s+напоминан|покажи\s+напоминан|проверь\s+напоминан|напоминани(я|е)\s+есть/i.test(normalized)) {
    return true;
  }
  if (/^(да|давай|ок|ага)$/i.test(normalized) && lastAssistantMessage) {
    return /(список|проверить|list_reminders|напоминани)/i.test(lastAssistantMessage.toLowerCase());
  }
  return false;
}

type ToolResponse = {
  name: string;
  args: Record<string, any>;
  result: Record<string, any>;
};

/**
 * Пытается сформировать ответ без повторного вызова LLM.
 */
function buildToolResponse(
  toolResponses: ToolResponse[],
  timeZone: string
): { reply: string; skipModel: boolean } | null {
  if (toolResponses.length === 0) return null;

  const errorResponse = toolResponses.find((item) => item.result?.error);
  if (errorResponse) {
    const error = String(errorResponse.result.error || '');
    if (error === 'INVALID_TRIGGER_AT') {
      return {
        reply: 'Я не понял точное время. Укажи его явно, например: "завтра в 08:00".',
        skipModel: true,
      };
    }
    if (error === 'UNSUPPORTED_REPEAT_PATTERN') {
      return {
        reply: 'Для будней/выходных укажи конкретные дни или частоту (например: "каждый понедельник").',
        skipModel: true,
      };
    }
    if (error === 'REMINDER_SAVE_FAILED') {
      return {
        reply: 'Не удалось сохранить напоминание. Давай повторим еще раз.',
        skipModel: true,
      };
    }
    return { reply: 'Возникла ошибка при выполнении действия. Попробуй еще раз.', skipModel: true };
  }

  const listTool = toolResponses.find((item) => item.name === 'list_reminders');
  if (listTool) {
    const reminders = (listTool.result?.reminders || []) as Array<{
      trigger_at?: string;
      message?: string;
      repeat_pattern?: string | null;
    }>;
    if (!reminders.length) {
      return { reply: 'Список напоминаний пуст. Хочешь, я создам новое?', skipModel: true };
    }
    const lines = reminders.map((reminder) => {
      const when = reminder.trigger_at ? formatUserTime(timeZone, new Date(reminder.trigger_at)) : 'без времени';
      const repeatLabel = reminder.repeat_pattern
        ? `, повтор: ${mapRepeatLabel(reminder.repeat_pattern)}`
        : '';
      return `- ${when} — ${reminder.message || 'напоминание'}${repeatLabel}`;
    });
    return { reply: `Вот твои напоминания:\n${lines.join('\n')}`, skipModel: true };
  }

  const addTool = toolResponses.find((item) => item.name === 'add_reminder');
  if (addTool) {
    const triggerAt = String(addTool.args.trigger_at || '');
    const message = String(addTool.args.message || 'напоминание');
    const repeatPattern = String(addTool.args.repeat_pattern || '');
    const when = triggerAt ? formatUserTime(timeZone, new Date(triggerAt)) : 'в ближайшее время';
    const repeatLabel = repeatPattern ? `, повтор: ${mapRepeatLabel(repeatPattern)}` : '';
    return {
      reply: `Ок, напоминание создано: ${when} — ${message}${repeatLabel}.`,
      skipModel: true,
    };
  }

  const searchTool = toolResponses.find((item) => item.name === 'search_web');
  if (searchTool) {
    const result = searchTool.result;
    if (result?.fallback === true && result?.content) {
      const content = String(result.content).trim();
      if (content) return { reply: content, skipModel: true };
    }
    const results = (result?.results || []) as Array<{ title?: string; content?: string; url?: string }>;
    if (results.length > 0) {
      const lines = results.slice(0, 3).map((r) => {
        const title = r.title || 'Без названия';
        const snippet = (r.content || '').slice(0, 200).trim();
        return snippet ? `${title}\n${snippet}` : title;
      });
      return { reply: lines.join('\n\n'), skipModel: true };
    }
    return {
      reply: 'Не удалось найти информацию по запросу. Попробуй переформулировать.',
      skipModel: true,
    };
  }

  return null;
}

function mapRepeatLabel(pattern: string): string {
  if (pattern === 'daily') return 'ежедневно';
  if (pattern === 'weekly') return 'еженедельно';
  if (pattern === 'monthly') return 'ежемесячно';
  return pattern;
}

/**
 * Удаляет сырые теги function_results/result/function из ответа LLM.
 */
function sanitizeReply(text: string): string {
  if (!text?.trim()) return text;
  let out = text
    .replace(/<\/?function_results>/gi, '')
    .replace(/<\/?result>/gi, '')
    .replace(/<\/?function>/gi, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out || text.trim();
}

function safeJsonParse(value: string): Record<string, any> {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

/**
 * Выполняет промис с таймаутом.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: запрос к LLM превысил лимит времени')), timeoutMs);
    }),
  ]);
}

/** Лимит длины сообщения от пользователя (ввод с клавиатуры). */
const USER_MESSAGE_MAX_LENGTH = 2000;
/** Лимит для длинных сообщений (документ/фото): обрезка перед отправкой в LLM. */
const LONG_MESSAGE_MAX_LENGTH = 32_000;
/** Максимальная длина одного ответа в Telegram. */
const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;

/**
 * Экранирует символы для Telegram HTML parse_mode.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Конвертирует **bold** в <b>bold</b> с экранированием остального текста.
 */
function formatInline(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

/**
 * Преобразует Markdown-подобный текст в Telegram HTML:
 * - заголовки ^#{1,6} ... → <b>...</b>
 * - маркеры списка - или * в начале строки → •
 * - **bold** → <b>bold</b>
 */
function formatForTelegram(text: string): string {
  if (!text?.trim()) return text;
  const lines = text.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      out.push('<b>' + formatInline(headingMatch[1].trim()) + '</b>');
      continue;
    }
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      out.push('• ' + formatInline(bulletMatch[1].trim()));
      continue;
    }
    out.push(formatInline(trimmed || line));
  }
  return out.join('\n');
}

/**
 * Разбивает длинный текст на части и отправляет каждую отдельным сообщением (HTML).
 * Режет по границе абзаца (\n\n) или строки (\n), если возможно.
 */
async function sendLongMessage(ctx: Context, text: string): Promise<void> {
  const max = TELEGRAM_MESSAGE_MAX_LENGTH;
  if (!text?.trim()) return;
  const formatted = formatForTelegram(text);
  if (formatted.length <= max) {
    await ctx.reply(formatted, { parse_mode: 'HTML' });
    return;
  }
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= max) {
      chunks.push(rest);
      break;
    }
    const slice = rest.slice(0, max);
    const lastBreak = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('\n'));
    const splitAt = lastBreak > max * 0.5 ? lastBreak + 1 : max;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  for (const chunk of chunks) {
    if (chunk) await ctx.reply(formatForTelegram(chunk), { parse_mode: 'HTML' });
  }
}

export type HandleTextMessageOptions = {
  /** Разрешить длинное сообщение (из документа/фото), не резать по 2000. */
  allowLongMessage?: boolean;
};

type StatusRef = { chatId: number; messageId: number };

async function sendStatus(ctx: Context, text: string): Promise<StatusRef | null> {
  try {
    const msg = await ctx.reply(text);
    if (msg?.chat?.id != null && msg.message_id != null) {
      return { chatId: msg.chat.id, messageId: msg.message_id };
    }
  } catch {
    // игнорируем ошибку отправки статуса
  }
  return null;
}

async function updateStatus(ctx: Context, status: StatusRef | null, text: string): Promise<void> {
  if (!status) return;
  try {
    await ctx.api.editMessageText(status.chatId, status.messageId, text);
  } catch {
    // игнорируем ошибку редактирования статуса
  }
}

async function finalizeStatus(ctx: Context, status: StatusRef | null): Promise<void> {
  if (!status) return;
  try {
    await ctx.api.editMessageText(status.chatId, status.messageId, 'Готово');
  } catch {
    // игнорируем
  }
}

/** Признаки «важного» контекста для extraction (здоровье, планы, задачи, память). */
function needsImportantContext(messageText: string, replyLength: number): boolean {
  const normalized = messageText.toLowerCase();
  const health =
    /здоровь|самочувств|симптом|боле|выздоровел|хроническ|рефлюкс|горло|живот|голова/i.test(normalized);
  const plans = /план|задач|напомин|запомни|сделать|сделаю|надо/i.test(normalized);
  return health || plans || replyLength > 500;
}

type ExtractionPayload = {
  memories_to_add?: Array<{
    content: string;
    memory_type?: string;
    importance?: number;
    expires_at?: string | null;
  }>;
  memories_to_deactivate?: string[];
  tasks_to_add?: Array<{
    title: string;
    description?: string | null;
    due_date?: string | null;
    priority?: string;
  }>;
  reminders_to_add?: Array<{
    message: string;
    trigger_at: string;
    repeat_pattern?: string | null;
  }>;
};

function isValidIsoDateTime(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/**
 * По результатам диалога при необходимости вызывает extraction и сохраняет память/задачи/напоминания.
 */
async function maybePersistArtifacts(
  userId: number,
  timeZone: string,
  messageText: string,
  botReply: string
): Promise<void> {
  if (!needsImportantContext(messageText, botReply.length)) return;

  const truncatedMessage =
    messageText.length > EXTRACTION_MESSAGE_MAX
      ? messageText.slice(0, EXTRACTION_MESSAGE_MAX) + '…'
      : messageText;
  const truncatedReply =
    botReply.length > EXTRACTION_REPLY_MAX ? botReply.slice(0, EXTRACTION_REPLY_MAX) + '…' : botReply;

  try {
    const response = await withTimeout(
      openRouter.chat.completions.create({
        model: defaultChatModel,
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Таймзона пользователя: ${timeZone}. Сообщение пользователя:\n${truncatedMessage}\n\nОтвет ассистента:\n${truncatedReply}`,
          },
        ],
        max_tokens: 2048,
        temperature: 0.1,
      }),
      EXTRACTION_TIMEOUT_MS
    );
    const raw = response.choices[0]?.message?.content?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const payload: ExtractionPayload = jsonMatch ? safeJsonParse(jsonMatch[0]) : {};

    const memoriesToAdd = payload.memories_to_add || [];
    for (const m of memoriesToAdd) {
      const content = String(m.content || '').trim();
      if (!content) continue;
      const embedding = await createEmbedding(content);
      if (!embedding.length) continue;
      const existing = await matchMemories({
        userId,
        embedding,
        matchCount: 1,
        similarityThreshold: MEMORY_DUPLICATE_THRESHOLD,
      });
      if (existing.length > 0) continue;
      await saveMemory({
        user_id: userId,
        content,
        memory_type: m.memory_type || 'event',
        importance: m.importance ?? 0.5,
        expires_at: m.expires_at ?? null,
        embedding,
      });
    }

    const toDeactivate = payload.memories_to_deactivate || [];
    for (const content of toDeactivate) {
      const s = String(content || '').trim();
      if (!s) continue;
      const embedding = await createEmbedding(s);
      if (!embedding.length) {
        await deactivateMemoryByContent(userId, s);
        continue;
      }
      const similar = await matchMemories({
        userId,
        embedding,
        matchCount: 3,
        similarityThreshold: MEMORY_DEACTIVATE_THRESHOLD,
      });
      for (const match of similar) {
        await deactivateMemoryByContent(userId, match.content);
      }
      if (similar.length === 0) await deactivateMemoryByContent(userId, s);
    }

    const tasksToAdd = payload.tasks_to_add || [];
    for (const t of tasksToAdd) {
      const title = String(t.title || '').trim();
      if (!title) continue;
      await addTask({
        user_id: userId,
        title,
        description: t.description ?? null,
        due_date: isValidIsoDateTime(String(t.due_date || '')) ? t.due_date! : null,
        priority: (t.priority as 'low' | 'medium' | 'high') || 'medium',
      });
    }

    const remindersToAdd = payload.reminders_to_add || [];
    for (const r of remindersToAdd) {
      const message = String(r.message || '').trim();
      const triggerAt = String(r.trigger_at || '').trim();
      if (!message || !isValidIsoDateTime(triggerAt)) continue;
      await addReminder({
        user_id: userId,
        message,
        trigger_at: triggerAt,
        repeat_pattern: r.repeat_pattern ?? null,
      });
    }
  } catch (err) {
    logger.error({ err, userId }, 'Ошибка extraction/persist артефактов');
  }
}

/**
 * Обработка текстового сообщения пользователя.
 */
export async function handleTextMessage(
  ctx: Context,
  messageText: string,
  options?: HandleTextMessageOptions
): Promise<void> {
  const user = ctx.from;
  if (!user?.id) {
    logger.error('Не удалось получить информацию о пользователе');
    return;
  }

  const maxLength = options?.allowLongMessage ? LONG_MESSAGE_MAX_LENGTH : USER_MESSAGE_MAX_LENGTH;
  if (messageText.length > maxLength) {
    if (options?.allowLongMessage) {
      messageText = messageText.slice(0, LONG_MESSAGE_MAX_LENGTH);
    } else {
      await ctx.reply('Сообщение слишком длинное. Сократи текст и повтори.');
      return;
    }
  }

  const telegramId = user.id;
  logger.info({ userId: telegramId, messageLength: messageText.length }, 'Получено сообщение');
  const startedAtMs = Date.now();

  const limiter = rateLimit(`user:${telegramId}`, { maxTokens: 5, refillPerSecond: 1 });
  if (!limiter.allowed) {
    await ctx.reply(`Слишком много запросов. Повтори через ${limiter.retryAfterSec} сек.`);
    return;
  }

  let status: StatusRef | null = null;
  try {
    status = await sendStatus(ctx, 'Принял запрос. Думаю...');

    await upsertUser({
      telegram_id: telegramId,
      username: user.username || null,
      first_name: user.first_name || null,
      last_name: user.last_name || null,
      is_premium: user.is_premium || false,
    });

    const userRecord = await getUser(telegramId);
    const timeZone = userRecord?.timezone || 'Europe/Moscow';
    const currentTime = formatUserTime(timeZone);
    const systemPromptBase = getSystemPrompt(user.first_name || 'Пользователь', user.username, currentTime, timeZone);
    await ensureDailyCareReminder(telegramId, timeZone);

    const historyMessages = await getRecentMessages(telegramId, 10);
    const lastAssistantMessage =
      [...historyMessages].find((item) => item.role === 'assistant')?.content || null;
    let memorySnippets: string[] = [];
    try {
      memorySnippets = await retrieveMemories(telegramId, messageText);
    } catch (memoryError) {
      logger.error({ memoryError, userId: telegramId }, 'Ошибка при извлечении памяти');
    }
    const memoryBlock = memorySnippets.length ? `\n# MEMORY\n${memorySnippets.map((m) => `- ${m}`).join('\n')}` : '';

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    messages.push({ role: 'system', content: systemPromptBase + memoryBlock });

    if (historyMessages.length > 0) {
      const reversedHistory = [...historyMessages].reverse();
      for (const msg of reversedHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: 'user', content: messageText });
    await saveMessage({ user_id: telegramId, role: 'user', content: messageText });

    const toolChoice: OpenAI.Chat.ChatCompletionToolChoiceOption = isListRemindersIntent(
      messageText,
      lastAssistantMessage
    )
      ? ({ type: 'function', function: { name: 'list_reminders' } } as const)
      : isReminderIntent(messageText)
        ? ({ type: 'function', function: { name: 'add_reminder' } } as const)
        : needsDeepResearch(messageText)
          ? ({ type: 'function', function: { name: 'deep_research' } } as const)
          : needsSearch(messageText)
            ? ({ type: 'function', function: { name: 'search_web' } } as const)
            : 'auto';

    const response = await withTimeout(
      openRouter.chat.completions.create({
        model: defaultChatModel,
        messages,
        tools,
        tool_choice: toolChoice,
      }),
      OPENROUTER_TIMEOUT_MS
    );
    logger.info(
      { userId: telegramId, durationMs: Date.now() - startedAtMs },
      'Ответ от модели получен'
    );

    let assistantMessage = response.choices[0]?.message;
    if (assistantMessage?.tool_calls?.length) {
      const toolNames = assistantMessage.tool_calls.map((t) => t.function.name).join(', ');
      await updateStatus(ctx, status, `Выполняю инструменты: ${toolNames}...`);

      const toolResponses: ToolResponse[] = [];
      logger.info(
        { userId: telegramId, toolCalls: assistantMessage.tool_calls.map((t) => t.function.name) },
        'Модель запросила инструменты'
      );
      for (const toolCall of assistantMessage.tool_calls) {
        const toolResult = await executeToolCall(toolCall, { userId: telegramId });
        messages.push({
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
        });
        toolResponses.push({
          name: toolCall.function.name,
          args: safeJsonParse(toolCall.function.arguments || '{}'),
          result: safeJsonParse(toolResult),
        });
      }

      const directResponse = buildToolResponse(toolResponses, timeZone);
      if (directResponse?.skipModel) {
        try {
          await updateStatus(ctx, status, 'Отправляю ответ...');
          await sendLongMessage(ctx, directResponse.reply);
          logger.info({ userId: telegramId }, 'Ответ пользователю отправлен');
        } catch (replyError) {
          logger.error({ replyError, userId: telegramId }, 'Не удалось отправить ответ пользователю');
        }
        await saveMessage({ user_id: telegramId, role: 'assistant', content: directResponse.reply });
        await updateStatus(ctx, status, 'Записываю в память/задачи/напоминания...');
        await maybePersistArtifacts(telegramId, timeZone, messageText, directResponse.reply);
        await finalizeStatus(ctx, status);
        return;
      }

      await updateStatus(ctx, status, 'Формирую итоговый ответ...');
      const secondResponse = await withTimeout(
        openRouter.chat.completions.create({
          model: defaultChatModel,
          messages,
          tool_choice: 'none',
        }),
        OPENROUTER_TIMEOUT_MS
      );
      logger.info(
        { userId: telegramId, durationMs: Date.now() - startedAtMs },
        'Ответ от модели после tool calls получен'
      );
      assistantMessage = secondResponse.choices[0]?.message;
    }

    const rawReply = assistantMessage?.content || 'Ошибка при получении ответа от AI';
    const botReply = sanitizeReply(rawReply);

    try {
      await updateStatus(ctx, status, 'Отправляю ответ...');
      await sendLongMessage(ctx, botReply);
      logger.info({ userId: telegramId }, 'Ответ пользователю отправлен');
    } catch (replyError) {
      logger.error({ replyError, userId: telegramId }, 'Не удалось отправить ответ пользователю');
    }
    await saveMessage({ user_id: telegramId, role: 'assistant', content: botReply });
    await updateStatus(ctx, status, 'Записываю в память/задачи/напоминания...');
    await maybePersistArtifacts(telegramId, timeZone, messageText, botReply);
    await finalizeStatus(ctx, status);
  } catch (error) {
    logger.error(
      { err: error, userId: telegramId, model: defaultChatModel, timeoutMs: OPENROUTER_TIMEOUT_MS },
      'Ошибка при обработке сообщения'
    );
    await updateStatus(ctx, status, 'Ошибка при обработке запроса');
    let errorMessage = 'Произошла ошибка при обработке вашего сообщения. Попробуйте позже.';
    if (error instanceof Error && error.message.includes('Timeout')) {
      errorMessage = 'Запрос занял слишком много времени. Попробуйте позже.';
    }
    try {
      await ctx.reply(errorMessage);
      logger.info({ userId: telegramId }, 'Сообщение об ошибке отправлено пользователю');
    } catch (replyError) {
      logger.error({ replyError, userId: telegramId }, 'Не удалось отправить сообщение об ошибке пользователю');
    }
  }
}

