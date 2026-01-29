import OpenAI from 'openai';
import { searchWeb } from '@/lib/services/search';
import { deepResearch } from '@/lib/services/research';
import { saveMemory, matchMemories } from '@/lib/db/memories';
import { addTask, listTasks } from '@/lib/db/tasks';
import { addReminder, listUpcomingReminders } from '@/lib/db/reminders';
import { createEmbedding } from '@/lib/ai/memory/embeddings';
import { retrieveMemories } from '@/lib/ai/memory/retrieval';
import { logger } from '@/lib/utils/logger';
import { normalizeIsoAsMsk, formatUserTime, formatUserIso } from '@/lib/utils/time';

export type ToolContext = {
  userId: number;
};

/**
 * Список инструментов, доступных модели.
 */
export const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Быстрый поиск в интернете для фактов, цен, новостей, "как сделать"',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deep_research',
      description:
        'Глубокое исследование сложного вопроса. ОБЯЗАТЕЛЬНО используй для: сравнений (X vs Y), анализа рынка, сложных многогранных вопросов, медицинских/юридических/финансовых тем. Исследует сотни источников.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Вопрос для глубокого исследования' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description:
        'Получить текущее время (MSK). Используй для вопросов о времени, таймзоне, "который час", "по какому времени работаешь". Не вызывай search_web/deep_research для таких вопросов.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_memory',
      description: 'Сохранить факт в долгосрочную память',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          memory_type: { type: 'string' },
          importance: { type: 'number' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_memory',
      description: 'Найти релевантные воспоминания по запросу',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Добавить задачу пользователю',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          due_date: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Показать задачи пользователя',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_reminder',
      description: 'Добавить напоминание пользователю',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          trigger_at: { type: 'string' },
          repeat_pattern: { type: 'string' },
        },
        required: ['message', 'trigger_at'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_reminders',
      description: 'Показать ближайшие напоминания пользователя',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_followup',
      description: 'Запланировать follow-up напоминание',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          trigger_at: { type: 'string' },
        },
        required: ['message', 'trigger_at'],
      },
    },
  },
];

/**
 * Исполняет вызов инструмента и возвращает результат в JSON-строке.
 */
export async function executeToolCall(
  toolCall: OpenAI.Chat.ChatCompletionMessageToolCall,
  context: ToolContext
): Promise<string> {
  const name = toolCall.function.name;
  let args: Record<string, any> = {};
  try {
    args = JSON.parse(toolCall.function.arguments || '{}');
  } catch {
    args = {};
  }

  try {
    if (name === 'search_web') {
      const query = String(args.query || '');
      const results = await searchWeb(query);
      if (results.length > 0) {
        return JSON.stringify({ results });
      }
      const perplexityKey = process.env.PERPLEXITY_API_KEY;
      if (perplexityKey) {
        logger.info({ query: query.slice(0, 80) }, 'search_web пустой — fallback на Perplexity');
        const { content, citations } = await deepResearch(query);
        return JSON.stringify({ fallback: true, content, citations: citations ?? [] });
      }
      return JSON.stringify({ results: [], fallback: false });
    }

    if (name === 'deep_research') {
      const query = String(args.query || '');
      const { content, citations } = await deepResearch(query);
      return JSON.stringify({ content, citations: citations ?? [] });
    }

    if (name === 'get_current_time') {
      const tz = 'Europe/Moscow';
      const now = new Date();
      const time = formatUserTime(tz, now);
      const iso = formatUserIso(tz, now);
      return JSON.stringify({ time, time_zone: tz, iso });
    }

    if (name === 'add_memory') {
      const content = String(args.content || '').trim();
      if (!content) return JSON.stringify({ ok: false, error: 'content пустой' });
      const embedding = await createEmbedding(content);
      if (!embedding.length) return JSON.stringify({ ok: false, error: 'Не удалось создать embedding' });
      const existing = await matchMemories({
        userId: context.userId,
        embedding,
        matchCount: 1,
        similarityThreshold: 0.98,
      });
      if (existing.length > 0) return JSON.stringify({ ok: true, skipped: 'уже есть похожая память' });
      await saveMemory({
        user_id: context.userId,
        content,
        memory_type: args.memory_type || 'event',
        importance: args.importance ?? 0.5,
        embedding,
      });
      return JSON.stringify({ ok: true });
    }

    if (name === 'get_memory') {
      const memories = await retrieveMemories(context.userId, String(args.query || ''));
      return JSON.stringify({ memories: memories.slice(0, args.limit || 5) });
    }

    if (name === 'add_task') {
      await addTask({
        user_id: context.userId,
        title: String(args.title || ''),
        description: args.description || null,
        due_date: args.due_date || null,
        priority: args.priority || 'medium',
      });
      return JSON.stringify({ ok: true });
    }

    if (name === 'list_tasks') {
      const tasks = await listTasks(context.userId, args.status);
      return JSON.stringify({ tasks });
    }

    if (name === 'add_reminder' || name === 'schedule_followup') {
      const triggerAtRaw = String(args.trigger_at || '');
      const messageText = String(args.message || '');
      const inferredRepeat = inferRepeatPatternFromMessage(messageText);
      const repeatPattern = String(args.repeat_pattern || '') || inferredRepeat;
      if (repeatPattern === 'weekday' || repeatPattern === 'weekend') {
        return JSON.stringify({
          error: 'UNSUPPORTED_REPEAT_PATTERN',
          message: 'Для будней/выходных укажи конкретные дни или частоту.',
        });
      }
      const triggerAtUtc = normalizeIsoAsMsk(triggerAtRaw);
      if (!triggerAtUtc) {
        return JSON.stringify({
          error: 'INVALID_TRIGGER_AT',
          message: 'trigger_at должен быть ISO 8601 (например 2026-01-29T18:00:00+03:00), время в MSK',
        });
      }
      const result = await addReminder({
        user_id: context.userId,
        message: messageText,
        trigger_at: triggerAtUtc,
        repeat_pattern: repeatPattern || null,
      });
      if (!result.ok) {
        return JSON.stringify({ error: 'REMINDER_SAVE_FAILED', message: result.error });
      }
      return JSON.stringify({ ok: true });
    }

    if (name === 'list_reminders') {
      const reminders = await listUpcomingReminders(context.userId, args.limit || 5);
      return JSON.stringify({ reminders });
    }

    return JSON.stringify({ error: 'Unknown tool' });
  } catch (error) {
    logger.error({ error, tool: name }, 'Ошибка при выполнении tool call');
    return JSON.stringify({ error: 'Tool execution failed' });
  }
}

/**
 * Выводит repeat_pattern из текста.
 */
function inferRepeatPatternFromMessage(text: string): string {
  const normalized = text.toLowerCase();
  if (/(каждый день|ежедневно|каждое утро|каждый вечер)/i.test(normalized)) return 'daily';
  if (/по будням/i.test(normalized)) return 'weekday';
  if (/по выходным/i.test(normalized)) return 'weekend';
  if (/каждую неделю|еженедельно/i.test(normalized)) return 'weekly';
  if (/каждый месяц|ежемесячно/i.test(normalized)) return 'monthly';
  return '';
}

