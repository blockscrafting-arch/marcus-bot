import { Context } from 'grammy';
import OpenAI from 'openai';
import { openRouter, defaultChatModel } from '@/lib/ai/client';
import { getSystemPrompt } from '@/lib/ai/prompt';
import { tools, executeToolCall } from '@/lib/ai/tools';
import { retrieveMemories } from '@/lib/ai/memory/retrieval';
import { upsertUser, getUser } from '@/lib/db/users';
import { getRecentMessages, saveMessage } from '@/lib/db/messages';
import { ensureDailyCareReminder } from '@/lib/services/care';
import { formatUserTime } from '@/lib/utils/time';
import { rateLimit } from '@/lib/utils/rateLimit';
import { needsDeepResearch, needsSearch } from '@/lib/utils/complexity';
import { logger } from '@/lib/utils/logger';

const OPENROUTER_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 25000);

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
 * Разбивает длинный текст на части и отправляет каждую отдельным сообщением.
 * Режет по границе абзаца (\n\n) или строки (\n), если возможно.
 */
async function sendLongMessage(ctx: Context, text: string): Promise<void> {
  const max = TELEGRAM_MESSAGE_MAX_LENGTH;
  if (!text?.trim()) return;
  if (text.length <= max) {
    await ctx.reply(text);
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
    if (chunk) await ctx.reply(chunk);
  }
}

export type HandleTextMessageOptions = {
  /** Разрешить длинное сообщение (из документа/фото), не резать по 2000. */
  allowLongMessage?: boolean;
};

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

  try {
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
          await sendLongMessage(ctx, directResponse.reply);
          logger.info({ userId: telegramId }, 'Ответ пользователю отправлен');
        } catch (replyError) {
          logger.error({ replyError, userId: telegramId }, 'Не удалось отправить ответ пользователю');
        }
        await saveMessage({ user_id: telegramId, role: 'assistant', content: directResponse.reply });
        return;
      }

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
      await sendLongMessage(ctx, botReply);
      logger.info({ userId: telegramId }, 'Ответ пользователю отправлен');
    } catch (replyError) {
      logger.error({ replyError, userId: telegramId }, 'Не удалось отправить ответ пользователю');
    }
    await saveMessage({ user_id: telegramId, role: 'assistant', content: botReply });
  } catch (error) {
    logger.error(
      { err: error, userId: telegramId, model: defaultChatModel, timeoutMs: OPENROUTER_TIMEOUT_MS },
      'Ошибка при обработке сообщения'
    );
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

