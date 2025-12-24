# 印章提取与智能比对系统 - Web前端

基于Flask的Web应用，提供PDF印章检测、提取和智能比对的完整前端解决方案。

## 🌟 功能特性

- **PDF上传**: 支持拖拽上传PDF文件
- **自动检测**: 自动检测PDF中符合尺寸要求（40mm±1mm）的红色印章
- **印章预览**: 显示检测到的印章及其尺寸信息
- **模板管理**: 从指定目录加载参考模板
- **智能比对**: 调用AI视觉模型进行印章比对分析
- **结果展示**: 可视化展示比对结果和AI分析报告

## 🛠️ 技术栈

- **后端**: Flask (Python Web框架)
- **前端**: HTML5 + CSS3 + JavaScript (ES6+)
- **UI框架**: Bootstrap 5
- **图像处理**: OpenCV + PyMuPDF
- **AI接口**: SiliconFlow API (Qwen3-VL-32B-Instruct)

## 📁 项目结构

```
stamp_webapp/
├── app.py                 # Flask主应用
├── requirements.txt       # Python依赖
├── templates/
│   └── index.html        # 主页面
├── static/
│   ├── css/              # 样式文件
│   ├── js/
│   │   └── app.js        # 前端逻辑
│   ├── uploads/          # 上传文件存储
│   └── temp/             # 临时文件
└── README.md             # 说明文档
```

## 🚀 本地运行指南

### 方法一：直接运行（推荐开发测试）

#### 1. 安装Python环境
确保已安装Python 3.8或更高版本：
```bash
python --version
```

#### 2. 安装依赖
在项目根目录执行：
```bash
pip install -r requirements.txt
```

#### 3. 配置模板目录
编辑 `app.py` 文件，修改模板目录路径：
```python
# 第12行 - 修改为你的模板文件夹路径
TEMPLATE_FOLDER = r"D:\work\OCR\Template"
```

#### 4. 配置API密钥（可选）
如果需要使用AI比对功能，确保API密钥有效：
```python
# 第11行 - API密钥
API_KEY = "sk-hqvikeanuredrltsdfkhlffqyggjmeirjodrjjdlkwgplhlh"
```

#### 5. 运行应用
```bash
python app.py
```

#### 6. 访问应用
打开浏览器访问：http://localhost:5000

---

### 方法二：使用批处理文件（Windows）

创建 `run.bat` 文件：
```batch
@echo off
echo 正在启动印章比对系统...
python app.py
pause
```

双击运行 `run.bat` 即可启动服务。

---

### 方法三：使用虚拟环境（推荐）

#### 1. 创建虚拟环境
```bash
python -m venv venv
```

#### 2. 激活虚拟环境
- Windows:
```bash
venv\Scripts\activate
```
- macOS/Linux:
```bash
source venv/bin/activate
```

#### 3. 安装依赖并运行
```bash
pip install -r requirements.txt
python app.py
```

---

## 📋 使用流程

### 1. 上传PDF
- 点击上传区域或拖拽PDF文件
- 支持单个PDF文件，最大16MB

### 2. 检测印章
- 点击"开始检测印章"按钮
- 系统自动扫描PDF第一页中的红色印章
- 筛选符合40mm±1mm尺寸要求的印章

### 3. 选择模板
- 从模板列表中选择参考模板
- 需要先选择要检测的印章
- 再选择对应的参考模板

### 4. 智能比对
- 点击"开始比对"按钮
- 系统调用AI模型进行比对分析
- 显示详细的比对报告和结论

---

## ⚙️ 配置说明

### 修改印章尺寸筛选
编辑 `app.py` 第16-17行：
```python
TARGET_DIAMETER_MM = 40.0    # 目标直径 (mm)
TOLERANCE_MM = 1.0           # 容差范围 (mm)
```

### 修改AI模型
编辑 `app.py` 第13行：
```python
MODEL_NAME = "Qwen/Qwen3-VL-32B-Instruct"  # AI模型名称
```

### 修改文件大小限制
编辑 `app.py` 第25行：
```python
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB
```

---

## 🔧 常见问题

### Q1: 启动时报错 "ModuleNotFoundError"
**原因**: 缺少依赖包
**解决**: 
```bash
pip install -r requirements.txt
```

### Q2: 无法检测到印章
**原因**: 
- PDF中没有红色印章
- 印章尺寸不在40mm±1mm范围内
- 印章颜色不是红色

**解决**: 
- 检查PDF第一页是否有红色印章
- 调整 `TARGET_DIAMETER_MM` 和 `TOLERANCE_MM` 参数
- 修改颜色检测范围（HSV值）

### Q3: 模板图片不显示
**原因**: 模板目录路径错误或图片格式不支持
**解决**:
- 确保 `TEMPLATE_FOLDER` 路径正确
- 支持的格式: .png, .jpg, .jpeg, .bmp

### Q4: AI比对失败
**原因**: API密钥无效或网络问题
**解决**:
- 检查API密钥是否有效
- 检查网络连接
- 查看控制台错误信息

### Q5: 端口5000被占用
**原因**: 其他程序占用了5000端口
**解决**: 修改 `app.py` 最后一行：
```python
app.run(debug=True, host='0.0.0.0', port=8080)  # 改为其他端口
```

---

## 📝 注意事项

1. **模板目录**: 确保 `D:\work\OCR\Template` 目录存在且包含模板图片
2. **文件权限**: 确保应用有读写权限
3. **网络连接**: AI比对功能需要网络连接
4. **浏览器兼容**: 推荐使用Chrome、Firefox、Edge等现代浏览器

---

## 🔄 系统要求

- **操作系统**: Windows 10/11, macOS, Linux
- **Python**: 3.8+
- **内存**: 建议4GB以上
- **磁盘空间**: 至少500MB可用空间

---

## 📞 技术支持

如有问题，请检查：
1. Python环境是否正确配置
2. 依赖包是否全部安装
3. 配置文件是否正确
4. 控制台错误信息

---

## 📄 许可证

本项目仅供学习和内部使用。
