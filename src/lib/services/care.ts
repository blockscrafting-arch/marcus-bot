import { addReminder, findReminderByMessage, updateReminderTriggerAt } from '@/lib/db/reminders';
import { getLastUserMessageTime } from '@/lib/db/messages';
import { getLocalParts, getNextLocalTimeIso } from '@/lib/utils/time';
import { logger } from '@/lib/utils/logger';

const CARE_MESSAGE = 'Как ты себя чувствуешь? Как прошел день и сколько энергии по шкале 1-10?';
const CARE_WINDOW_START = 19;
const CARE_WINDOW_END = 22;
const MSK_TIMEZONE = 'Europe/Moscow';

/**
 * Создает ежедневное напоминание заботы, если его еще нет. Время всегда в MSK.
 */
export async function ensureDailyCareReminder(userId: number, timeZone: string | undefined): Promise<void> {
  const existing = await findReminderByMessage(userId, CARE_MESSAGE, 'daily');
  const lastMessageAt = await getLastUserMessageTime(userId);
  const tz = MSK_TIMEZONE;
  const { hour, minute } = inferCareTime(lastMessageAt, tz);
  const triggerAt = getNextLocalTimeIso(tz, hour, minute);

  if (existing?.id) {
    const existingTime = new Date(existing.trigger_at).getTime();
    const nextTime = new Date(triggerAt).getTime();
    if (Number.isFinite(existingTime) && Math.abs(existingTime - nextTime) > 30 * 60 * 1000) {
      await updateReminderTriggerAt(existing.id, triggerAt);
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

/**
 * Выбирает время для заботы на основе активности пользователя.
 */
function inferCareTime(
  lastMessageAt: Date | null,
  timeZone: string | undefined
): { hour: number; minute: number } {
  if (!lastMessageAt) {
    return { hour: 21, minute: 0 };
  }
  const local = getLocalParts(lastMessageAt, timeZone);
  if (local.hour >= CARE_WINDOW_START && local.hour <= CARE_WINDOW_END) {
    const nextHour = Math.min(local.hour + 1, CARE_WINDOW_END);
    const minute = local.minute >= 30 ? 0 : 30;
    return { hour: nextHour, minute };
  }
  if (local.hour < 12) {
    return { hour: 20, minute: 30 };
  }
  return { hour: 21, minute: 0 };
}

