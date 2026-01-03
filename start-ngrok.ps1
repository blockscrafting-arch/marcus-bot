# Скрипт для запуска ngrok
Write-Host "Запускаю ngrok на порту 3000..." -ForegroundColor Green
Write-Host "После запуска откройте http://localhost:4040 в браузере для получения URL" -ForegroundColor Yellow
Write-Host "Нажмите Ctrl+C для остановки ngrok" -ForegroundColor Yellow
Write-Host ""

npx --yes ngrok@latest http 3000

