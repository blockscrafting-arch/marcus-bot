import { supabase } from '@/lib/db/client';
import { logger } from '@/lib/utils/logger';

export type TaskRecord = {
  id?: string;
  user_id: number;
  title: string;
  description?: string | null;
  status?: 'pending' | 'in_progress' | 'done' | 'cancelled';
  priority?: 'low' | 'medium' | 'high';
  due_date?: string | null;
};

/**
 * Создает задачу.
 */
export async function addTask(task: TaskRecord): Promise<void> {
  const { error } = await supabase.from('marcus_tasks').insert({
    user_id: task.user_id,
    title: task.title,
    description: task.description || null,
    status: task.status || 'pending',
    priority: task.priority || 'medium',
    due_date: task.due_date || null,
  });
  if (error) {
    logger.error({ error, userId: task.user_id }, 'Ошибка при создании задачи');
  }
}

/**
 * Возвращает задачи пользователя.
 */
export async function listTasks(userId: number, status?: string): Promise<TaskRecord[]> {
  let query = supabase.from('marcus_tasks').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (status) {
    query = query.eq('status', status);
  }
  const { data, error } = await query;
  if (error) {
    logger.error({ error, userId, status }, 'Ошибка при загрузке задач');
    return [];
  }
  return (data as TaskRecord[] | null) || [];
}

