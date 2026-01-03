# Telegram Bot на Next.js

Минималистичный Telegram бот на Next.js (App Router, TypeScript) с интеграцией OpenAI.

## Технологии

- Next.js 14 (App Router)
- TypeScript
- grammy (Telegram Bot API)
- OpenAI API

## Структура проекта

```
app/
  api/
    bot/
      route.ts          # Webhook endpoint для Telegram
lib/
  openai/
    client.ts           # OpenAI клиент
    prompt.ts           # Системный промпт для Marcus
  telegram/
    bot.ts              # Инициализация бота grammy
    adapter.ts          # Адаптер Next.js Request/Response для grammy
    handlers/
      message.ts        # Обработчик текстовых сообщений с OpenAI
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
   OPENAI_API_KEY=your_openai_key_here
   ```
4. Запустите dev сервер:
   ```bash
   npm run dev
   ```

## Деплой на Vercel

1. Подключите репозиторий к Vercel
2. Добавьте переменные окружения в настройках проекта:
   - `TELEGRAM_BOT_TOKEN`
   - `OPENAI_API_KEY`
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

