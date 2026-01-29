import { NextRequest } from 'next/server';
import { processDailySummaries, processReminders } from '@/lib/services/scheduler';
import { logger } from '@/lib/utils/logger';

async function runCron(): Promise<Response> {
  try {
    const remindersSent = await processReminders();
    const summariesSent = await processDailySummaries();
    return new Response(JSON.stringify({ remindersSent, summariesSent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error({ error }, 'Ошибка при выполнении cron');
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Cron endpoint для напоминаний и ежедневных саммари.
 * Поддерживает GET и POST — внешние сервисы часто вызывают GET.
 */
export async function GET(req: NextRequest): Promise<Response> {
  return runCron();
}

export async function POST(req: NextRequest): Promise<Response> {
  return runCron();
}

