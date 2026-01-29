import { logger } from '@/lib/utils/logger';

const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_EXTRACTED_CHARS = 50_000; // обрезка для контекста LLM

/**
 * Извлекает текст из PDF-буфера.
 */
async function extractPdf(buffer: Buffer): Promise<string> {
  try {
    const mod = await import('pdf-parse');
    const fn: (b: Buffer) => Promise<{ text?: string }> =
      (mod as { default?: (b: Buffer) => Promise<{ text?: string }> }).default ?? (mod as unknown as (b: Buffer) => Promise<{ text?: string }>);
    const data = await fn(buffer);
    return (data?.text ?? '').trim().slice(0, MAX_EXTRACTED_CHARS);
  } catch (err) {
    logger.error({ err }, 'Ошибка парсинга PDF');
    throw new Error('Не удалось извлечь текст из PDF.');
  }
}

/**
 * Извлекает текст из DOCX-буфера.
 */
async function extractDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return (result.value ?? '').trim().slice(0, MAX_EXTRACTED_CHARS);
  } catch (err) {
    logger.error({ err }, 'Ошибка парсинга DOCX');
    throw new Error('Не удалось извлечь текст из DOCX.');
  }
}

/**
 * Декодирует буфер как UTF-8 текст (TXT, CSV и т.п.).
 */
function extractText(buffer: Buffer): string {
  try {
    return buffer.toString('utf-8').trim().slice(0, MAX_EXTRACTED_CHARS);
  } catch {
    throw new Error('Не удалось прочитать текст из файла.');
  }
}

const MIME_TO_EXTRACTOR: Record<string, (buf: Buffer) => Promise<string>> = {
  'application/pdf': extractPdf,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': extractDocx,
};

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  csv: 'text/csv',
};

/**
 * Извлекает текст из документа по MIME или расширению файла.
 * Поддерживает: PDF, DOCX, TXT, CSV.
 */
export async function extractDocumentText(
  buffer: Buffer,
  mimeType?: string | null,
  fileName?: string | null
): Promise<string> {
  if (buffer.length > MAX_DOC_BYTES) {
    throw new Error(`Файл слишком большой. Максимум ${MAX_DOC_BYTES / 1024 / 1024} MB.`);
  }

  const mime = (mimeType || '').toLowerCase().split(';')[0].trim();
  const ext = fileName ? fileName.split('.').pop()?.toLowerCase() : '';

  const effectiveMime = mime || (ext ? EXT_TO_MIME[ext] : '');

  if (effectiveMime === 'application/pdf' || ext === 'pdf') {
    return extractPdf(buffer);
  }
  if (
    effectiveMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'docx'
  ) {
    return extractDocx(buffer);
  }
  if (effectiveMime === 'application/msword' || ext === 'doc') {
    throw new Error(
      'Формат .doc (старый Word) не поддерживается. Сохрани файл как .docx или PDF и пришли снова.'
    );
  }
  if (
    effectiveMime === 'text/plain' ||
    effectiveMime === 'text/csv' ||
    ext === 'txt' ||
    ext === 'csv'
  ) {
    return extractText(buffer);
  }

  throw new Error(
    `Формат не поддерживается. Поддерживаются: PDF, DOCX, TXT, CSV. Получено: ${effectiveMime || ext || 'неизвестно'}.`
  );
}
