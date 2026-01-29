import { supabase } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

/**
 * Пытается пометить update_id как обработанный.
 * Возвращает false, если update_id уже был обработан.
 */
export async function tryMarkUpdateProcessed(updateId: number): Promise<boolean> {
  const { error } = await supabase.from('marcus_processed_updates').insert({ update_id: updateId });
  if (!error) return true;
  if (error.code === '23505') {
    logger.info({ updateId }, 'update_id уже обработан');
    return false;
  }
  logger.error({ error, updateId }, 'Ошибка при записи processed_updates');
  // На неизвестной ошибке продолжаем обработку, чтобы не терять апдейт.
  return true;
}

/**
 * Чистит старые обработанные update_id.
 */
export async function cleanupProcessedUpdates(olderThanDays = 7): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('marcus_processed_updates').delete().lt('processed_at', cutoff);
  if (error) {
    logger.error({ error, cutoff }, 'Ошибка при чистке processed_updates');
  }
}
