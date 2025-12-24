class StampAppPC {
    constructor() {
        this.uploadedFile = null;
        this.detectedSeals = [];
        this.templates = [];
        this.selectedSeal = null;
        this.selectedTemplate = null;
        this.currentStep = 1;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupKeyboardShortcuts();
        this.loadTemplates();
        this.showShortcutHint();

        // 初始化模板显示
        console.log('应用初始化完成');
    }
    
    setupEventListeners() {
        // 文件上传相关
        const uploadZone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');
        
        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
        uploadZone.addEventListener('drop', this.handleDrop.bind(this));
        uploadZone.addEventListener('paste', this.handlePaste.bind(this));
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        
        // 按钮事件
        document.getElementById('detectBtn').addEventListener('click', this.detectSeals.bind(this));
        document.getElementById('compareBtn').addEventListener('click', this.compareSeals.bind(this));
        document.getElementById('resetBtn').addEventListener('click', this.resetSelection.bind(this));
        document.getElementById('newCompareBtn').addEventListener('click', this.newComparison.bind(this));
        
        // 窗口事件
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', (e) => e.preventDefault());
    }
    
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+O: 打开文件
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                document.getElementById('fileInput').click();
            }
            
            // Ctrl+D: 检测印章
            if (e.ctrlKey && e.key === 'd') {
                e.preventDefault();
                if (this.uploadedFile && !document.getElementById('detectBtn').disabled) {
                    this.detectSeals();
                }
            }
            
            // Ctrl+Enter: 开始比对
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                if (this.selectedSeal && this.selectedTemplate) {
                    this.compareSeals();
                }
            }
            
            // Ctrl+N: 新比对
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.newComparison();
            }
            
            // F1: 显示/隐藏快捷键提示
            if (e.key === 'F1') {
                e.preventDefault();
                this.toggleShortcutHint();
            }
            
            // Escape: 关闭弹窗
            if (e.key === 'Escape') {
                this.hideShortcutHint();
                const modal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
                if (modal) modal.hide();
            }
        });
    }
    
    showShortcutHint() {
        setTimeout(() => {
            document.getElementById('shortcutHint').classList.add('show');
            setTimeout(() => {
                document.getElementById('shortcutHint').classList.remove('show');
            }, 5000);
        }, 2000);
    }
    
    toggleShortcutHint() {
        const hint = document.getElementById('shortcutHint');
        hint.classList.toggle('show');
    }
    
    hideShortcutHint() {
        document.getElementById('shortcutHint').classList.remove('show');
    }
    
    handleDragOver(e) {
        e.preventDefault();
        document.getElementById('uploadZone').classList.add('dragover');
    }
    
    handleDragLeave(e) {
        e.preventDefault();
        document.getElementById('uploadZone').classList.remove('dragover');
    }
    
    handleDrop(e) {
        e.preventDefault();
        document.getElementById('uploadZone').classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.uploadFile(files[0]);
        }
    }
    
    handlePaste(e) {
        const items = e.clipboardData.items;
        for (let item of items) {
            if (item.kind === 'file' && item.type === 'application/pdf') {
                const file = item.getAsFile();
                this.uploadFile(file);
                break;
            }
        }
    }
    
    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.uploadFile(file);
        }
    }
    
    async uploadFile(file) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            this.showConfirm('文件格式错误', '请上传PDF格式的文件', () => {});
            return;
        }
        
        if (file.size > 16 * 1024 * 1024) {
            this.showConfirm('文件过大', '文件大小不能超过16MB', () => {});
            return;
        }
        
        this.showLoading('正在上传文件...', '请稍候...');
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.uploadedFile = result;
                this.displayFileInfo(file);
                this.updateStep(2);
                this.hideLoading();
            } else {
                this.hideLoading();
                this.showConfirm('上传失败', result.error || '上传失败', () => {});
            }
        } catch (error) {
            this.hideLoading();
            this.showConfirm('网络错误', '网络连接失败: ' + error.message, () => {});
        }
    }
    
    displayFileInfo(file) {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = `
            <div class="file-item">
                <i class="bi bi-file-earmark-pdf file-icon"></i>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${this.formatFileSize(file.size)}</div>
                </div>
                <div class="ms-auto">
                    <i class="bi bi-check-circle-fill text-success" style="font-size: 1.5rem;"></i>
                </div>
            </div>
        `;
        fileList.style.display = 'block';
        document.getElementById('detectSection').style.display = 'block';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    async detectSeals() {
        if (!this.uploadedFile) return;
        
        this.showLoading('正在检测印章...', 'AI正在分析PDF中的印章，请稍候...');
        
        try {
            const response = await fetch('/api/detect', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filepath: this.uploadedFile.filepath
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.detectedSeals = result.seals;
                this.displaySeals();

                // 显示模板选择区域
                document.getElementById('templateCard').style.display = 'block';

                this.updateStep(3);
                this.hideLoading();
            } else {
                this.hideLoading();
                this.showConfirm('检测失败', result.error || '检测失败', () => {});
            }
        } catch (error) {
            this.hideLoading();
            this.showConfirm('检测出错', '检测过程中发生错误: ' + error.message, () => {});
        }
    }
    
    displaySeals() {
        const sealsSection = document.getElementById('sealsSection');
        const sealsGrid = document.getElementById('sealsGrid');
        const sealCount = document.getElementById('sealCount');
        
        sealCount.textContent = this.detectedSeals.length;
        sealsGrid.innerHTML = '';
        
        if (this.detectedSeals.length === 0) {
            sealsGrid.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-warning text-center py-4">
                        <i class="bi bi-exclamation-triangle me-2" style="font-size: 2rem;"></i>
                        <h5 class="mt-2">未检测到符合条件的印章</h5>
                        <p class="mb-0">请确保PDF第一页有红色印章，且直径在40mm±1mm范围内</p>
                    </div>
                </div>
            `;
        } else {
            this.detectedSeals.forEach(seal => {
                const sealCard = document.createElement('div');
                sealCard.className = 'seal-card';
                
                // 直接使用 seal.image_url，不要创建额外的变量
                const imgUrl = seal.image_url; // 使用局部变量
                
                sealCard.innerHTML = `
                    <div class="seal-image-container">
                        <img src="${imgUrl}" class="seal-image" alt="印章 ${seal.id}">
                        <div class="seal-badge">
                            <i class="bi bi-ruler me-1"></i>
                            ${seal.diameter}mm
                        </div>
                        ${seal.page ? `<div class="seal-page-badge" style="position:absolute; top:12px; left:12px; background:rgba(0,0,0,0.8); color:white; padding:0.25rem 0.5rem; border-radius:10px; font-size:0.75rem;">
                            <i class="bi bi-file-text me-1"></i>第${seal.page}页
                        </div>` : ''}
                    </div>
                    <div class="seal-info">
                        <div class="seal-title">印章 ${seal.id}</div>
                        <div class="seal-meta">
                            <i class="bi bi-geo-alt me-1"></i>
                            位置: (${seal.x}, ${seal.y})
                        </div>
                    </div>
                `;
                
                sealCard.addEventListener('click', () => this.selectSeal(seal));
                sealsGrid.appendChild(sealCard);
            });
            
            // ✅ 显示模板区域
            document.getElementById('templateCard').style.display = 'block';
            
            // ✅ 如果模板还没加载，重新加载一下
            if (this.templates.length === 0) {
                this.loadTemplates();
            }
        }
        
        sealsSection.style.display = 'block';
        sealsSection.classList.add('fade-in-up');
    }
    
    selectSeal(seal) {
        // 移除之前的选中状态
        document.querySelectorAll('.seal-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // 添加选中状态
        event.currentTarget.classList.add('selected');
        
        this.selectedSeal = seal;

        // 为比对保存正确的路径（移除开头的斜杠）
        if (seal.image_url.startsWith('/static/')) {
            this.selectedSeal.compare_path = seal.image_url.substring(1); // 移除开头的斜杠
        } else {
            this.selectedSeal.compare_path = seal.image_url;
        }

        this.checkCompareReady();
        
        // 滚动到模板选择区域
        document.getElementById('templateCard').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
    }
    
    async loadTemplates() {
        try {
            const response = await fetch('/api/templates');
            const result = await response.json();
            
            if (response.ok) {
                console.log('获取到模板:', result.templates);
                this.templates = result.templates;
                
                // ✅ 获取成功后立即显示模板
                if (this.templates.length > 0) {
                    this.displayTemplates();
                }
            }
        } catch (error) {
            console.error('加载模板失败:', error);
        }
    }
    
    displayTemplates() {
        const templatesGrid = document.getElementById('templatesGrid');
        if (!templatesGrid) {
            console.error('模板网格元素不存在');
            return;
        }
        templatesGrid.innerHTML = '';

        console.log('显示模板，数量:', this.templates.length);
        
        if (this.templates.length === 0) {
            templatesGrid.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-warning text-center py-4">
                        <i class="bi bi-folder-x me-2" style="font-size: 2rem;"></i>
                        <h5 class="mt-2">未找到模板图片</h5>
                        <p class="mb-0">请检查模板目录: D:\work\OCR\Template</p>
                    </div>
                </div>
            `;
            return;
        }
        
        this.templates.forEach((template, index) => {
            const templateItem = document.createElement('div');
            templateItem.className = 'template-item';
            templateItem.innerHTML = `
                <img src="/api/template/${encodeURIComponent(template)}" 
                     class="template-image" 
                     alt="模板 ${index + 1}">
                <div class="template-name" title="${template}">${template}</div>
            `;
            
            // 图片加载失败处理
            const img = templateItem.querySelector('img');
            img.onerror = function() {
                console.log('图片加载失败，使用默认样式');
                this.onerror = null; // 防止循环
                this.style.backgroundColor = '#f8f9fa';
                this.style.border = '1px dashed #dee2e6';
                this.style.display = 'flex';
                this.style.alignItems = 'center';
                this.style.justifyContent = 'center';
                this.innerHTML = '<span style="color: #6c757d; font-size: 12px;">图片</span>';
            };
            
            templateItem.addEventListener('click', (e) => {
                document.querySelectorAll('.template-item').forEach(item => {
                    item.classList.remove('selected');
                });
                e.currentTarget.classList.add('selected');
                this.selectedTemplate = template;
                this.checkCompareReady();
            });
            
            templatesGrid.appendChild(templateItem);
        });
    }
    
    selectTemplate(template) {
        // 移除之前的选中状态
        document.querySelectorAll('.template-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 添加选中状态
        event.currentTarget.classList.add('selected');
        
        this.selectedTemplate = template;
        this.checkCompareReady();
    }
    
    checkCompareReady() {
        const compareBtn = document.getElementById('compareBtn');
        if (this.selectedSeal && this.selectedTemplate) {
            compareBtn.disabled = false;
            compareBtn.classList.add('pulse');
        } else {
            compareBtn.disabled = true;
            compareBtn.classList.remove('pulse');
        }
    }
    
    async compareSeals() {
        if (!this.selectedSeal || !this.selectedTemplate) {
            this.showConfirm('选择不完整', '请先选择要比对的印章和模板', () => {});
            return;
        }
        
        this.showLoading('正在进行AI智能比对...', '正在调用视觉模型分析印章，请稍候...');
        
        try {
            const response = await fetch('/api/compare', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    seal_path: this.selectedSeal.compare_path || this.selectedSeal.image_url,
                    template_name: this.selectedTemplate
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.displayResult(result);
                this.updateStep(4);
                this.hideLoading();
            } else {
                this.hideLoading();
                this.showConfirm('比对失败', result.error || '比对失败', () => {});
            }
        } catch (error) {
            this.hideLoading();
            this.showConfirm('比对出错', '比对过程中发生错误: ' + error.message, () => {});
        }
    }
    
    displayResult(result) {
        const resultSection = document.getElementById('resultSection');
        
        // 设置图片
        document.getElementById('resultSealImage').src = this.selectedSeal.image_url;
        document.getElementById('resultSealDiameter').textContent = this.selectedSeal.diameter;
        document.getElementById('resultTemplateImage').src = `/api/template/${encodeURIComponent(this.selectedTemplate)}`;
        document.getElementById('resultTemplateName').textContent = this.selectedTemplate;
        
        // 设置报告内容
        const reportContent = document.getElementById('reportContent');
        reportContent.innerHTML = result.result.replace(/\n/g, '<br>');
        
        // 判断结论并设置样式
        const conclusion = result.result.toLowerCase();
        let alertClass = 'alert-info';
        let icon = 'bi-info-circle';
        
        if (conclusion.includes('一致') || conclusion.includes('相同')) {
            alertClass = 'alert-success';
            icon = 'bi-check-circle';
        } else if (conclusion.includes('不一致') || conclusion.includes('不同')) {
            alertClass = 'alert-danger';
            icon = 'bi-exclamation-circle';
        }
        
        reportContent.className = `report-content alert ${alertClass}`;
        
        resultSection.style.display = 'block';
        resultSection.classList.add('fade-in-up');
        
        // 滚动到结果区域
        setTimeout(() => {
            resultSection.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        }, 100);
    }
    
    updateStep(step) {
        this.currentStep = step;
        
        // 重置所有步骤
        for (let i = 1; i <= 4; i++) {
            const stepEl = document.getElementById(`step${i}`);
            stepEl.classList.remove('active', 'completed');
        }
        
        // 标记完成的步骤
        for (let i = 1; i < step; i++) {
            document.getElementById(`step${i}`).classList.add('completed');
        }
        
        // 标记当前步骤
        document.getElementById(`step${step}`).classList.add('active');
    }
    
    resetSelection() {
        // 重置选择
        this.selectedSeal = null;
        this.selectedTemplate = null;
        
        // 重置UI
        document.querySelectorAll('.seal-card').forEach(card => {
            card.classList.remove('selected');
        });
        document.querySelectorAll('.template-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        this.checkCompareReady();
        
        // 隐藏结果
        const resultSection = document.getElementById('resultSection');
        resultSection.style.display = 'none';
        resultSection.classList.remove('fade-in-up');
        
        // 滚动到印章选择区域
        document.getElementById('sealsSection').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
        
        this.updateStep(3);
    }
    
    newComparison() {
        this.showConfirm('确认新建比对', '这将清除当前所有数据，开始新的比对。是否继续？', () => {
            // 清理临时文件
            fetch('/api/cleanup', { method: 'POST' }).catch(console.error);
            
            // 重置所有状态
            this.uploadedFile = null;
            this.detectedSeals = [];
            this.selectedSeal = null;
            this.selectedTemplate = null;
            this.currentStep = 1;
            
            // 隐藏所有区域
            document.getElementById('fileList').style.display = 'none';
            document.getElementById('detectSection').style.display = 'none';
            document.getElementById('sealsSection').style.display = 'none';
            document.getElementById('resultSection').style.display = 'none';
            
            // 移除动画类
            document.getElementById('sealsSection').classList.remove('fade-in-up');
            document.getElementById('resultSection').classList.remove('fade-in-up');
            
            // 清空文件输入
            document.getElementById('fileInput').value = '';
            
            // 回到第一步
            this.updateStep(1);
            
            // 滚动到顶部
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
    
    showLoading(title, desc) {
        document.getElementById('loadingTitle').textContent = title;
        document.getElementById('loadingDesc').textContent = desc;
        document.getElementById('loadingOverlay').style.display = 'flex';
    }
    
    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }
    
    showConfirm(title, message, callback) {
        document.querySelector('#confirmModal .modal-title').innerHTML = 
            `<i class="bi bi-question-circle me-2"></i>${title}`;
        document.getElementById('confirmMessage').textContent = message;
        
        const confirmBtn = document.getElementById('confirmBtn');
        confirmBtn.onclick = () => {
            callback();
            bootstrap.Modal.getInstance(document.getElementById('confirmModal')).hide();
        };
        
        const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
        modal.show();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new StampAppPC();
});
