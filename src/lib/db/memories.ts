import { supabase } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

export type MemoryRecord = {
  user_id: number;
  content: string;
  memory_type?: string;
  importance?: number;
  embedding?: number[];
  expires_at?: string | null;
};

/**
 * Сохраняет память с embedding.
 */
export async function saveMemory(record: MemoryRecord): Promise<void> {
  const { error } = await supabase.from('marcus_memories').insert({
    user_id: record.user_id,
    content: record.content,
    memory_type: record.memory_type || 'event',
    importance: record.importance ?? 0.5,
    embedding: record.embedding,
    expires_at: record.expires_at ?? null,
  });
  if (error) {
    logger.error({ error, userId: record.user_id }, 'Ошибка при сохранении памяти');
  }
}

/**
 * Деактивирует память по точному совпадению content для пользователя.
 */
export async function deactivateMemoryByContent(userId: number, content: string): Promise<void> {
  const { error } = await supabase
    .from('marcus_memories')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('content', content);
  if (error) {
    logger.error({ error, userId }, 'Ошибка при деактивации памяти');
  }
}

/**
 * Ищет похожие воспоминания через pgvector.
 */
export async function matchMemories(params: {
  userId: number;
  embedding: number[];
  matchCount?: number;
  similarityThreshold?: number;
}): Promise<Array<{ content: string; similarity: number }>> {
  const { data, error } = await supabase.rpc('match_marcus_memories', {
    p_user_id: params.userId,
    p_embedding: params.embedding,
    p_match_count: params.matchCount ?? 5,
    p_similarity_threshold: params.similarityThreshold ?? 0.75,
  });
  if (error) {
    logger.error({ error, userId: params.userId }, 'Ошибка при поиске памяти');
    return [];
  }
  return (data as Array<{ content: string; similarity: number }> | null) || [];
}

