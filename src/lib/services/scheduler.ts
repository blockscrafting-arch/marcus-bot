import bot from '@/lib/telegram/bot';
import { getDueReminders, markReminderSent, updateReminderTriggerAndResetSent } from '@/lib/db/reminders';
import { listUsersWithPreference } from '@/lib/db/users';
import { logger } from '@/lib/utils/logger';
import { formatUserTime, getNextFutureTriggerAt } from '@/lib/utils/time';

const REMINDER_LATE_THRESHOLD_MS = 60 * 60 * 1000; // 1 час

const MSK_TIMEZONE = 'Europe/Moscow';

/**
 * Отправляет просроченные напоминания. Просроченные более чем на 1 час помечаются как пропущенные без отправки.
 */
export async function processReminders(): Promise<number> {
  const now = new Date();
  const nowIso = now.toISOString();
  const reminders = await getDueReminders(nowIso);
  let sentCount = 0;
  let skippedCount = 0;
  try {
    await bot.init();
  } catch (error) {
    logger.error({ error }, 'Не удалось инициализировать бота для напоминаний');
    return 0;
  }
  for (const reminder of reminders) {
    if (!reminder.id) continue;
    const triggerAtMs = new Date(reminder.trigger_at).getTime();
    const delayMs = now.getTime() - triggerAtMs;
    const isLate = delayMs > REMINDER_LATE_THRESHOLD_MS;
    try {
      if (isLate) {
        await markReminderSent(reminder.id);
        skippedCount += 1;
        logger.info(
          {
            reminderId: reminder.id,
            userId: reminder.user_id,
            trigger_at: reminder.trigger_at,
            trigger_at_msk: formatUserTime(MSK_TIMEZONE, new Date(reminder.trigger_at)),
            delayMs,
            repeat_pattern: reminder.repeat_pattern,
          },
          'skipped_due_to_late'
        );
      } else {
        await bot.api.sendMessage(reminder.user_id, reminder.message);
        await markReminderSent(reminder.id);
        sentCount += 1;
        logger.info(
          {
            reminderId: reminder.id,
            userId: reminder.user_id,
            trigger_at: reminder.trigger_at,
            trigger_at_msk: formatUserTime(MSK_TIMEZONE, new Date(reminder.trigger_at)),
            delayMs,
            repeat_pattern: reminder.repeat_pattern,
          },
          'sent_reminder'
        );
      }
      if (reminder.repeat_pattern) {
        const nextTriggerAt = getNextFutureTriggerAt(
          reminder.trigger_at,
          reminder.repeat_pattern,
          MSK_TIMEZONE,
          now
        );
        if (nextTriggerAt) {
          await updateReminderTriggerAndResetSent(reminder.id, nextTriggerAt);
        }
      }
    } catch (error) {
      logger.error({ error, reminderId: reminder.id, userId: reminder.user_id }, 'Ошибка отправки напоминания');
    }
  }
  if (sentCount > 0 || skippedCount > 0) {
    logger.info({ sentCount, skippedCount, total: reminders.length }, 'Напоминания обработаны');
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

