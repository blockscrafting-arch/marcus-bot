import { NextRequest } from 'next/server';
import bot from './bot';

export async function handleWebhook(req: NextRequest): Promise<Response> {
  try {
    console.log('=== handleWebhook вызван ===');
    
    // Проверяем наличие токена ДО чтения body
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.error('ОШИБКА: TELEGRAM_BOT_TOKEN не установлен!');
      return new Response(JSON.stringify({ error: 'Bot token not configured' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Получаем тело запроса
    console.log('Читаю тело запроса...');
    let body;
    try {
      body = await req.json();
      console.log('Тело запроса получено, update_id:', body?.update_id);
    } catch (jsonError) {
      console.error('Ошибка парсинга JSON:', jsonError);
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!body || !body.update_id) {
      console.error('Неверный формат обновления:', body);
      return new Response(JSON.stringify({ error: 'Invalid update format' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    console.log('Обрабатываю обновление через bot.handleUpdate...');
    console.log('Update ID:', body.update_id);
    
    // Убеждаемся, что бот инициализирован
    if (!bot.botInfo) {
      console.log('Бот не инициализирован, инициализирую...');
      try {
        await bot.init();
        console.log('Бот успешно инициализирован');
      } catch (initError) {
        console.error('Ошибка инициализации бота:', initError);
        if (initError instanceof Error) {
          console.error('Детали:', initError.message);
          console.error('Stack:', initError.stack);
        }
        return new Response(JSON.stringify({ 
          error: 'Bot initialization failed',
          message: initError instanceof Error ? initError.message : 'Unknown error'
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } else {
      console.log('Бот уже инициализирован');
    }
    
    // Обрабатываем обновление напрямую через бота
    // Telegram требует быстрый ответ, поэтому обрабатываем синхронно
    try {
      await bot.handleUpdate(body);
      console.log('=== Обновление обработано успешно ===');
    } catch (updateError) {
      console.error('Ошибка при обработке обновления:', updateError);
      if (updateError instanceof Error) {
        console.error('Детали:', updateError.message);
        console.error('Stack:', updateError.stack);
      }
      // Все равно возвращаем 200, чтобы Telegram не повторял запрос
      // Ошибка уже залогирована
    }
    
    return new Response('OK', { 
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      }
    });
  } catch (error) {
    console.error('=== КРИТИЧЕСКАЯ ОШИБКА обработки webhook ===');
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
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

