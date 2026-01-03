import { Bot } from 'grammy';
import { handleMessage } from './handlers/message';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN не установлен в переменных окружения!');
  throw new Error('TELEGRAM_BOT_TOKEN is required');
}

const bot = new Bot(token);

// Регистрируем обработчик сообщений
bot.on('message:text', handleMessage);

// Обработка ошибок бота
bot.catch((err) => {
  console.error('=== Ошибка в боте ===');
  console.error('Тип ошибки:', err?.constructor?.name);
  if (err instanceof Error) {
    console.error('Сообщение:', err.message);
    console.error('Stack:', err.stack);
  } else {
    console.error('Объект ошибки:', err);
  }
});

// Не инициализируем бота при импорте - это будет сделано при первом запросе
// В serverless окружении (Vercel) инициализация при импорте может не работать

export default bot;

