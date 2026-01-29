import { addReminder, findReminderByMessage, updateReminderTriggerAndResetSent } from '@/lib/db/reminders';
import { getNextLocalTimeIso } from '@/lib/utils/time';
import { logger } from '@/lib/utils/logger';

const CARE_MESSAGE = 'Как ты себя чувствуешь? Как прошел день и сколько энергии по шкале 1-10?';
const MSK_TIMEZONE = 'Europe/Moscow';
const CARE_HOUR = 20;
const CARE_MINUTE = 0;

/**
 * Создает ежедневное напоминание заботы, если его еще нет. Время всегда в MSK.
 */
export async function ensureDailyCareReminder(userId: number, timeZone: string | undefined): Promise<void> {
  const tz = MSK_TIMEZONE;
  const triggerAt = getNextLocalTimeIso(tz, CARE_HOUR, CARE_MINUTE);
  const existing = await findReminderByMessage(userId, CARE_MESSAGE, 'daily', true);

  if (existing?.id) {
    const existingTime = new Date(existing.trigger_at).getTime();
    const nextTime = new Date(triggerAt).getTime();
    if (Number.isFinite(existingTime) && Math.abs(existingTime - nextTime) > 30 * 60 * 1000) {
      await updateReminderTriggerAndResetSent(existing.id, triggerAt);
      logger.info({ userId, triggerAt }, 'Обновлено время напоминания заботы');
    }
    return;
  }

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

