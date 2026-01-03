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

// Инициализируем бота при импорте модуля
let botInitialized = false;
bot.init()
  .then(() => {
    botInitialized = true;
    console.log('Бот успешно инициализирован при старте');
  })
  .catch((err) => {
    console.error('Ошибка инициализации бота при старте:', err);
  });

export default bot;

