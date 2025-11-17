@echo off

REM 检查Node.js是否安装
node -v >nul 2>&1
if %errorlevel% neq 0 (
echo 错误: 未找到Node.js。请先安装Node.js 14.x或更高版本。
pause
exit /b 1
)

REM 安装依赖
 echo 正在安装后端依赖...
npm install express node-fetch cors
if %errorlevel% neq 0 (
echo 错误: 依赖安装失败。
pause
exit /b 1
)

REM 启动后端服务
 echo 依赖安装成功，正在启动后端服务...
echo. 
echo 后端服务将在 http://localhost:3001 上运行
 echo 按 Ctrl+C 可停止服务
 echo.
node server.js

pause