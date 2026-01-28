import OpenAI from 'openai';
import { searchWeb } from '@/lib/services/search';
import { saveMemory } from '@/lib/db/memories';
import { addTask, listTasks } from '@/lib/db/tasks';
import { addReminder, listUpcomingReminders } from '@/lib/db/reminders';
import { createEmbedding } from '@/lib/ai/memory/embeddings';
import { retrieveMemories } from '@/lib/ai/memory/retrieval';
import { logger } from '@/lib/utils/logger';

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
      description: 'Поиск в интернете для проверки фактов',
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
      const results = await searchWeb(args.query || '');
      return JSON.stringify({ results });
    }

    if (name === 'add_memory') {
      const content = String(args.content || '');
      const embedding = await createEmbedding(content);
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
      const triggerAt = String(args.trigger_at || '');
      if (!isValidIsoDateTime(triggerAt)) {
        return JSON.stringify({
          error: 'INVALID_TRIGGER_AT',
          message: 'trigger_at должен быть ISO 8601 с таймзоной',
        });
      }
      const result = await addReminder({
        user_id: context.userId,
        message: String(args.message || ''),
        trigger_at: triggerAt,
        repeat_pattern: args.repeat_pattern || null,
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
 * Проверяет ISO 8601 дату/время с таймзоной.
 */
function isValidIsoDateTime(value: string): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

