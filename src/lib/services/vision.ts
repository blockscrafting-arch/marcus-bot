import { openRouter } from '@/lib/ai/client';
import { logger } from '@/lib/utils/logger';

const VISION_MODEL = process.env.VISION_MODEL || 'google/gemini-2.0-flash-exp:free';
const VISION_TIMEOUT_MS = 30_000;

/**
 * Анализирует изображение через vision-модель и возвращает текстовое описание.
 */
export async function analyzeImage(imageUrl: string, userPrompt?: string): Promise<string> {
  const prompt =
    userPrompt?.trim() ||
    'Опиши изображение на русском: что на нём изображено, текст если есть, контекст. Кратко и по делу.';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const response = await openRouter.chat.completions.create(
      {
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 1024,
      },
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      logger.warn('Vision модель вернула пустой ответ');
      return 'Не удалось описать изображение.';
    }
    return content;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        logger.error('Таймаут анализа изображения');
        return 'Изображение слишком большое или сервис занят. Попробуй позже.';
      }
      logger.error({ err }, 'Ошибка при анализе изображения');
    }
    return 'Ошибка при анализе изображения. Попробуй позже.';
  }
}
