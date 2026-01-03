import { Context } from 'grammy';
import openai from '@/lib/openai/client';
import { getSystemPrompt } from '@/lib/openai/prompt';

export async function handleMessage(ctx: Context) {
  const messageText = ctx.message?.text;
  if (!messageText) return;

  console.log('Получено сообщение:', messageText);

  try {
    const user = ctx.from;
    const userName = user?.first_name || user?.last_name || 'Пользователь';
    const userUsername = user?.username;
    
    // Получаем текущее время в формате Moscow time
    const now = new Date();
    const moscowTime = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(now);

    const systemPrompt = getSystemPrompt(userName, userUsername, moscowTime);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Используем доступную модель (gpt-4.1-nano может не существовать)
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: messageText,
        },
      ],
    });

    const botReply = response.choices[0]?.message?.content || 'Ошибка при получении ответа от OpenAI';

    await ctx.reply(botReply);
  } catch (error) {
    console.error('Ошибка при обработке сообщения:', error);
    if (error instanceof Error) {
      console.error('Детали ошибки:', error.message);
      console.error('Stack:', error.stack);
    }
    await ctx.reply('Произошла ошибка при обработке вашего сообщения. Попробуйте позже.');
  }
}

