import { NextRequest } from 'next/server';
import { handleWebhook } from '@/lib/telegram/adapter';

// GET endpoint для проверки работоспособности
export async function GET(req: NextRequest): Promise<Response> {
  console.log('=== GET запрос получен в /api/bot (проверка работоспособности) ===');
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

export async function POST(req: NextRequest): Promise<Response> {
  console.log('=== POST запрос получен в /api/bot ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
  try {
    const response = await handleWebhook(req);
    console.log('=== Ответ отправлен, статус:', response.status, '===');
    return response;
  } catch (error) {
    console.error('=== КРИТИЧЕСКАЯ ОШИБКА в route.ts ===');
    console.error('Тип ошибки:', error?.constructor?.name);
    if (error instanceof Error) {
      console.error('Сообщение:', error.message);
      console.error('Stack:', error.stack);
    } else {
      console.error('Объект ошибки:', error);
    }
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

