@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "app\dist\index.html" (
  echo 首次运行，正在准备（需要几分钟）...
  cd app
  call npm install
  call npm run build
  cd ..
)
node serve.mjs 8080
pause
