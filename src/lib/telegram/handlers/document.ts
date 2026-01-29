import { Context } from 'grammy';
import { extractDocumentText } from '@/lib/services/documents';
import { handleTextMessage } from '@/lib/telegram/handlers/text';
import { logger } from '@/lib/utils/logger';

/**
 * Обработка документов: извлечение текста (PDF, DOCX, TXT, CSV), затем ответ как на текстовое сообщение.
 */
export async function handleDocumentMessage(ctx: Context): Promise<void> {
  const doc = ctx.message?.document;
  if (!doc) return;

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token) {
      await ctx.reply('Сервис не настроен.');
      return;
    }

    const file = await ctx.getFile();
    const filePath = file.file_path;
    if (!filePath) {
      await ctx.reply('Не удалось получить файл.');
      return;
    }

    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const response = await fetch(url);
    if (!response.ok) {
      await ctx.reply('Не удалось скачать документ.');
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const mimeType = doc.mime_type ?? undefined;
    const fileName = doc.file_name ?? undefined;

    const text = await extractDocumentText(buffer, mimeType, fileName);
    if (!text) {
      await ctx.reply('В документе не удалось извлечь текст или он пустой.');
      return;
    }

    const messageForModel = `[Пользователь прислал документ "${fileName || 'файл'}". Содержимое:\n\n${text.slice(0, 30000)}]`;
    await handleTextMessage(ctx, messageForModel, { allowLongMessage: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка при обработке документа.';
    logger.error({ error }, 'Ошибка обработки документа');
    await ctx.reply(message);
  }
}
