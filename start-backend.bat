@echo off
cd /d "%~dp0"

REM 检查Node.js是否安装
node -v >nul 2>&1
if %errorlevel% neq 0 (
echo 错误: 未找到Node.js。请先安装Node.js 22.12或更高版本。
pause
exit /b 1
)

REM 使用锁定版本安装依赖；依赖存在时直接启动
if not exist node_modules\express\package.json (
echo 正在安装项目依赖...
call npm ci
if errorlevel 1 (
echo 错误: 依赖安装失败。
pause
exit /b 1
)
)

REM 启动后端服务
 echo 正在启动后端服务，请确保已在 .env 中设置 AI_API_KEY...
echo. 
echo 后端服务将在 http://localhost:3001 上运行
 echo 按 Ctrl+C 可停止服务
 echo.
node server.js

pause
