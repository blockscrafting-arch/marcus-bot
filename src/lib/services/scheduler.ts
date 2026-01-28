import bot from '@/lib/telegram/bot';
import { addReminder, getDueReminders, markReminderSent } from '@/lib/db/reminders';
import { getUser, listUsersWithPreference } from '@/lib/db/users';
import { logger } from '@/lib/utils/logger';
import { getNextTriggerAt } from '@/lib/utils/time';

/**
 * Отправляет просроченные напоминания.
 */
export async function processReminders(): Promise<number> {
  const nowIso = new Date().toISOString();
  const reminders = await getDueReminders(nowIso);
  let sentCount = 0;
  try {
    await bot.init();
  } catch (error) {
    logger.error({ error }, 'Не удалось инициализировать бота для напоминаний');
    return 0;
  }
  for (const reminder of reminders) {
    if (!reminder.id) continue;
    try {
      await bot.api.sendMessage(reminder.user_id, `Напоминание: ${reminder.message}`);
      await markReminderSent(reminder.id);
      sentCount += 1;
      if (reminder.repeat_pattern) {
        const user = await getUser(reminder.user_id);
        const timeZone = user?.timezone || 'Europe/Moscow';
        const nextTriggerAt = getNextTriggerAt(reminder.trigger_at, reminder.repeat_pattern, timeZone);
        if (nextTriggerAt) {
          await addReminder({
            user_id: reminder.user_id,
            message: reminder.message,
            trigger_at: nextTriggerAt,
            repeat_pattern: reminder.repeat_pattern,
          });
        }
      }
    } catch (error) {
      logger.error({ error, reminderId: reminder.id, userId: reminder.user_id }, 'Ошибка отправки напоминания');
    }
  }
  return sentCount;
}

/**
 * Отправляет ежедневные саммари пользователям с включенной настройкой.
 */
export async function processDailySummaries(): Promise<number> {
  const users = await listUsersWithPreference('daily_summary');
  let sentCount = 0;
  try {
    await bot.init();
  } catch (error) {
    logger.error({ error }, 'Не удалось инициализировать бота для саммари');
    return 0;
  }
  for (const user of users) {
    try {
      await bot.api.sendMessage(
        user.telegram_id,
        'Ежедневное саммари готово. Если хочешь — уточни цели и приоритеты на сегодня.'
      );
      sentCount += 1;
    } catch (error) {
      logger.error({ error, userId: user.telegram_id }, 'Ошибка отправки ежедневного саммари');
    }
  }
  return sentCount;
}

