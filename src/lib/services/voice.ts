import { logger } from '@/lib/utils/logger';

const GROQ_WHISPER_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo';
const MAX_FILE_BYTES = 24 * 1024 * 1024; // 24 MB
const TRANSCRIBE_TIMEOUT_MS = 30_000;

/**
 * Преобразует голосовое сообщение в текст через Groq Whisper API.
 * OpenRouter не поддерживает audio.transcriptions — используем Groq напрямую.
 */
export async function transcribeVoice(telegramFileUrl: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    logger.error('GROQ_API_KEY не задан');
    throw new Error('Сервис транскрипции не настроен');
  }

  const response = await fetch(telegramFileUrl);
  if (!response.ok) {
    logger.error({ status: response.status, url: telegramFileUrl }, 'Не удалось скачать голосовое');
    throw new Error('Не удалось скачать голосовое сообщение');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.length > MAX_FILE_BYTES) {
    logger.warn({ size: buffer.length }, 'Голосовое сообщение слишком большое');
    throw new Error('Голосовое сообщение слишком длинное. Максимум ~1 минута.');
  }

  const blob = new Blob([buffer], { type: 'audio/ogg' });
  const formData = new FormData();
  formData.append('file', blob, 'voice.ogg');
  formData.append('model', GROQ_WHISPER_MODEL);
  formData.append('response_format', 'json');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

  try {
    const transcriptionResponse = await fetch(GROQ_WHISPER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!transcriptionResponse.ok) {
      const errText = await transcriptionResponse.text();
      logger.error(
        { status: transcriptionResponse.status, body: errText },
        'Ошибка Groq Whisper API'
      );
      throw new Error('Ошибка при распознавании голоса');
    }

    const data = (await transcriptionResponse.json()) as { text?: string };
    return data.text?.trim() ?? '';
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        logger.error('Таймаут транскрипции голоса');
        throw new Error('Голосовое сообщение слишком длинное. Попробуй короче.');
      }
      throw err;
    }
    throw new Error('Ошибка при обработке голоса');
  }
}
