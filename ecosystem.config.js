// PM2 конфигурация для автозапуска бота
module.exports = {
  apps: [
    {
      name: 'telegram-bot',
      script: 'npm',
      args: 'start',
      cwd: '/root/telegram-bot', // Измените на ваш путь
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};

