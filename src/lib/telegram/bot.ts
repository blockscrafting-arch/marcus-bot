import { Bot } from 'grammy';
import { handleTextMessage } from './handlers/text';
import { handleVoiceMessage } from './handlers/voice';
import { logger } from '@/lib/utils/logger';

const token = process.env.TELEGRAM_BOT_TOKEN || '';

// Не выбрасываем ошибку при импорте - проверка будет в адаптере
// Это важно для serverless окружения (Vercel)
if (!token) {
  logger.error('TELEGRAM_BOT_TOKEN не установлен в переменных окружения!');
}

const bot = new Bot(token);

// Регистрируем обработчики сообщений
bot.on('message:text', async (ctx) => {
  const text = ctx.message?.text;
  if (text) {
    await handleTextMessage(ctx, text);
  }
});
bot.on('message:voice', handleVoiceMessage);

// Обработка ошибок бота
bot.catch((err) => {
  logger.error({ err }, 'Ошибка в боте');
});

// Не инициализируем бота при импорте - это будет сделано при первом запросе
// В serverless окружении (Vercel) инициализация при импорте может не работать

export default bot;

