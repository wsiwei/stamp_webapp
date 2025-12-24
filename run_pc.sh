#!/bin/bash

# 设置终端标题
echo -ne "\033]0;印章提取与智能比对系统 - PC专业版\007"

clear
echo "═══════════════════════════════════════════════════════════════════"
echo "          印章提取与智能比对系统 - PC专业版                       "
echo "═══════════════════════════════════════════════════════════════════"
echo
echo "欢迎使用PC专业版！"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  功能特性:"
echo "    ✓ 专为PC浏览器优化的大屏界面"
echo "    ✓ 支持键盘快捷键操作"
echo "    ✓ 拖拽/粘贴上传文件"
echo "    ✓ 流畅的动画效果和交互体验"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# 检查Python环境
echo "[1/4] 正在检查Python环境..."
if ! command -v python3 &> /dev/null; then
    echo "  [✗] 未找到Python3"
    echo
    echo "请先安装Python 3.8或更高版本"
    echo "Ubuntu/Debian: sudo apt-get install python3"
    echo "CentOS/RHEL:   sudo yum install python3"
    echo "macOS:         brew install python"
    exit 1
fi
echo "  [✓] Python环境正常: $(python3 --version)"

# 检查并安装依赖
echo
echo "[2/4] 正在检查依赖..."
if ! python3 -c "import flask" &> /dev/null; then
    echo "  [!] 检测到缺少依赖包"
    echo "  正在安装依赖..."
    echo
    pip3 install -r requirements.txt
    if [ $? -ne 0 ]; then
        echo "  [✗] 依赖安装失败"
        echo "  请检查网络连接后重试"
        exit 1
    fi
    echo "  [✓] 依赖安装完成"
else
    echo "  [✓] 依赖检查通过"
fi

# 检查配置
echo
echo "[3/4] 正在检查配置..."
# 这里可以添加配置检查逻辑

# 启动服务
echo
echo "[4/4] 正在启动Web服务..."
echo
echo "═══════════════════════════════════════════════════════════════════"
echo "                    服务启动成功！                                "
echo "═══════════════════════════════════════════════════════════════════"
echo "  访问地址: http://localhost:5000"
echo "  停止服务: 按 Ctrl+C"
echo "  快捷键帮助: 按 F1"
echo "═══════════════════════════════════════════════════════════════════"
echo
echo "正在打开浏览器..."

# 延迟2秒后打开浏览器
sleep 2

# 尝试使用不同的命令打开浏览器
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:5000 &
elif command -v open &> /dev/null; then
    open http://localhost:5000 &
fi

# 启动Flask应用
python3 app.py

echo
echo "═══════════════════════════════════════════════════════════════════"
echo "                    服务已停止                                    "
echo "═══════════════════════════════════════════════════════════════════"
echo
