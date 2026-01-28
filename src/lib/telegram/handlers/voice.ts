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

  try {
    const file = await ctx.getFile();
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token || !file.file_path) {
      await ctx.reply('Не удалось получить голосовое сообщение.');
      return;
    }
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const text = await transcribeVoice(url);
    if (!text) {
      await ctx.reply('Не удалось распознать голос. Попробуйте еще раз.');
      return;
    }
    await handleTextMessage(ctx, text);
  } catch (error) {
    logger.error({ error }, 'Ошибка обработки голосового сообщения');
    await ctx.reply('Ошибка при обработке голосового сообщения.');
  }
}

