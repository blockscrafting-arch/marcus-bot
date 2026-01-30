import { supabase } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

export type ProactiveStateRecord = {
  user_id: number;
  last_sent_at?: string | null;
  daily_count?: number;
  daily_date?: string | null;
  next_scheduled_at?: string | null;
  last_topic?: string | null;
  last_message_hash?: string | null;
  updated_at?: string;
};

/**
 * Возвращает состояние проактивности пользователя.
 */
export async function getProactiveState(userId: number): Promise<ProactiveStateRecord | null> {
  const { data, error } = await supabase
    .from('marcus_proactive_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logger.error({ error, userId }, 'Ошибка при загрузке proactive_state');
    return null;
  }
  return (data as ProactiveStateRecord | null) || null;
}

/**
 * Обновляет состояние проактивности (upsert по user_id).
 */
export async function upsertProactiveState(
  userId: number,
  patch: Partial<Omit<ProactiveStateRecord, 'user_id'>>
): Promise<void> {
  const payload = {
    user_id: userId,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('marcus_proactive_state').upsert(payload, {
    onConflict: 'user_id',
  });
  if (error) {
    logger.error({ error, userId }, 'Ошибка при обновлении proactive_state');
  }
}

/**
 * Сбрасывает daily_count, если daily_date не совпадает с текущей датой (MSK).
 */
export async function resetDailyCountIfNeeded(userId: number, now: Date): Promise<void> {
  const tz = 'Europe/Moscow';
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = formatter.format(now).replace(/\//g, '-'); // YYYY-MM-DD
  const state = await getProactiveState(userId);
  if (!state) return;
  const stateDate = state.daily_date ?? '';
  if (stateDate !== today) {
    await upsertProactiveState(userId, { daily_count: 0, daily_date: today });
  }
}

/**
 * Планирует следующее проактивное сообщение: next_scheduled_at = now + случайный интервал [minHours, maxHours].
 */
export async function scheduleNext(
  userId: number,
  now: Date,
  minHours: number,
  maxHours: number
): Promise<void> {
  const minMs = minHours * 60 * 60 * 1000;
  const maxMs = maxHours * 60 * 60 * 1000;
  const jitterMs = minMs + Math.random() * (maxMs - minMs);
  const nextAt = new Date(now.getTime() + jitterMs);
  await upsertProactiveState(userId, { next_scheduled_at: nextAt.toISOString() });
}
