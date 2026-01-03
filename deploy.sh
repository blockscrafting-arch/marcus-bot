#!/bin/bash

# Скрипт для деплоя на VPS сервер
# Использование: ./deploy.sh user@your-server.com

set -e

echo "🚀 Начинаю деплой бота на VPS..."

# Проверяем аргументы
if [ -z "$1" ]; then
    echo "❌ Ошибка: Укажите SSH адрес сервера"
    echo "Использование: ./deploy.sh user@your-server.com"
    exit 1
fi

SERVER=$1
APP_DIR="~/telegram-bot"

echo "📦 Создаю архив проекта..."
tar --exclude='node_modules' \
    --exclude='.next' \
    --exclude='.git' \
    --exclude='.env.local' \
    -czf deploy.tar.gz .

echo "📤 Загружаю файлы на сервер..."
scp deploy.tar.gz $SERVER:/tmp/

echo "🔧 Распаковываю и настраиваю на сервере..."
ssh $SERVER << 'ENDSSH'
    mkdir -p ~/telegram-bot
    cd ~/telegram-bot
    tar -xzf /tmp/deploy.tar.gz
    rm /tmp/deploy.tar.gz
    
    echo "📥 Устанавливаю зависимости..."
    npm install --production
    
    echo "🏗️ Собираю проект..."
    npm run build
    
    echo "✅ Деплой завершен!"
    echo "⚠️ Не забудьте:"
    echo "1. Создать файл .env.local с TELEGRAM_BOT_TOKEN и OPENAI_API_KEY"
    echo "2. Настроить PM2 или systemd для автозапуска"
    echo "3. Настроить webhook через API Telegram"
ENDSSH

echo "🧹 Удаляю локальный архив..."
rm deploy.tar.gz

echo "✅ Деплой завершен успешно!"

