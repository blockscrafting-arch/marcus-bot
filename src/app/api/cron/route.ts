import { NextRequest } from 'next/server';
import { processDailySummaries, processReminders } from '@/lib/services/scheduler';
import { logger } from '@/lib/utils/logger';

/**
 * Cron endpoint для напоминаний и ежедневных саммари.
 */
export async function POST(req: NextRequest): Promise<Response> {
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

