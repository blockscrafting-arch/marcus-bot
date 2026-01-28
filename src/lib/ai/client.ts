import OpenAI from 'openai';
import { logger } from '@/lib/utils/logger';

const apiKey = process.env.OPENROUTER_API_KEY || '';
const appUrl = process.env.APP_URL || 'http://localhost:3000';
const appName = process.env.APP_NAME || 'Marcus';

if (!apiKey) {
  logger.error('OPENROUTER_API_KEY не установлен в переменных окружения!');
}

/**
 * Клиент OpenRouter (OpenAI-compatible).
 */
export const openRouter = new OpenAI({
  apiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': appUrl,
    'X-Title': appName,
  },
});

/**
 * Модель для чата по умолчанию.
 */
export const defaultChatModel = process.env.OPENROUTER_DEFAULT_MODEL || 'deepseek/deepseek-chat-v3-0324';

/**
 * Модель для embeddings.
 */
export const defaultEmbeddingModel = process.env.OPENROUTER_EMBEDDING_MODEL || 'text-embedding-3-small';

