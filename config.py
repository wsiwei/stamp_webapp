# 配置文件
# 可以在此文件中修改系统配置

# ================= 配置区域 =================
API_KEY = "sk-hqvikeanuredrltsdfkhlffqyggjmeirjodrjjdlkwgplhlh"  # 你的API Key
TEMPLATE_FOLDER = r"D:\work\OCR\Template"  # 模板文件夹路径
MODEL_NAME = "Qwen/Qwen3-VL-32B-Instruct" 

# 尺寸筛选配置
TARGET_DIAMETER_MM = 40.0  # 目标直径
TOLERANCE_MM = 1.0         # 容差范围 (+/-)
# ===========================================

# Flask配置
UPLOAD_FOLDER = 'static/uploads'
TEMP_FOLDER = 'static/temp'
ALLOWED_EXTENSIONS = {'pdf'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB
