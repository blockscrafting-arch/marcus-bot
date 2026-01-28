import { supabase } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

export type UserRecord = {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_premium: boolean;
  timezone?: string | null;
  preferences?: Record<string, unknown> | null;
  onboarding_completed?: boolean | null;
};

/**
 * Создает/обновляет пользователя по telegram_id.
 */
export async function upsertUser(user: UserRecord): Promise<void> {
  const { error } = await supabase
    .from('marcus_users')
    .upsert(
      {
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        is_premium: user.is_premium,
        timezone: user.timezone || 'Europe/Moscow',
        preferences: user.preferences || {},
        onboarding_completed: user.onboarding_completed || false,
      },
      { onConflict: 'telegram_id' }
    );
  if (error) {
    logger.error({ error, userId: user.telegram_id }, 'Ошибка при сохранении пользователя');
  }
}

/**
 * Возвращает пользователя по telegram_id.
 */
export async function getUser(telegramId: number): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from('marcus_users')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();
  if (error) {
    logger.error({ error, userId: telegramId }, 'Ошибка при загрузке пользователя');
    return null;
  }
  return (data as UserRecord) || null;
}

/**
 * Возвращает список пользователей.
 */
export async function listUsers(): Promise<UserRecord[]> {
  const { data, error } = await supabase.from('marcus_users').select('*');
  if (error) {
    logger.error({ error }, 'Ошибка при загрузке списка пользователей');
    return [];
  }
  return (data as UserRecord[] | null) || [];
}

/**
 * Возвращает пользователей с заданным флагом в preferences.
 */
export async function listUsersWithPreference(prefKey: string): Promise<UserRecord[]> {
  const { data, error } = await supabase
    .from('marcus_users')
    .select('*')
    .contains('preferences', { [prefKey]: true });
  if (error) {
    logger.error({ error, prefKey }, 'Ошибка при загрузке пользователей по preferences');
    return [];
  }
  return (data as UserRecord[] | null) || [];
}
