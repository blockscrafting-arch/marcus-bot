import { Context } from 'grammy';
import { analyzeImages } from '@/lib/services/vision';
import { handleTextMessage } from '@/lib/telegram/handlers/text';
import { logger } from '@/lib/utils/logger';
import { getMediaGroup, markMediaGroupProcessed, upsertMediaGroup } from '@/lib/db/media-groups';

const PHOTO_ERROR_PREFIXES = [
  'Не удалось описать',
  'Не удалось распознать',
  'Ошибка при анализе',
  'Изображение слишком',
  'сервис занят',
];
const MEDIA_GROUP_WAIT_MS = 1200;

/**
 * Обработка фото: анализ через vision-модель, затем ответ как на текстовое сообщение.
 */
export async function handlePhotoMessage(ctx: Context): Promise<void> {
  const photo = ctx.message?.photo;
  const caption = ctx.message?.caption?.trim() || '';
  const mediaGroupId = ctx.message?.media_group_id;

  if (!photo?.length) return;

  const userId = ctx.from?.id;
  const largest = photo[photo.length - 1];
  logger.info(
    { userId, fileSize: largest?.file_size, captionLength: caption.length, mediaGroupId },
    'Обработка фото: начало'
  );

  try {
    if (!userId) {
      logger.warn('Фото: не удалось определить user_id');
      return;
    }
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token) {
      logger.warn({ userId }, 'Фото: нет TELEGRAM_BOT_TOKEN');
      await ctx.reply('Сервис не настроен.');
      return;
    }

    const fileId = largest?.file_id;
    if (!fileId) {
      logger.warn({ userId }, 'Фото: нет file_id');
      await ctx.reply('Не удалось получить фото.');
      return;
    }

    if (mediaGroupId) {
      const stored = await upsertMediaGroup(mediaGroupId, userId, fileId, caption || undefined);
      if (!stored) {
        await ctx.reply('Не удалось обработать альбом. Попробуй ещё раз.');
        return;
      }
      if (stored.processed_at) return;

      await new Promise((resolve) => setTimeout(resolve, MEDIA_GROUP_WAIT_MS));

      const claimed = await markMediaGroupProcessed(mediaGroupId);
      if (!claimed) return;

      const group = await getMediaGroup(mediaGroupId);
      const rawFileIds = Array.isArray(group?.file_ids) ? group?.file_ids : [];
      const uniqueFileIds = Array.from(new Set(rawFileIds));
      if (!uniqueFileIds.length) {
        logger.warn({ userId, mediaGroupId }, 'Альбом пустой или без file_id');
        await ctx.reply('Не удалось получить фото из альбома.');
        return;
      }

      const imageUrls: string[] = [];
      for (const id of uniqueFileIds) {
        const file = await ctx.api.getFile(id);
        if (!file.file_path) continue;
        imageUrls.push(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      }
      if (!imageUrls.length) {
        logger.warn({ userId, mediaGroupId }, 'Альбом: не удалось построить URL для фото');
        await ctx.reply('Не удалось получить фото из альбома.');
        return;
      }

      const groupCaption = (group?.caption || caption || '').trim();
      const description = await analyzeImages(imageUrls, groupCaption || undefined);

      const isErrorReply =
        !description ||
        PHOTO_ERROR_PREFIXES.some((p) => description.trim().toLowerCase().startsWith(p.toLowerCase()));

      if (isErrorReply) {
        logger.warn({ userId, description: description?.slice(0, 100) }, 'Фото: vision вернул ошибку или пусто');
        await ctx.reply(description?.trim() || 'Не удалось разобрать изображение. Попробуй ещё раз.');
        return;
      }

      logger.info({ userId, mediaGroupId, count: imageUrls.length }, 'Обработка альбома: описание получено');

      const textForModel = groupCaption
        ? `[Пользователь прислал ${imageUrls.length} фото. Подпись: "${groupCaption}". Описание изображений: ${description}]`
        : `[Пользователь прислал ${imageUrls.length} фото. Описание изображений: ${description}]`;

      await handleTextMessage(ctx, textForModel);
      return;
    }

    const file = await ctx.api.getFile(fileId);
    const filePath = file.file_path;
    if (!filePath) {
      logger.warn({ userId }, 'Фото: нет file_path');
      await ctx.reply('Не удалось получить фото.');
      return;
    }

    const imageUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const description = await analyzeImages([imageUrl], caption || undefined);

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
