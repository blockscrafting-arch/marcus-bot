# Инструкция по деплою на VPS

## Предварительные требования

1. VPS сервер с Ubuntu/Debian
2. SSH доступ к серверу
3. Node.js 18+ установлен на сервере
4. PM2 установлен (для автозапуска)

## Шаг 1: Подготовка сервера

### Установка Node.js (если не установлен)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Установка PM2

```bash
sudo npm install -g pm2
```

## Шаг 2: Деплой проекта

### Вариант A: Через скрипт deploy.sh

```bash
chmod +x deploy.sh
./deploy.sh root@your-server.com
```

### Вариант B: Вручную

```bash
# На вашем локальном компьютере
tar --exclude='node_modules' --exclude='.next' --exclude='.git' -czf deploy.tar.gz .
scp deploy.tar.gz root@your-server.com:/tmp/

# На сервере
ssh root@your-server.com
mkdir -p ~/telegram-bot
cd ~/telegram-bot
tar -xzf /tmp/deploy.tar.gz
npm install --production
npm run build
```

## Шаг 3: Настройка переменных окружения

На сервере создайте файл `.env.local`:

```bash
cd ~/telegram-bot
nano .env.local
```

Добавьте:
```
TELEGRAM_BOT_TOKEN=ваш_токен_бота
DEEPSEEK_API_KEY=ваш_ключ_deepseek
```
Примечание: также поддерживается `OPENAI_API_KEY` для обратной совместимости.

## Шаг 4: Запуск через PM2

```bash
cd ~/telegram-bot
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Для автозапуска при перезагрузке сервера
```

## Шаг 5: Настройка Nginx (опционально, для HTTPS)

```bash
sudo apt install nginx certbot python3-certbot-nginx
```

Создайте конфиг `/etc/nginx/sites-available/telegram-bot`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/telegram-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d your-domain.com
```

## Шаг 6: Настройка webhook

### Если используете домен с HTTPS:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-domain.com/api/bot"
```

### Если используете IP без HTTPS:

Telegram требует HTTPS для webhook. Используйте:
- Nginx + Let's Encrypt (рекомендуется)
- Или используйте ngrok на сервере

## Шаг 7: Проверка работы

```bash
# Проверить статус PM2
pm2 status

# Посмотреть логи
pm2 logs telegram-bot

# Проверить webhook
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

## Обновление бота

```bash
# На локальном компьютере
./deploy.sh root@your-server.com

# На сервере
cd ~/telegram-bot
pm2 restart telegram-bot
```

## Полезные команды PM2

```bash
pm2 status          # Статус процессов
pm2 logs            # Логи всех процессов
pm2 logs telegram-bot  # Логи бота
pm2 restart telegram-bot  # Перезапуск
pm2 stop telegram-bot     # Остановка
pm2 delete telegram-bot   # Удаление
```

