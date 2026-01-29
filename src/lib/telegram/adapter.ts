import { NextRequest } from 'next/server';
import bot from './bot';
import { logger } from '@/lib/utils/logger';
import { tryMarkUpdateProcessed } from '@/lib/db/updates';

/**
 * Обрабатывает входящие webhook-обновления Telegram.
 */
export async function handleWebhook(req: NextRequest): Promise<Response> {
  try {
    logger.info('handleWebhook вызван');
    
    // Проверяем наличие токена ДО чтения body
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      logger.error('TELEGRAM_BOT_TOKEN не установлен!');
      return new Response(JSON.stringify({ error: 'Bot token not configured' }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Проверяем секретный токен для защиты от поддельных запросов
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secretToken) {
      const receivedToken = req.headers.get('x-telegram-bot-api-secret-token');
      if (receivedToken !== secretToken) {
        logger.error('Неверный секретный токен вебхука');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Получаем тело запроса
    logger.info('Читаю тело запроса');
    let body;
    try {
      body = await req.json();
      logger.info({ updateId: body?.update_id }, 'Тело запроса получено');
    } catch (jsonError) {
      logger.error({ jsonError }, 'Ошибка парсинга JSON');
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (!body || !body.update_id) {
      logger.error({ body }, 'Неверный формат обновления');
      return new Response(JSON.stringify({ error: 'Invalid update format' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const updateId = Number(body.update_id);
    if (!Number.isFinite(updateId)) {
      logger.error({ updateId: body.update_id }, 'Неверный update_id');
      return new Response(JSON.stringify({ error: 'Invalid update_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const shouldProcess = await tryMarkUpdateProcessed(updateId);
    if (!shouldProcess) {
      logger.info({ updateId }, 'Дубликат update_id, пропускаю');
      return new Response('OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    
    logger.info({ updateId: body.update_id }, 'Обрабатываю обновление через bot.handleUpdate');
    
    // Убеждаемся, что бот инициализирован
    // В serverless окружении (Vercel) каждый запрос может быть новым инстансом,
    // поэтому безопаснее всегда вызывать init() - он не выбросит ошибку, если уже инициализирован
    try {
      await bot.init();
      logger.info('Бот готов к обработке обновлений');
    } catch (initError) {
      logger.error({ initError }, 'Ошибка инициализации бота');
      return new Response(JSON.stringify({ 
        error: 'Bot initialization failed',
        message: initError instanceof Error ? initError.message : 'Unknown error'
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Обрабатываем обновление напрямую через бота
    // В Railway можно отвечать быстро и обрабатывать асинхронно
    const asyncWebhook = process.env.WEBHOOK_ASYNC === 'true';
    if (asyncWebhook) {
      void bot
        .handleUpdate(body)
        .then(() => logger.info('Обновление обработано успешно'))
        .catch((updateError) => logger.error({ updateError }, 'Ошибка при обработке обновления'));
      return new Response('OK', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    try {
      await bot.handleUpdate(body);
      logger.info('Обновление обработано успешно');
    } catch (updateError) {
      logger.error({ updateError }, 'Ошибка при обработке обновления');
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
    logger.error({ error }, 'Критическая ошибка обработки webhook');
    return new Response(JSON.stringify({ 
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

