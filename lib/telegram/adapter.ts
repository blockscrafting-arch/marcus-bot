import { NextRequest } from 'next/server';
import bot from './bot';

export async function handleWebhook(req: NextRequest): Promise<Response> {
  try {
    console.log('=== handleWebhook вызван ===');
    
    // Получаем тело запроса
    console.log('Читаю тело запроса...');
    const body = await req.json();
    console.log('Тело запроса получено:', JSON.stringify(body, null, 2));
    
    // Проверяем наличие токена
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.error('ОШИБКА: TELEGRAM_BOT_TOKEN не установлен!');
      return new Response('Bot token not configured', { status: 500 });
    }
    
    console.log('Обрабатываю обновление через bot.handleUpdate...');
    console.log('Тип обновления:', body.update_id ? 'update' : 'unknown');
    console.log('Update ID:', body.update_id);
    
    // Убеждаемся, что бот инициализирован
    if (!bot.botInfo) {
      console.log('Бот не инициализирован, инициализирую...');
      try {
        await bot.init();
        console.log('Бот успешно инициализирован');
      } catch (initError) {
        console.error('Ошибка инициализации бота:', initError);
        throw initError;
      }
    } else {
      console.log('Бот уже инициализирован');
    }
    
    // Обрабатываем обновление напрямую через бота
    // Telegram требует быстрый ответ, поэтому обрабатываем синхронно
    await bot.handleUpdate(body);
    
    console.log('=== Обновление обработано успешно ===');
    return new Response('OK', { 
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      }
    });
  } catch (error) {
    console.error('=== ОШИБКА обработки webhook ===');
    console.error('Тип ошибки:', error?.constructor?.name);
    if (error instanceof Error) {
      console.error('Сообщение:', error.message);
      console.error('Stack:', error.stack);
    } else {
      console.error('Объект ошибки:', error);
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}

