@echo off
chcp 65001 >nul
echo ========================================
echo    印章提取与智能比对系统
echo ========================================
echo.
echo 正在检查Python环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到Python，请先安装Python 3.8或更高版本
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [✓] Python环境正常
echo.
echo 正在检查依赖...
pip list | findstr Flask >nul
if errorlevel 1 (
    echo [警告] 检测到缺少依赖包
    echo 正在安装依赖...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo [错误] 依赖安装失败
        pause
        exit /b 1
    )
)

echo [✓] 依赖检查完成
echo.
echo 正在启动Web服务...
echo.
echo ========================================
echo    服务启动成功！
echo    请打开浏览器访问: http://localhost:5000
echo ========================================
echo.
echo 按 Ctrl+C 停止服务
echo.
python app.py

echo.
pause
