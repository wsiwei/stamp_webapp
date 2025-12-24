import os
import cv2
import fitz
import numpy as np
import base64
import requests
import json
import time
from flask import Flask, request, jsonify, render_template, send_file, url_for
from werkzeug.utils import secure_filename
import shutil
from datetime import datetime

# ================= 配置区域 =================
API_KEY = "sk-hqvikeanuredrltsdfkhlffqyggjmeirjodrjjdlkwgplhlh"  # 你的API Key
TEMPLATE_FOLDER = r"D:\work\stamp_webapp\templates_sample"  # 模板文件夹路径
MODEL_NAME = "Qwen/Qwen3-VL-32B-Instruct" 

# 尺寸筛选配置
TARGET_DIAMETER_MM = 40.0  # 目标直径
TOLERANCE_MM = 1.0         # 容差范围 (+/-)

# Flask配置
UPLOAD_FOLDER = 'static/uploads'
TEMP_FOLDER = 'static/temp'
ALLOWED_EXTENSIONS = {'pdf'}

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['TEMP_FOLDER'] = TEMP_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB限制

# 确保目录存在
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(TEMP_FOLDER, exist_ok=True)

# ===========================================

class SealProcessor:
    """对应 yinzhang.py 的图像增强逻辑"""
    
    @staticmethod
    def img_binaryzation(hue_image, low_range, high_range, imgpng):
        th = cv2.inRange(hue_image, low_range, high_range)
        element = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 1))
        th = cv2.dilate(th, element)
        index1 = th == 255
        print_img = np.zeros(imgpng.shape, np.uint8)
        print_img[:, :, :] = (255, 255, 255, 0)
        print_img[index1] = imgpng[index1]
        return print_img

    @staticmethod
    def process_and_save(cv2_img, output_path):
        """
        输入: OpenCV格式的图片 (BGR)
        输出: 保存处理后的图片路径
        """
        # 1. 统一图片大小逻辑
        img_shape = cv2_img.shape
        img_w = 650 if img_shape[1] > 600 else 400
        # 保持比例调整
        scale_h = int(img_w * img_shape[0] / img_shape[1])
        image_resized = cv2.resize(cv2_img, (img_w, scale_h), interpolation=cv2.INTER_CUBIC)
        imgpng = cv2.cvtColor(image_resized.copy(), cv2.COLOR_RGB2RGBA)

        # 2. HSV 增强与提取
        hue_image = cv2.cvtColor(image_resized, cv2.COLOR_BGR2HSV)
        
        # 范围1
        low_range1 = np.array([65, 22, 13])
        high_range1 = np.array([180, 255, 255])
        print1 = SealProcessor.img_binaryzation(hue_image, low_range1, high_range1, imgpng)
        
        # 范围2
        low_range2 = np.array([0, 43, 46])
        high_range2 = np.array([9, 255, 255])
        print2 = SealProcessor.img_binaryzation(hue_image, low_range2, high_range2, imgpng)
        
        # 合并
        imgreal = cv2.add(print2, print1)

        # 3. 白色背景透明化处理
        white_px = np.asarray([255, 255, 255, 255])
        (row, col, _) = imgreal.shape
        
        # 4. 边缘检测与截取 (extension_img 逻辑)
        # 扩充边界
        print4 = cv2.copyMakeBorder(imgreal, 50, 50, 50, 50, cv2.BORDER_CONSTANT, value=[255, 255, 255, 0])
        print2gray = cv2.cvtColor(print4, cv2.COLOR_RGBA2GRAY)
        _, grayfirst = cv2.threshold(print2gray, 254, 255, cv2.THRESH_BINARY_INV)

        element = cv2.getStructuringElement(cv2.MORPH_RECT, (22, 22))
        img6 = cv2.dilate(grayfirst, element)
        c_canny_img = cv2.Canny(img6, 10, 10)

        contours, _ = cv2.findContours(c_canny_img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        
        if not contours:
            print("  [警告] 图像处理中未找到轮廓，保存原裁剪图")
            cv2.imwrite(output_path, cv2_img)
            return output_path

        # 找最大轮廓
        areas = []
        for i, cnt in enumerate(contours):
            x, y, w, h = cv2.boundingRect(cnt)
            areas.append([w * h, i])
        areas = sorted(areas, reverse=True)
        
        x, y, w, h = cv2.boundingRect(contours[areas[0][1]])
        print5 = print4[y:(y + h), x:(x + w)]

        # 补成正方形
        if print5.shape[0] < print5.shape[1]:
            zh = int((print5.shape[1] - print5.shape[0]) / 2)
            print5 = cv2.copyMakeBorder(print5, zh, zh, 0, 0, cv2.BORDER_CONSTANT, value=[255, 255, 255, 0])
        else:
            zh = int((print5.shape[0] - print5.shape[1]) / 2)
            print5 = cv2.copyMakeBorder(print5, 0, 0, zh, zh, cv2.BORDER_CONSTANT, value=[255, 255, 255, 0])

        # 5. 颜色统一改为红色
        gao, chang, _ = print5.shape
        b, g, r, a = cv2.split(print5)
        mask_red = (r > 0) & (r < 255)
        print5[mask_red, 2] = 254

        # 6. 最终Resize并保存
        resultprint = cv2.resize(print5, (250, 250))
        cv2.imwrite(output_path, resultprint, [cv2.IMWRITE_PNG_COMPRESSION, 0])
        return output_path

class PDFDetector:
    """对应 seal_size.py 的检测逻辑"""
    
    @staticmethod
    def detect_target_seals(pdf_path, output_dir):
        """
        返回符合尺寸要求的印章列表
        return: [{'id': 1, 'path': '...', 'diameter': 40.2}, ...]
        """
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        doc = fitz.open(pdf_path)
        page = doc[0] # 只处理第一页
        zoom = 300 / 72
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, 3)
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        img_h, img_w = img.shape[:2]
        
        # 计算比例 (A4宽度 210mm)
        pixel_to_mm_ratio = 210.0 / img_w
        
        # 提取红色区域
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        mask1 = cv2.inRange(hsv, np.array([0, 80, 80]), np.array([10, 255, 255]))
        mask2 = cv2.inRange(hsv, np.array([160, 80, 80]), np.array([180, 255, 255]))
        mask = mask1 + mask2

        # ✅ 加强形态学操作，连接相近区域
        kernel = np.ones((5, 5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)  # ✅ 闭操作连接
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)   # ✅ 开操作去噪
        mask = cv2.dilate(mask, kernel, iterations=1)                        # ✅ 膨胀填充

        # ✅ 可选：高斯模糊平滑边缘
        mask = cv2.GaussianBlur(mask, (5, 5), 0)
        _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        valid_seals = []
        count = 0
        
        print(f"[检测] 正在扫描 PDF 页面 (300DPI)...")
        
        for cnt in contours:
            (x, y), radius = cv2.minEnclosingCircle(cnt)
            diameter_px = radius * 2
            diameter_mm = diameter_px * pixel_to_mm_ratio
            
            count += 1  # ✅ 为所有检测到的轮廓计数
            
            # ✅ 显示所有检测到的印章信息
            if diameter_mm > 10:  # 忽略太小的噪点
                print(f"  -> 检测到印章{count}: 直径 {diameter_mm:.2f}mm")
            
            # 裁剪
            margin = int(radius * 0.2)
            x1 = max(0, int(x - radius - margin))
            y1 = max(0, int(y - radius - margin))
            x2 = min(img_w, int(x + radius + margin))
            y2 = min(img_h, int(y + radius + margin))
            
            seal_crop = img[y1:y2, x1:x2]
            
            if seal_crop.size == 0: 
                print(f"  [警告] 印章{count} 裁剪区域为空")
                continue

            # 处理并保存
            final_name = f"seal_{count}_processed.png"
            final_path = os.path.join(output_dir, final_name)
            
            print(f"     正在进行图像增强和去噪...")
            try:
                processed_path = SealProcessor.process_and_save(seal_crop, final_path)
                
                # ✅ 保存所有印章，不仅仅是符合尺寸的
                valid_seals.append({
                    "id": count,
                    "diameter": diameter_mm,
                    "path": processed_path,
                    "x": int(x),
                    "y": int(y),
                    "radius": int(radius)
                })
                
                # ✅ 额外标记是否符合尺寸
                if (TARGET_DIAMETER_MM - TOLERANCE_MM) <= diameter_mm <= (TARGET_DIAMETER_MM + TOLERANCE_MM):
                    print(f"     ✅ 符合尺寸要求 (40mm±1mm)")
                else:
                    print(f"     ⚠️  不符合尺寸要求")
                    
            except Exception as e:
                print(f"  [错误] 处理印章{count}失败: {str(e)}")
        
        doc.close()
        
        # ✅ 排序：符合尺寸的在前
        valid_seals.sort(key=lambda x: abs(x['diameter'] - TARGET_DIAMETER_MM))
        
        return valid_seals

class VLMClient:
    """对应 process_and_call_api.py 的API调用逻辑"""
    
    @staticmethod
    def encode_image(image_path):
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode('utf-8')

    @staticmethod
    def compare(processed_path, template_path):
        url = "https://api.siliconflow.cn/v1/chat/completions"
        
        img_processed = VLMClient.encode_image(processed_path)
        img_template = VLMClient.encode_image(template_path)

        prompt = '''你是一个专业的印章鉴定专家。请对比以下两张图片：\n
            图片1：是从文档中提取并增强处理后的印章（待检测）。\n
            图片2：是标准的印章模板（真章）。\n
            任务：\n
            1. 仔细对比文字内容（包括汉字、数字、编码）是否完全一致。\n
            2. 对比字体风格、字间距、文字排列方向。\n
            3. 对比五角星（如有）的大小、位置和形状。\n
            4. 忽略图片1可能存在的轻微模糊或边缘锯齿（由提取算法造成）。\n
            5. 检查图片1是否存在黑色字体覆盖在印章上面，若有，存在造假嫌疑。\n
            "请给出详细的分析报告，并最终给出"一致"或"不一致"的结论。
        '''

        payload = {
            "model": MODEL_NAME,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_processed}"}},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img_template}"}}
                    ]
                }
            ],
            "max_tokens": 1024
        }

        headers = {
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json"
        }

        print(f"\n[AI] 正在请求 API 进行对比...")
        print(f"     待测图: {os.path.basename(processed_path)}")
        print(f"     模板图: {os.path.basename(template_path)}")
        
        try:
            start_time = time.time()
            response = requests.post(url, json=payload, headers=headers)
            duration = time.time() - start_time
            
            if response.status_code == 200:
                print(f"     请求成功 (耗时 {duration:.2f}s)")
                return response.json()['choices'][0]['message']['content']
            else:
                return f"请求失败，错误码：{response.status_code}, {response.text}"
        except Exception as e:
            return f"请求发生异常: {str(e)}"

# 工具函数
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_templates():
    """获取模板列表"""
    if not os.path.exists(TEMPLATE_FOLDER):
        return []
    exts = ('.png', '.jpg', '.jpeg', '.bmp')
    templates = []
    for f in os.listdir(TEMPLATE_FOLDER):
        if f.lower().endswith(exts):
            templates.append(f)
    return templates

# 路由定义
@app.route('/')
def index():
    return render_template('index_pc.html')

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """上传PDF文件"""
    if 'file' not in request.files:
        return jsonify({'error': '没有文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
        filename = f"{timestamp}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        return jsonify({
            'message': '上传成功',
            'filename': filename,
            'filepath': filepath
        })
    
    return jsonify({'error': '文件类型不支持'}), 400

@app.route('/api/detect', methods=['POST'])
def detect_seals():
    """检测PDF中的印章"""
    data = request.get_json()
    filepath = data.get('filepath')
    
    if not filepath or not os.path.exists(filepath):
        return jsonify({'error': '文件不存在'}), 400
    
    # 清理临时目录
    temp_dir = app.config['TEMP_FOLDER']
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir, exist_ok=True)
    
    try:
        seals = PDFDetector.detect_target_seals(filepath, temp_dir)
        
        # 转换为可序列化的格式
        result = []
        for seal in seals:
            result.append({
                'id': seal['id'],
                'diameter': round(seal['diameter'], 2),
                'image_url': url_for('static', filename=f'temp/seal_{seal["id"]}_processed.png'),
                'x': seal['x'],
                'y': seal['y'],
                'radius': seal['radius']
            })
        
        return jsonify({
            'seals': result,
            'count': len(result)
        })
    except Exception as e:
        return jsonify({'error': f'检测失败: {str(e)}'}), 500

@app.route('/api/templates', methods=['GET'])
def get_template_list():
    """获取模板列表"""
    templates = get_templates()
    return jsonify({'templates': templates})

@app.route('/api/template/<path:filename>')
def get_template_image(filename):
    """获取模板图片"""
    safe_filename = secure_filename(filename)
    filepath = os.path.join(TEMPLATE_FOLDER, safe_filename)

    print(f"[DEBUG] 请求模板: {filename}")
    print(f"[DEBUG] 安全文件名: {safe_filename}")
    print(f"[DEBUG] 完整路径: {filepath}")
    print(f"[DEBUG] 文件是否存在: {os.path.exists(filepath)}")

    # 返回错误或默认图片
    default_image = os.path.join('static', 'default_template.png')
    if os.path.exists(default_image):
        return send_file(default_image)

    if os.path.exists(filepath):
        return send_file(filepath)
    
    
    return jsonify({'error': '模板不存在'}), 404

@app.route('/api/compare', methods=['POST'])
def compare_seals():
    """对比印章"""
    try:
        data = request.get_json()
        print(f"[DEBUG] 收到比对请求数据: {data}")
        
        seal_path = data.get('seal_path')
        template_name = data.get('template_name')
        
        if not seal_path or not template_name:
            print(f"[ERROR] 参数不完整: seal_path={seal_path}, template_name={template_name}")
            return jsonify({'error': '参数不完整', 'received': data}), 400
        
        print(f"[DEBUG] 原始印章路径: {seal_path}")
        print(f"[DEBUG] 原始模板名称: {template_name}")
        
        # 处理印章路径
        # 移除可能的开头的斜杠
        if seal_path.startswith('/'):
            seal_path = seal_path[1:]
            print(f"[DEBUG] 移除开头斜杠后: {seal_path}")
        
        # 如果路径以static/开头，移除它（因为os.path.join会处理）
        if seal_path.startswith('static/'):
            seal_path = seal_path[7:]
            print(f"[DEBUG] 移除static/后: {seal_path}")
        
        # 构建完整路径
        seal_full_path = os.path.join('static', seal_path)
        template_full_path = os.path.join(TEMPLATE_FOLDER, template_name)
        
        print(f"[DEBUG] 构建的印章路径: {seal_full_path}")
        print(f"[DEBUG] 构建的模板路径: {template_full_path}")
        print(f"[DEBUG] 印章路径是否存在: {os.path.exists(seal_full_path)}")
        print(f"[DEBUG] 模板路径是否存在: {os.path.exists(template_full_path)}")
        
        # 检查文件是否存在
        if not os.path.exists(seal_full_path):
            # 列出静态目录看看有什么文件
            static_dir = 'static'
            if os.path.exists(static_dir):
                print(f"[DEBUG] 静态目录内容:")
                for root, dirs, files in os.walk(static_dir):
                    level = root.replace(static_dir, '').count(os.sep)
                    indent = ' ' * 2 * level
                    print(f'{indent}{os.path.basename(root)}/')
                    subindent = ' ' * 2 * (level + 1)
                    for file in files:
                        print(f'{subindent}{file}')
            
            return jsonify({'error': f'印章图片不存在: {seal_full_path}', 
                          'seal_path': seal_path,
                          'full_path': seal_full_path}), 400
        
        if not os.path.exists(template_full_path):
            return jsonify({'error': f'模板图片不存在: {template_full_path}'}), 400
        
        # 执行比对
        print(f"[DEBUG] 开始调用VLMClient.compare...")
        result = VLMClient.compare(seal_full_path, template_full_path)
        print(f"[DEBUG] 比对完成")
        
        return jsonify({
            'result': result,
            'seal': os.path.basename(seal_full_path),
            'template': template_name
        })
        
    except Exception as e:
        print(f"[ERROR] 比对过程中发生异常: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'比对失败: {str(e)}'}), 500

@app.route('/api/cleanup', methods=['POST'])
def cleanup():
    """清理临时文件"""
    temp_dir = app.config['TEMP_FOLDER']
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir, exist_ok=True)
    return jsonify({'message': '清理完成'})

if __name__ == '__main__':
    print("="*60)
    print("      印章提取与智能比对系统 - Web服务")
    print(f"      模板目录: {TEMPLATE_FOLDER}")
    print("="*60)
    app.run(debug=True, host='0.0.0.0', port=5000)
