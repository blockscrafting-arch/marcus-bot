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

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/**
 * Возвращает локальные части даты для заданной таймзоны.
 */
export function getLocalParts(date: Date, timeZone: string | undefined): LocalDateParts {
  const tz = timeZone || 'Europe/Moscow';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const getNumber = (type: string) => Number(parts.find((p) => p.type === type)?.value || '0');
  return {
    year: getNumber('year'),
    month: getNumber('month'),
    day: getNumber('day'),
    hour: getNumber('hour'),
    minute: getNumber('minute'),
    second: getNumber('second'),
  };
}

/**
 * Вычисляет смещение таймзоны в минутах.
 */
export function getTimeZoneOffsetMinutes(date: Date, timeZone: string | undefined): number {
  const tz = timeZone || 'Europe/Moscow';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return (asUtc - date.getTime()) / 60000;
}

/**
 * Конвертирует локальные части даты в UTC ISO строку.
 */
export function toUtcIsoFromLocalParts(parts: LocalDateParts, timeZone: string | undefined): string {
  const naiveUtc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  const offsetMinutes = getTimeZoneOffsetMinutes(naiveUtc, timeZone);
  const utcMillis = naiveUtc.getTime() - offsetMinutes * 60 * 1000;
  return new Date(utcMillis).toISOString();
}

/**
 * Добавляет дни к локальным частям даты.
 */
export function addDaysToLocalParts(parts: LocalDateParts, days: number): LocalDateParts {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  base.setUTCDate(base.getUTCDate() + days);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
    hour: base.getUTCHours(),
    minute: base.getUTCMinutes(),
    second: base.getUTCSeconds(),
  };
}

/**
 * Добавляет месяцы к локальным частям даты.
 */
export function addMonthsToLocalParts(parts: LocalDateParts, months: number): LocalDateParts {
  const base = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  base.setUTCMonth(base.getUTCMonth() + months);
  return {
    year: base.getUTCFullYear(),
    month: base.getUTCMonth() + 1,
    day: base.getUTCDate(),
    hour: base.getUTCHours(),
    minute: base.getUTCMinutes(),
    second: base.getUTCSeconds(),
  };
}

/**
 * Возвращает ближайшее время в UTC для заданной локальной даты/времени.
 */
export function getNextLocalTimeIso(
  timeZone: string | undefined,
  hour: number,
  minute: number,
  now: Date = new Date()
): string {
  const current = getLocalParts(now, timeZone);
  let target: LocalDateParts = {
    year: current.year,
    month: current.month,
    day: current.day,
    hour,
    minute,
    second: 0,
  };
  if (current.hour > hour || (current.hour === hour && current.minute >= minute)) {
    target = addDaysToLocalParts(target, 1);
  }
  return toUtcIsoFromLocalParts(target, timeZone);
}

/**
 * Разбирает ISO-строку даты/времени и возвращает части как числа (игнорируя таймзону).
 * Используется для интерпретации времени как MSK и конвертации в UTC через toUtcIsoFromLocalParts.
 */
export function parseIsoToLocalParts(iso: string): LocalDateParts | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6] ?? '0', 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  return { year, month, day, hour, minute, second };
}

/**
 * Нормализует ISO-строку как MSK (+03) и возвращает UTC ISO для хранения в БД.
 */
export function normalizeIsoAsMsk(iso: string): string | null {
  const parts = parseIsoToLocalParts(iso);
  if (!parts) return null;
  return toUtcIsoFromLocalParts(parts, 'Europe/Moscow');
}

/**
 * Возвращает следующий запуск для повторяющегося напоминания.
 */
export function getNextTriggerAt(
  triggerAtIso: string,
  repeatPattern: string,
  timeZone: string | undefined
): string | null {
  const baseDate = new Date(triggerAtIso);
  if (Number.isNaN(baseDate.getTime())) {
    return null;
  }
  const baseParts = getLocalParts(baseDate, timeZone);
  let nextParts: LocalDateParts | null = null;
  if (repeatPattern === 'daily') {
    nextParts = addDaysToLocalParts(baseParts, 1);
  } else if (repeatPattern === 'weekly') {
    nextParts = addDaysToLocalParts(baseParts, 7);
  } else if (repeatPattern === 'monthly') {
    nextParts = addMonthsToLocalParts(baseParts, 1);
  }
  if (!nextParts) return null;
  return toUtcIsoFromLocalParts(nextParts, timeZone);
}

const MAX_NEXT_TRIGGER_ITERATIONS = 60;/**
 * Возвращает следующий будущий trigger_at для повторяющегося напоминания (без хвоста в прошлом).
 * Пока next <= now, шагает вперёд по паттерну.
 */
export function getNextFutureTriggerAt(
  triggerAtIso: string,
  repeatPattern: string,
  timeZone: string | undefined,
  now: Date = new Date()
): string | null {
  let current = triggerAtIso;
  const nowIso = now.toISOString();
  for (let i = 0; i < MAX_NEXT_TRIGGER_ITERATIONS; i++) {
    const next = getNextTriggerAt(current, repeatPattern, timeZone);
    if (!next) return null;
    if (next > nowIso) return next;
    current = next;
  }
  return null;
}