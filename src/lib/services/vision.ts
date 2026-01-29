import { openRouter } from '@/lib/ai/client';
import { logger } from '@/lib/utils/logger';

const VISION_MODEL = process.env.VISION_MODEL || 'google/gemini-2.0-flash-exp:free';
const VISION_TIMEOUT_MS = 30_000;

/**
 * Анализирует набор изображений через vision-модель и возвращает описание.
 */
export async function analyzeImages(imageUrls: string[], userPrompt?: string): Promise<string> {
  if (!imageUrls.length) {
    return 'Не удалось описать изображение.';
  }
  const prompt =
    userPrompt?.trim() ||
    'Опиши изображение(я) на русском: что на них изображено, текст если есть, контекст. Если изображений несколько, дай общий обзор и ключевые отличия. Кратко и по делу.';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);

  try {
    const contentParts = [
      { type: 'text', text: prompt },
      ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
    ];
    const response = await openRouter.chat.completions.create(
      {
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: contentParts,
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

/**
 * Анализирует одиночное изображение через vision-модель.
 */
export async function analyzeImage(imageUrl: string, userPrompt?: string): Promise<string> {
  return analyzeImages([imageUrl], userPrompt);
}
