import { supabase } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

export type ReminderRecord = {
  id?: string;
  user_id: number;
  message: string;
  trigger_at: string;
  repeat_pattern?: string | null;
  sent?: boolean;
};

/**
 * Создает напоминание.
 */
export async function addReminder(
  reminder: ReminderRecord
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('marcus_reminders').insert({
    user_id: reminder.user_id,
    message: reminder.message,
    trigger_at: reminder.trigger_at,
    repeat_pattern: reminder.repeat_pattern || null,
    sent: reminder.sent ?? false,
  });
  if (error) {
    logger.error({ error, userId: reminder.user_id }, 'Ошибка при создании напоминания');
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Возвращает просроченные напоминания для отправки.
 */
export async function getDueReminders(nowIso: string): Promise<ReminderRecord[]> {
  const { data, error } = await supabase
    .from('marcus_reminders')
    .select('*')
    .lte('trigger_at', nowIso)
    .eq('sent', false);
  if (error) {
    logger.error({ error }, 'Ошибка при загрузке напоминаний');
    return [];
  }
  return (data as ReminderRecord[] | null) || [];
}

/**
 * Помечает напоминание как отправленное.
 */
export async function markReminderSent(id: string): Promise<void> {
  const { error } = await supabase.from('marcus_reminders').update({ sent: true }).eq('id', id);
  if (error) {
    logger.error({ error, reminderId: id }, 'Ошибка при обновлении статуса напоминания');
  }
}

/**
 * Возвращает ближайшие напоминания пользователя.
 */
export async function listUpcomingReminders(userId: number, limit = 5): Promise<ReminderRecord[]> {
  const { data, error } = await supabase
    .from('marcus_reminders')
    .select('*')
    .eq('user_id', userId)
    .gte('trigger_at', new Date().toISOString())
    .order('trigger_at', { ascending: true })
    .limit(limit);
  if (error) {
    logger.error({ error, userId }, 'Ошибка при загрузке напоминаний пользователя');
    return [];
  }
  return (data as ReminderRecord[] | null) || [];
}

/**
 * Ищет напоминание по точному тексту сообщения.
 */
export async function findReminderByMessage(
  userId: number,
  message: string,
  repeatPattern?: string
): Promise<ReminderRecord | null> {
  let query = supabase
    .from('marcus_reminders')
    .select('*')
    .eq('user_id', userId)
    .eq('message', message)
    .eq('sent', false);
  if (repeatPattern) {
    query = query.eq('repeat_pattern', repeatPattern);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    logger.error({ error, userId }, 'Ошибка при поиске напоминания');
    return null;
  }
  return (data as ReminderRecord) || null;
}

