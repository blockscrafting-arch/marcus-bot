import { Context } from 'grammy';
import OpenAI from 'openai';
import { openRouter, defaultChatModel } from '@/lib/ai/client';
import { getSystemPrompt } from '@/lib/ai/prompt';
import { tools, executeToolCall } from '@/lib/ai/tools';
import { retrieveMemories } from '@/lib/ai/memory/retrieval';
import { upsertUser, getUser } from '@/lib/db/users';
import { getRecentMessages, saveMessage } from '@/lib/db/messages';
import { formatUserTime } from '@/lib/utils/time';
import { rateLimit } from '@/lib/utils/rateLimit';
import { logger } from '@/lib/utils/logger';

const OPENROUTER_TIMEOUT_MS = 12000;

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

/**
 * Обработка текстового сообщения пользователя.
 */
export async function handleTextMessage(ctx: Context, messageText: string): Promise<void> {
  const user = ctx.from;
  if (!user?.id) {
    logger.error('Не удалось получить информацию о пользователе');
    return;
  }

  if (messageText.length > 2000) {
    await ctx.reply('Сообщение слишком длинное. Сократи текст и повтори.');
    return;
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

    const historyMessages = await getRecentMessages(telegramId, 10);
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

    const response = await withTimeout(
      openRouter.chat.completions.create({
        model: defaultChatModel,
        messages,
        tools,
        tool_choice: 'auto',
      }),
      OPENROUTER_TIMEOUT_MS
    );
    logger.info(
      { userId: telegramId, durationMs: Date.now() - startedAtMs },
      'Ответ от модели получен'
    );

    let assistantMessage = response.choices[0]?.message;
    if (assistantMessage?.tool_calls?.length) {
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
      }

      const secondResponse = await withTimeout(
        openRouter.chat.completions.create({
          model: defaultChatModel,
          messages,
        }),
        OPENROUTER_TIMEOUT_MS
      );
      logger.info(
        { userId: telegramId, durationMs: Date.now() - startedAtMs },
        'Ответ от модели после tool calls получен'
      );
      assistantMessage = secondResponse.choices[0]?.message;
    }

    const botReply = assistantMessage?.content || 'Ошибка при получении ответа от AI';

    await saveMessage({ user_id: telegramId, role: 'user', content: messageText });
    try {
      await ctx.reply(botReply);
      logger.info({ userId: telegramId }, 'Ответ пользователю отправлен');
    } catch (replyError) {
      logger.error({ replyError, userId: telegramId }, 'Не удалось отправить ответ пользователю');
    }
    await saveMessage({ user_id: telegramId, role: 'assistant', content: botReply });
  } catch (error) {
    logger.error({ error, userId: telegramId }, 'Ошибка при обработке сообщения');
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

