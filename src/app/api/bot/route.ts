import { NextRequest } from 'next/server';
import { handleWebhook } from '@/lib/telegram/adapter';
import { logger } from '@/lib/utils/logger';

/**
 * GET endpoint для проверки работоспособности.
 */
export async function GET(req: NextRequest): Promise<Response> {
  logger.info('GET запрос получен в /api/bot (проверка работоспособности)');
  return new Response(JSON.stringify({ 
    status: 'ok', 
    message: 'Bot webhook endpoint is working',
    timestamp: new Date().toISOString()
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * POST endpoint для webhook Telegram.
 */
export async function POST(req: NextRequest): Promise<Response> {
  logger.info('POST запрос получен в /api/bot');
  
  // handleWebhook уже обрабатывает все ошибки и всегда возвращает Response
  // Оставляем минимальную защиту на случай непредвиденных ошибок
  try {
    return await handleWebhook(req);
  } catch (error) {
    // Фолбэк на случай, если handleWebhook выбросит необработанную ошибку
    logger.error({ error }, 'Необработанная ошибка в route.ts');
    return new Response(JSON.stringify({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
      }
    });
  }
}

