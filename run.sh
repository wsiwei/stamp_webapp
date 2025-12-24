#!/bin/bash

echo "========================================"
echo "    印章提取与智能比对系统"
echo "========================================"
echo

# 检查Python
echo "正在检查Python环境..."
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未找到Python3，请先安装Python 3.8或更高版本"
    echo "安装命令: sudo apt-get install python3 (Ubuntu/Debian)"
    echo "          sudo yum install python3 (CentOS/RHEL)"
    echo "          brew install python (macOS)"
    exit 1
fi
echo "[✓] Python环境正常: $(python3 --version)"
echo

# 检查并安装依赖
echo "正在检查依赖..."
if ! python3 -c "import flask" &> /dev/null; then
    echo "[警告] 检测到缺少依赖包"
    echo "正在安装依赖..."
    pip3 install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "[错误] 依赖安装失败"
        exit 1
    fi
fi
echo "[✓] 依赖检查完成"
echo

# 启动服务
echo "正在启动Web服务..."
echo
echo "========================================"
echo "    服务启动成功！"
echo "    请打开浏览器访问: http://localhost:5000"
echo "========================================"
echo
echo "按 Ctrl+C 停止服务"
echo

python3 app.py
