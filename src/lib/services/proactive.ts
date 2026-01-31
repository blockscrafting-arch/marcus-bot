import bot from '@/lib/telegram/bot';
import { openRouter, defaultChatModel } from '@/lib/ai/client';
import { getProactivePrompt } from '@/lib/ai/proactive-prompt';
import { retrieveMemories } from '@/lib/ai/memory/retrieval';
import { listUsers } from '@/lib/db/users';
import { getProactiveState, upsertProactiveState, resetDailyCountIfNeeded } from '@/lib/db/proactive';
import { getLastUserMessageTime, getRecentMessages } from '@/lib/db/messages';
import { listTasks } from '@/lib/db/tasks';
import { listUpcomingReminders } from '@/lib/db/reminders';
import { saveMessage } from '@/lib/db/messages';
import { formatUserTime, getLocalParts } from '@/lib/utils/time';
import { logger } from '@/lib/utils/logger';

const MSK = 'Europe/Moscow';
const PROACTIVE_WINDOW_START_HOUR = 8;
const PROACTIVE_WINDOW_START_MINUTE = 30;
const PROACTIVE_WINDOW_END_HOUR = 22;
const PROACTIVE_WINDOW_END_MINUTE = 0;
const CARE_HOUR_MSK = 20;
const CARE_BUFFER_MINUTES = 30;
const MIN_SINCE_LAST_USER_MSG_MS = 45 * 60 * 1000; // 45 min
const MAX_PROACTIVE_PER_DAY = 4;
const MIN_INTERVAL_HOURS = 2;
const MAX_INTERVAL_HOURS = 4;
const PROACTIVE_TIMEOUT_MS = 15_000;

function isInActiveWindow(now: Date, timeZone: string): boolean {
  const local = getLocalParts(now, timeZone);
  const startMin = PROACTIVE_WINDOW_START_HOUR * 60 + PROACTIVE_WINDOW_START_MINUTE;
  const endMin = PROACTIVE_WINDOW_END_HOUR * 60 + PROACTIVE_WINDOW_END_MINUTE;
  const currentMin = local.hour * 60 + local.minute;
  return currentMin >= startMin && currentMin < endMin;
}

function isNearCareReminder(now: Date, timeZone: string): boolean {
  const local = getLocalParts(now, timeZone);
  const careStart = CARE_HOUR_MSK * 60 - CARE_BUFFER_MINUTES;
  const careEnd = CARE_HOUR_MSK * 60 + CARE_BUFFER_MINUTES;
  const currentMin = local.hour * 60 + local.minute;
  return currentMin >= careStart && currentMin <= careEnd;
}

function simpleHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h << 5) - h + text.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36).slice(0, 12);
}

/**
 * Отправляет проактивные сообщения. По умолчанию — всем пользователям; отключить можно через preferences.proactive = false.
 * Учитывает окно 08:30–22:00 MSK, паузу после последнего сообщения, окрестность care 20:00, лимит 3–4/день и интервал 2–4 ч.
 */
export async function processProactiveMessages(): Promise<number> {
  const now = new Date();
  const allUsers = await listUsers();
  const users = allUsers.filter((u) => (u.preferences as Record<string, unknown>)?.proactive !== false);
  if (!users.length) return 0;

  try {
    await bot.init();
  } catch (error) {
    logger.error({ error }, 'Не удалось инициализировать бота для проактивных сообщений');
    return 0;
  }

  let sentCount = 0;
  for (const user of users) {
    const userId = user.telegram_id;
    const timeZone = user.timezone || MSK;
    const userName = user.first_name || 'Пользователь';

    if (!isInActiveWindow(now, timeZone)) continue;
    if (isNearCareReminder(now, timeZone)) continue;

    const lastUserAt = await getLastUserMessageTime(userId);
    if (lastUserAt && now.getTime() - lastUserAt.getTime() < MIN_SINCE_LAST_USER_MSG_MS) continue;

    await resetDailyCountIfNeeded(userId, now);
    const state = await getProactiveState(userId);
    const dailyCount = state?.daily_count ?? 0;
    if (dailyCount >= MAX_PROACTIVE_PER_DAY) continue;

    const nextAt = state?.next_scheduled_at ? new Date(state.next_scheduled_at) : null;
    if (nextAt && now.getTime() < nextAt.getTime()) continue;

    const tasks = await listTasks(userId, 'pending');
    const recentMessages = await getRecentMessages(userId, 5);
    let memorySnippets: string[] = [];
    try {
      memorySnippets = await retrieveMemories(userId, 'задачи проекты здоровье планы на день');
    } catch {
      // ignore
    }
    const upcomingReminders = await listUpcomingReminders(userId, 3);

    const currentTime = formatUserTime(timeZone, now);
    const local = getLocalParts(now, timeZone);
    const timeOfDay: 'morning' | 'afternoon' | 'evening' =
      local.hour < 12 ? 'morning' : local.hour < 17 ? 'afternoon' : 'evening';
    const proactiveContext = {
      userName,
      currentTime,
      timeZone,
      timeOfDay,
      tasks: tasks.slice(0, 3).map((t) => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        due_date: t.due_date,
      })),
      recentMessages: recentMessages.slice(0, 2).map((m) => ({ role: m.role, content: m.content })),
      memorySnippets,
      upcomingReminders: upcomingReminders.map((r) => ({ message: r.message, trigger_at: r.trigger_at })),
      lastTopic: state?.last_topic ?? undefined,
    };

    const systemPrompt = getProactivePrompt(proactiveContext);
    let text: string;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), PROACTIVE_TIMEOUT_MS);
      const response = await openRouter.chat.completions.create(
        {
          model: defaultChatModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: 'Сгенерируй одно короткое проактивное сообщение для пользователя.' },
          ],
          max_tokens: 256,
          temperature: 0.8,
        },
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      text = response.choices[0]?.message?.content?.trim() || '';
    } catch (err) {
      logger.error({ err, userId }, 'Ошибка генерации проактивного сообщения');
      continue;
    }

    if (!text) continue;

    try {
      await bot.api.sendMessage(userId, text);
      await saveMessage({ user_id: userId, role: 'assistant', content: text });
      const nextCount = dailyCount + 1;
      const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      const dailyDate = dateFormatter.format(now).replace(/\//g, '-');
      const minMs = MIN_INTERVAL_HOURS * 60 * 60 * 1000;
      const maxMs = MAX_INTERVAL_HOURS * 60 * 60 * 1000;
      const jitterMs = minMs + Math.random() * (maxMs - minMs);
      const nextScheduledAt = new Date(now.getTime() + jitterMs);
      upsertProactiveState(userId, {
        last_sent_at: now.toISOString(),
        daily_count: nextCount,
        daily_date: dailyDate,
        last_topic: text.slice(0, 80),
        last_message_hash: simpleHash(text),
        next_scheduled_at: nextScheduledAt.toISOString(),
      });
      sentCount += 1;
      logger.info({ userId, dailyCount: nextCount }, 'Проактивное сообщение отправлено');
    } catch (sendErr) {
      logger.error({ sendErr, userId }, 'Ошибка отправки проактивного сообщения');
    }
  }

  return sentCount;
}
