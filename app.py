import os
import cv2
import fitz
import numpy as np
import base64
import requests
import json
import time
import shutil
import glob
from flask import Flask, request, jsonify, render_template, send_file, url_for
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta

# ================= 配置区域 =================
API_KEY = "sk-hqvikeanuredrltsdfkhlffqyggjmeirjodrjjdlkwgplhlh"
TEMPLATE_FOLDER = r"D:\work\stamp_webapp\templates_sample"
MODEL_NAME = "Qwen/Qwen3-VL-32B-Instruct"

# 尺寸筛选配置
TARGET_DIAMETER_MM = 40.0
TOLERANCE_MM = 1.0

# Flask配置
UPLOAD_FOLDER = 'static/uploads'
TEMP_FOLDER = 'static/temp'
ALLOWED_EXTENSIONS = {'pdf'}

# 文件清理配置
MAX_UPLOAD_FILES = 10  # 最多保留的文件数
MAX_UPLOAD_AGE_HOURS = 24  # 文件最大保留时间（小时）

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['TEMP_FOLDER'] = TEMP_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

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
        返回检测到的所有印章列表（不进行尺寸筛选）
        return: [{'id': 1, 'path': '...', 'diameter': 40.2}, ...]
        """
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        doc = fitz.open(pdf_path)
        valid_seals = []
        count = 0
        
        print(f"[检测] 正在扫描 PDF 所有页面...")
        
        # 处理所有页面
        for page_num, page in enumerate(doc):
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

            # 加强形态学操作
            kernel = np.ones((5, 5), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
            mask = cv2.dilate(mask, kernel, iterations=1)
            
            mask = cv2.GaussianBlur(mask, (5, 5), 0)
            _, mask = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            for cnt in contours:
                (x, y), radius = cv2.minEnclosingCircle(cnt)
                diameter_px = radius * 2
                diameter_mm = diameter_px * pixel_to_mm_ratio
                
                # 过滤掉太小的噪点（直径小于5mm的忽略）
                if diameter_mm < 5:
                    continue
                
                count += 1
                
                # 裁剪印章区域
                margin = int(radius * 0.2)
                x1 = max(0, int(x - radius - margin))
                y1 = max(0, int(y - radius - margin))
                x2 = min(img_w, int(x + radius + margin))
                y2 = min(img_h, int(y + radius + margin))
                
                seal_crop = img[y1:y2, x1:x2]
                
                if seal_crop.size == 0:
                    print(f"  [警告] 第{page_num+1}页印章{count} 裁剪区域为空")
                    continue

                # 处理并保存
                final_name = f"seal_{count}_processed.png"
                final_path = os.path.join(output_dir, final_name)
                
                print(f"  第{page_num+1}页 -> 印章{count}: 直径 {diameter_mm:.2f}mm")
                
                try:
                    processed_path = SealProcessor.process_and_save(seal_crop, final_path)
                    
                    valid_seals.append({
                        "id": count,
                        "diameter": diameter_mm,
                        "path": processed_path,
                        "x": int(x),
                        "y": int(y),
                        "radius": int(radius),
                        "page": page_num + 1  # 添加页面信息
                    })
                    
                except Exception as e:
                    print(f"  [错误] 处理第{page_num+1}页印章{count}失败: {str(e)}")
        
        doc.close()
        
        # 按页面和位置排序
        valid_seals.sort(key=lambda x: (x['page'], x['y']))
        
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
            2. 对比字体样式、风格、字间距、文字排列方向。\n
            3. 对比五角星（如有）的大小、位置和形状。\n
            4. 忽略图片1可能存在的轻微模糊或边缘锯齿（由提取算法造成）。\n
            "请给出详细的分析报告，并按以下格式和markdown红色高亮最终给出"一致"或"不一致"的结论。
            格式：
                结论：[一致/不一致]
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

ALLOWED_TEMPLATE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp'}

# 工具函数
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_template(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_TEMPLATE_EXTENSIONS
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

def cleanup_old_files():
    """清理旧的上传文件"""
    try:
        upload_dir = app.config['UPLOAD_FOLDER']
        if not os.path.exists(upload_dir):
            return
        
        files = []
        for f in os.listdir(upload_dir):
            if f.lower().endswith('.pdf'):
                filepath = os.path.join(upload_dir, f)
                mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
                files.append((filepath, mtime))
        
        # 按修改时间排序（旧的在前面）
        files.sort(key=lambda x: x[1])
        
        # 删除旧文件（超过数量限制或时间限制）
        cutoff_time = datetime.now() - timedelta(hours=MAX_UPLOAD_AGE_HOURS)
        deleted_count = 0
        
        for i, (filepath, mtime) in enumerate(files):
            should_delete = False
            
            # 1. 如果文件太旧
            if mtime < cutoff_time:
                should_delete = True
            # 2. 如果文件数量超过限制（保留最新的）
            elif i < len(files) - MAX_UPLOAD_FILES:
                should_delete = True
            
            if should_delete:
                try:
                    os.remove(filepath)
                    deleted_count += 1
                    print(f"  [清理] 删除旧文件: {os.path.basename(filepath)}")
                except Exception as e:
                    print(f"  [清理] 删除文件失败 {filepath}: {e}")
        
        if deleted_count > 0:
            print(f"  [清理] 已清理 {deleted_count} 个旧文件")
            
    except Exception as e:
        print(f"  [清理] 清理文件时出错: {e}")

def cleanup_temp_folder():
    """清理临时文件夹，确保全新开始"""
    temp_dir = app.config['TEMP_FOLDER']
    
    # 先删除整个文件夹
    if os.path.exists(temp_dir):
        try:
            shutil.rmtree(temp_dir)
            print(f"  [清理] 已删除临时文件夹: {temp_dir}")
        except Exception as e:
            print(f"  [清理] 删除临时文件夹失败: {e}")
    
    # 重新创建
    os.makedirs(temp_dir, exist_ok=True)
    
    # 确保文件夹为空
    if os.listdir(temp_dir):
        print(f"  [警告] 临时文件夹不为空: {os.listdir(temp_dir)}")
        # 尝试再次清理
        for f in os.listdir(temp_dir):
            try:
                os.remove(os.path.join(temp_dir, f))
            except:
                pass

def add_timestamp_to_url(url):
    """为URL添加时间戳防止缓存"""
    if not url:
        return url
    
    # 如果已经有查询参数
    if '?' in url:
        return f"{url}&_t={int(time.time())}"
    else:
        return f"{url}?_t={int(time.time())}"

# 路由定义
@app.route('/')
def index():
    return render_template('index_pc.html')

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """上传PDF文件"""
    # 先清理旧文件
    cleanup_old_files()
    
    if 'file' not in request.files:
        return jsonify({'error': '没有文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400
    
    if file and allowed_file(file.filename):
        # 处理文件名，确保保留 .pdf 后缀
        original_filename = file.filename
        secure_name = secure_filename(original_filename)
        
        # 如果 secure_filename 把后缀搞没了（例如 "中文.pdf" -> "pdf"），手动补上
        if not secure_name.lower().endswith('.pdf'):
            # 尝试提取原始后缀
            if original_filename.lower().endswith('.pdf'):
                if secure_name:
                    secure_name = f"{secure_name}.pdf"
                else:
                    # 极端情况：文件名全是非安全字符
                    secure_name = "document.pdf"
            else:
                secure_name = f"{secure_name}.pdf"

        timestamp = datetime.now().strftime('%Y%m%d%H%M%S%f')[:-3]  # 毫秒级时间戳
        filename = f"{timestamp}_{secure_name}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        return jsonify({
            'message': '上传成功',
            'filename': filename,
            'filepath': filepath,
            'timestamp': timestamp  # 返回时间戳给前端
        })
    
    return jsonify({'error': '文件类型不支持'}), 400

@app.route('/api/preview/<path:filename>')
def preview_file(filename):
    """预览文件，强制 inline 显示"""
    # 防止路径遍历
    if '..' in filename or filename.startswith('/'):
        return jsonify({'error': '非法路径'}), 400
        
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    if os.path.exists(filepath):
        response = send_file(filepath)
        # 关键：设置 Content-Disposition 为 inline
        response.headers['Content-Disposition'] = 'inline'
        response.headers['Content-Type'] = 'application/pdf'
        return response
    
    return jsonify({'error': '文件不存在'}), 404

@app.route('/api/detect', methods=['POST'])
def detect_seals():
    """检测PDF中的印章"""
    data = request.get_json()
    filepath = data.get('filepath')
    
    if not filepath or not os.path.exists(filepath):
        return jsonify({'error': '文件不存在'}), 400
    
    # 彻底清理临时目录
    cleanup_temp_folder()
    
    try:
        seals = PDFDetector.detect_target_seals(filepath, TEMP_FOLDER)
        
        # 转换为可序列化的格式，添加时间戳防止缓存
        result = []
        for seal in seals:
            # 添加时间戳到图片URL
            image_url = url_for('static', filename=f'temp/seal_{seal["id"]}_processed.png')
            image_url_with_timestamp = add_timestamp_to_url(image_url)
            
            result.append({
                'id': seal['id'],
                'diameter': round(seal['diameter'], 2),
                'image_url': image_url_with_timestamp,  # 使用带时间戳的URL
                'original_image_url': image_url,  # 保留原始URL
                'x': seal['x'],
                'y': seal['y'],
                'radius': seal['radius'],
                'page': seal.get('page', 1),
                'timestamp': int(time.time())  # 添加时间戳
            })
        
        return jsonify({
            'seals': result,
            'count': len(result),
            'timestamp': int(time.time())  # 返回时间戳
        })
    except Exception as e:
        return jsonify({'error': f'检测失败: {str(e)}'}), 500

@app.route('/api/upload_template', methods=['POST'])
def upload_template():
    """上传模板图片"""
    if 'file' not in request.files:
        return jsonify({'error': '没有文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '未选择文件'}), 400
        
    if file and allowed_template(file.filename):
        # 确保模板目录存在
        os.makedirs(TEMPLATE_FOLDER, exist_ok=True)
        
        filename = secure_filename(file.filename)
        filepath = os.path.join(TEMPLATE_FOLDER, filename)
        
        # 保存文件 (如果存在则覆盖)
        file.save(filepath)
        
        return jsonify({
            'message': '上传成功',
            'filename': filename
        })
        
    return jsonify({'error': '不支持的文件格式'}), 400

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
    
    if os.path.exists(filepath):
        # 为模板图片也添加时间戳防止缓存
        response = send_file(filepath)
        # 设置缓存控制头
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        return response
    
    return jsonify({'error': '模板不存在'}), 404

@app.route('/api/compare', methods=['POST'])
def compare_seals():
    """对比印章"""
    try:
        data = request.get_json()
        
        seal_path = data.get('seal_path')
        template_name = data.get('template_name')
        
        if not seal_path or not template_name:
            return jsonify({'error': '参数不完整'}), 400
        
        # 移除时间戳参数（如果有）
        if '?_t=' in seal_path:
            seal_path = seal_path.split('?_t=')[0]
        
        # 构建完整路径
        seal_full_path = os.path.join('static', seal_path) if not seal_path.startswith('static/') else seal_path
        template_full_path = os.path.join(TEMPLATE_FOLDER, template_name)
        
        # 检查文件是否存在
        if not os.path.exists(seal_full_path):
            # 尝试不带"temp/"前缀的路径
            if 'temp/' in seal_full_path:
                alt_path = seal_full_path.replace('temp/', '')
                if os.path.exists(alt_path):
                    seal_full_path = alt_path
                else:
                    return jsonify({'error': f'印章图片不存在: {seal_full_path}'}), 400
        
        if not os.path.exists(template_full_path):
            return jsonify({'error': f'模板图片不存在: {template_full_path}'}), 400
        
        # 执行比对
        result = VLMClient.compare(seal_full_path, template_full_path)
        
        return jsonify({
            'result': result,
            'seal': os.path.basename(seal_full_path),
            'template': template_name,
            'timestamp': int(time.time())
        })
        
    except Exception as e:
        print(f"[ERROR] 比对过程中发生异常: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'比对失败: {str(e)}'}), 500

@app.route('/api/cleanup', methods=['POST'])
def cleanup():
    """清理临时文件"""
    cleanup_temp_folder()
    cleanup_old_files()  # 同时清理旧的上传文件
    return jsonify({'message': '清理完成'})

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查，顺便清理文件"""
    cleanup_old_files()
    return jsonify({'status': 'healthy', 'timestamp': int(time.time())})


if __name__ == '__main__':
    print("="*60)
    print("      印章提取与智能比对系统 - Web服务")
    print(f"      模板目录: {TEMPLATE_FOLDER}")
    print(f"      自动清理: {MAX_UPLOAD_FILES}个文件或{MAX_UPLOAD_AGE_HOURS}小时")
    print("="*60)
    
    # 启动时清理一次
    cleanup_old_files()
    
    app.run(debug=True, host='0.0.0.0', port=5000)
