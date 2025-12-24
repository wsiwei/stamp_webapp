#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
快速配置脚本 - 设置模板目录
"""

import os
import sys
import shutil

def print_header():
    print("=" * 60)
    print("     印章系统 - 模板目录快速配置工具")
    print("=" * 60)
    print()

def detect_os():
    if sys.platform.startswith('win'):
        return 'Windows'
    elif sys.platform.startswith('darwin'):
        return 'macOS'
    else:
        return 'Linux'

def get_default_template_path():
    system = detect_os()
    if system == 'Windows':
        return r"C:\印章模板库"
    else:
        return os.path.expanduser("~/stamp_templates")

def create_template_directory(path):
    try:
        if not os.path.exists(path):
            os.makedirs(path)
            print(f"✓ 已创建目录: {path}")
        else:
            print(f"✓ 目录已存在: {path}")
        return True
    except Exception as e:
        print(f"✗ 创建目录失败: {e}")
        return False

def copy_sample_templates(dest_path):
    sample_dir = "templates_sample"
    if not os.path.exists(sample_dir):
        print(f"✗ 示例模板目录不存在: {sample_dir}")
        return False
    
    try:
        for filename in os.listdir(sample_dir):
            src = os.path.join(sample_dir, filename)
            dst = os.path.join(dest_path, filename)
            if os.path.isfile(src):
                shutil.copy2(src, dst)
                print(f"  已复制: {filename}")
        print(f"✓ 示例模板已复制到: {dest_path}")
        return True
    except Exception as e:
        print(f"✗ 复制模板失败: {e}")
        return False

def update_app_py(template_path):
    try:
        with open('app.py', 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 替换模板路径
        old_pattern = r'TEMPLATE_FOLDER = r"[^"]*"'
        new_line = f'TEMPLATE_FOLDER = r"{template_path}"'
        
        import re
        content = re.sub(old_pattern, new_line, content)
        
        with open('app.py', 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"✓ 已更新 app.py 中的模板路径")
        return True
    except Exception as e:
        print(f"✗ 更新 app.py 失败: {e}")
        return False

def verify_setup(path):
    print()
    print("正在验证配置...")
    
    # 检查目录
    if os.path.exists(path):
        print(f"✓ 目录存在: {path}")
    else:
        print(f"✗ 目录不存在: {path}")
        return False
    
    # 检查文件
    files = [f for f in os.listdir(path) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
    if files:
        print(f"✓ 找到 {len(files)} 个模板文件:")
        for f in files[:5]:  # 只显示前5个
            print(f"    - {f}")
        if len(files) > 5:
            print(f"    ... 还有 {len(files) - 5} 个文件")
    else:
        print(f"✗ 未找到模板文件")
        return False
    
    return True

def main():
    print_header()
    
    system = detect_os()
    print(f"检测到操作系统: {system}")
    print()
    
    # 显示选项
    print("请选择配置方式:")
    print("1. 使用默认路径（推荐）")
    print("2. 使用示例目录（快速测试）")
    print("3. 自定义路径")
    print("4. 仅查看当前配置")
    print("5. 退出")
    print()
    
    choice = input("请输入选项 (1-5): ").strip()
    
    if choice == '1':
        path = get_default_template_path()
        print(f"默认路径: {path}")
        
        if create_template_directory(path):
            copy_sample_templates(path)
            if update_app_py(path):
                if verify_setup(path):
                    print()
                    print("🎉 配置完成！")
                    print(f"模板目录: {path}")
                    print("现在可以启动应用了: python app.py")
                else:
                    print("❌ 验证失败")
            else:
                print("❌ 更新配置文件失败")
        else:
            print("❌ 创建目录失败")
    
    elif choice == '2':
        path = "templates_sample"
        print(f"示例目录: {path}")
        
        if update_app_py(path):
            if verify_setup(path):
                print()
                print("🎉 配置完成！")
                print("现在可以启动应用了: python app.py")
            else:
                print("❌ 验证失败")
        else:
            print("❌ 更新配置文件失败")
    
    elif choice == '3':
        path = input("请输入模板目录路径: ").strip()
        if not path:
            print("❌ 路径不能为空")
            return
        
        # 处理路径中的引号
        path = path.strip('"\'')
        
        if create_template_directory(path):
            copy_sample_templates(path)
            if update_app_py(path):
                if verify_setup(path):
                    print()
                    print("🎉 配置完成！")
                    print(f"模板目录: {path}")
                    print("现在可以启动应用了: python app.py")
                else:
                    print("❌ 验证失败")
            else:
                print("❌ 更新配置文件失败")
        else:
            print("❌ 创建目录失败")
    
    elif choice == '4':
        try:
            with open('app.py', 'r', encoding='utf-8') as f:
                content = f.read()
            
            import re
            match = re.search(r'TEMPLATE_FOLDER = r"([^"]*)"', content)
            if match:
                current_path = match.group(1)
                print(f"当前模板路径: {current_path}")
                print(f"路径存在: {os.path.exists(current_path)}")
                
                if os.path.exists(current_path):
                    files = [f for f in os.listdir(current_path) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp'))]
                    print(f"模板文件数量: {len(files)}")
            else:
                print("❌ 无法读取当前配置")
        except Exception as e:
            print(f"❌ 读取配置文件失败: {e}")
    
    elif choice == '5':
        print("已退出")
    else:
        print("❌ 无效的选项")

if __name__ == "__main__":
    main()
