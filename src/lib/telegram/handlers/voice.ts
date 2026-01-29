import { Context } from 'grammy';
import { transcribeVoice } from '@/lib/services/voice';
import { handleTextMessage } from '@/lib/telegram/handlers/text';
import { logger } from '@/lib/utils/logger';

/**
 * Обработка голосовых сообщений.
 */
export async function handleVoiceMessage(ctx: Context): Promise<void> {
  const voice = ctx.message?.voice;
  if (!voice) return;

  const userId = ctx.from?.id;
  logger.info({ userId, duration: voice.duration, fileSize: voice.file_size }, 'Обработка голосового сообщения');

  try {
    const file = await ctx.getFile();
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token || !file.file_path) {
      logger.warn({ userId }, 'Голос: нет токена или file_path');
      await ctx.reply('Не удалось получить голосовое сообщение.');
      return;
    }
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const text = await transcribeVoice(url);
    if (!text) {
      logger.warn({ userId }, 'Голос: пустая транскрипция');
      await ctx.reply('Не удалось распознать голос. Попробуй ещё раз или напиши текстом.');
      return;
    }
    await handleTextMessage(ctx, text);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(
      { userId, message: err.message, name: err.name, stack: err.stack },
      'Ошибка обработки голосового сообщения'
    );
    if (err.message.includes('транскрипции не настроен')) {
      await ctx.reply('Сервис распознавания голоса не настроен. Напиши текстом.');
      return;
    }
    if (err.message.includes('Таймаут') || err.message.includes('длинное') || err.name === 'AbortError') {
      await ctx.reply('Голосовое слишком длинное или сервис занят. Попробуй короче или позже.');
      return;
    }
    await ctx.reply('Ошибка при обработке голоса. Попробуй ещё раз или напиши текстом.');
  }
}

