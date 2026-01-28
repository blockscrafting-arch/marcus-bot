import { openRouter, defaultEmbeddingModel } from '@/lib/ai/client';
import { logger } from '@/lib/utils/logger';

/**
 * Создает embedding для текста.
 */
export async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openRouter.embeddings.create({
      model: defaultEmbeddingModel,
      input: text,
    });
    return response.data[0]?.embedding || [];
  } catch (error) {
    logger.error({ error }, 'Ошибка при создании embedding');
    return [];
  }
}

