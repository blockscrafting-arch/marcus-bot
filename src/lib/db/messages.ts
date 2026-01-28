import { supabase } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

export type MessageRecord = {
  user_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

/**
 * Сохраняет сообщение.
 */
export async function saveMessage(record: MessageRecord): Promise<void> {
  const { error } = await supabase.from('marcus_messages').insert(record);
  if (error) {
    logger.error({ error, userId: record.user_id, role: record.role }, 'Ошибка при сохранении сообщения');
  }
}

/**
 * Возвращает последние сообщения пользователя.
 */
export async function getRecentMessages(userId: number, limit = 10): Promise<MessageRecord[]> {
  const { data, error } = await supabase
    .from('marcus_messages')
    .select('role, content')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    logger.error({ error, userId }, 'Ошибка при загрузке истории сообщений');
    return [];
  }
  return (data as MessageRecord[] | null) || [];
}
