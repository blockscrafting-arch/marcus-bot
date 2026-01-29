# Telegram Bot на Next.js

Минималистичный Telegram бот на Next.js (App Router, TypeScript) с интеграцией DeepSeek AI.

## Технологии

- Next.js 14 (App Router)
- TypeScript
- grammy (Telegram Bot API)
- DeepSeek AI API (DeepSeek-V3.2-Exp)

## Структура проекта

```
app/
  api/
    bot/
      route.ts          # Webhook endpoint для Telegram
lib/
  openai/
    client.ts           # DeepSeek клиент (OpenAI-совместимый)
    prompt.ts           # Системный промпт для Marcus
  telegram/
    bot.ts              # Инициализация бота grammy
    adapter.ts          # Адаптер Next.js Request/Response для grammy
    handlers/
      message.ts        # Обработчик текстовых сообщений с DeepSeek
```

## Установка

1. Клонируйте репозиторий
2. Установите зависимости:
   ```bash
   npm install
   ```
3. Создайте файл `.env.local`:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   DEEPSEEK_API_KEY=your_deepseek_key_here
   ```
   Примечание: также поддерживается `OPENAI_API_KEY` для обратной совместимости.
4. Запустите dev сервер:
   ```bash
   npm run dev
   ```

## Деплой на Vercel

1. Подключите репозиторий к Vercel
2. Добавьте переменные окружения в настройках проекта:
   - `TELEGRAM_BOT_TOKEN`
   - `DEEPSEEK_API_KEY` (или `OPENAI_API_KEY` для обратной совместимости)
3. Деплой произойдет автоматически

## Настройка webhook

После деплоя настройте webhook:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-vercel-app.vercel.app/api/bot"
```

## Проверка webhook

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

## Время (MSK)- Все вводимые/выводимые времена интерпретируются как MSK (UTC+3).
- В базе данные хранятся в UTC (TIMESTAMPTZ), но для просмотра в MSK используйте:

```sql
select trigger_at at time zone 'Europe/Moscow' as trigger_at_msk
from marcus_reminders;
```
