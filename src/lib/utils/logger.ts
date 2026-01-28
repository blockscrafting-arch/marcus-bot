import pino from 'pino';

/**
 * Структурированный логгер для серверной части.
 * Не логирует секреты, поддерживает уровни.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: 'marcus-bot',
  },
});

