import { createEmbedding } from '@/lib/ai/memory/embeddings';
import { matchMemories } from '@/lib/db/memories';

/**
 * Возвращает релевантные воспоминания по текстовому запросу.
 */
export async function retrieveMemories(userId: number, query: string): Promise<string[]> {
  const embedding = await createEmbedding(query);
  if (!embedding.length) return [];
  const matches = await matchMemories({
    userId,
    embedding,
    matchCount: 5,
    similarityThreshold: 0.75,
  });
  return matches.map((m) => m.content);
}

