/**
 * Возвращает форматированное время для таймзоны пользователя.
 */
export function formatUserTime(timeZone: string | undefined, now: Date = new Date()): string {
  const tz = timeZone || 'Europe/Moscow';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(now);
}

/**
 * Возвращает ISO строку времени для таймзоны пользователя.
 */
export function formatUserIso(timeZone: string | undefined, now: Date = new Date()): string {
  const tz = timeZone || 'Europe/Moscow';
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

