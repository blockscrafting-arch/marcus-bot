import { addReminder, findReminderByMessage } from '@/lib/db/reminders';
import { getNextLocalTimeIso } from '@/lib/utils/time';
import { logger } from '@/lib/utils/logger';

const CARE_MESSAGE =
  process.env.CARE_CHECKIN_MESSAGE ||
  'Как ты себя чувствуешь? Как прошел день и сколько энергии по шкале 1-10?';

const CARE_TIME = process.env.CARE_CHECKIN_TIME || '21:00';

/**
 * Создает ежедневное напоминание заботы, если его еще нет.
 */
export async function ensureDailyCareReminder(userId: number, timeZone: string | undefined): Promise<void> {
  const existing = await findReminderByMessage(userId, CARE_MESSAGE, 'daily');
  if (existing) return;

  const [hourRaw, minuteRaw] = CARE_TIME.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw || '0');
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    logger.error({ careTime: CARE_TIME }, 'Некорректный CARE_CHECKIN_TIME');
    return;
  }

  const triggerAt = getNextLocalTimeIso(timeZone, hour, minute);
  const result = await addReminder({
    user_id: userId,
    message: CARE_MESSAGE,
    trigger_at: triggerAt,
    repeat_pattern: 'daily',
  });
  if (!result.ok) {
    logger.error({ userId, error: result.error }, 'Не удалось создать напоминание заботы');
  } else {
    logger.info({ userId, triggerAt }, 'Создано ежедневное напоминание заботы');
  }
}

