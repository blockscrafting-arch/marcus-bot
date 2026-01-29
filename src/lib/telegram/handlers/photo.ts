import { Context } from 'grammy';
import { analyzeImage } from '@/lib/services/vision';
import { handleTextMessage } from '@/lib/telegram/handlers/text';
import { logger } from '@/lib/utils/logger';

const PHOTO_ERROR_PREFIXES = [
  'Не удалось описать',
  'Не удалось распознать',
  'Ошибка при анализе',
  'Изображение слишком',
  'сервис занят',
];

/**
 * Обработка фото: анализ через vision-модель, затем ответ как на текстовое сообщение.
 */
export async function handlePhotoMessage(ctx: Context): Promise<void> {
  const photo = ctx.message?.photo;
  const caption = ctx.message?.caption?.trim() || '';

  if (!photo?.length) return;

  const userId = ctx.from?.id;
  const largest = photo[photo.length - 1];
  logger.info(
    { userId, fileSize: largest?.file_size, captionLength: caption.length },
    'Обработка фото: начало'
  );

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token) {
      logger.warn({ userId }, 'Фото: нет TELEGRAM_BOT_TOKEN');
      await ctx.reply('Сервис не настроен.');
      return;
    }

    const file = await ctx.getFile();
    const filePath = file.file_path;
    if (!filePath) {
      logger.warn({ userId }, 'Фото: нет file_path');
      await ctx.reply('Не удалось получить фото.');
      return;
    }

    const imageUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const description = await analyzeImage(imageUrl, caption || undefined);

    const isErrorReply =
      !description ||
      PHOTO_ERROR_PREFIXES.some((p) => description.trim().toLowerCase().startsWith(p.toLowerCase()));

    if (isErrorReply) {
      logger.warn({ userId, description: description?.slice(0, 100) }, 'Фото: vision вернул ошибку или пусто');
      await ctx.reply(description?.trim() || 'Не удалось разобрать изображение. Попробуй ещё раз.');
      return;
    }

    logger.info({ userId }, 'Обработка фото: описание получено, передаю в handleTextMessage');

    const textForModel = caption
      ? `[Пользователь прислал фото. Подпись: "${caption}". Описание изображения: ${description}]`
      : `[Пользователь прислал фото. Описание изображения: ${description}]`;

    await handleTextMessage(ctx, textForModel);
  } catch (error) {
    logger.error(
      { userId, error: error instanceof Error ? error.message : String(error) },
      'Ошибка обработки фото'
    );
    await ctx.reply('Ошибка при обработке фото. Попробуй ещё раз.');
  }
}
