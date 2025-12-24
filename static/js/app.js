class StampApp {
    constructor() {
        this.uploadedFile = null;
        this.detectedSeals = [];
        this.templates = [];
        this.selectedSeal = null;
        this.selectedTemplate = null;
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.loadTemplates();
    }
    
    setupEventListeners() {
        // 文件上传相关
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        
        // 按钮事件
        document.getElementById('detectBtn').addEventListener('click', this.detectSeals.bind(this));
        document.getElementById('compareBtn').addEventListener('click', this.compareSeals.bind(this));
        document.getElementById('resetBtn').addEventListener('click', this.resetApp.bind(this));
        document.getElementById('newCompareBtn').addEventListener('click', this.newComparison.bind(this));
    }
    
    handleDragOver(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.add('dragover');
    }
    
    handleDragLeave(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('dragover');
    }
    
    handleDrop(e) {
        e.preventDefault();
        document.getElementById('uploadArea').classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.uploadFile(files[0]);
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
            this.showError('请上传PDF格式的文件');
            return;
        }
        
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
                this.showUploadSuccess(result.filename);
                this.updateStep(2);
            } else {
                this.showError(result.error || '上传失败');
            }
        } catch (error) {
            this.showError('网络错误: ' + error.message);
        }
    }
    
    showUploadSuccess(filename) {
        const statusDiv = document.getElementById('uploadStatus');
        const messageSpan = document.getElementById('uploadMessage');
        
        messageSpan.textContent = `文件 "${filename}" 上传成功`;
        statusDiv.style.display = 'block';
        document.getElementById('detectSection').style.display = 'block';
    }
    
    async detectSeals() {
        if (!this.uploadedFile) {
            this.showError('请先上传PDF文件');
            return;
        }
        
        // 显示加载状态
        document.getElementById('detectLoading').style.display = 'block';
        document.getElementById('detectBtn').disabled = true;
        
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
                this.updateStep(3);
            } else {
                this.showError(result.error || '检测失败');
            }
        } catch (error) {
            this.showError('检测出错: ' + error.message);
        } finally {
            document.getElementById('detectLoading').style.display = 'none';
            document.getElementById('detectBtn').disabled = false;
        }
    }
    
    displaySeals() {
        const sealsSection = document.getElementById('sealsSection');
        const sealsList = document.getElementById('sealsList');
        const sealCount = document.getElementById('sealCount');
        
        sealCount.textContent = this.detectedSeals.length;
        sealsList.innerHTML = '';
        
        if (this.detectedSeals.length === 0) {
            sealsList.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-warning text-center">
                        <i class="bi bi-exclamation-triangle me-2"></i>
                        未检测到符合尺寸要求（40mm±1mm）的印章
                    </div>
                </div>
            `;
        } else {
            this.detectedSeals.forEach(seal => {
                const sealCard = document.createElement('div');
                sealCard.className = 'col-md-3 col-sm-6 mb-3';
                sealCard.innerHTML = `
                    <div class="card seal-card" data-seal-id="${seal.id}">
                        <div class="seal-info">
                            直径: ${seal.diameter}mm
                        </div>
                        <img src="${seal.image_url}" class="seal-image" alt="印章 ${seal.id}">
                        <div class="card-body text-center">
                            <h6 class="card-title">印章 ${seal.id}</h6>
                            <p class="text-muted small">坐标: (${seal.x}, ${seal.y})</p>
                        </div>
                    </div>
                `;
                
                sealCard.addEventListener('click', () => this.selectSeal(seal));
                sealsList.appendChild(sealCard);
            });
        }
        
        sealsSection.style.display = 'block';
    }
    
    selectSeal(seal) {
        // 移除之前的选中状态
        document.querySelectorAll('.seal-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        // 添加选中状态
        const selectedCard = document.querySelector(`[data-seal-id="${seal.id}"]`);
        selectedCard.classList.add('selected');
        
        this.selectedSeal = seal;
        this.checkCompareReady();
    }
    
    async loadTemplates() {
        try {
            const response = await fetch('/api/templates');
            const result = await response.json();
            
            if (response.ok) {
                this.templates = result.templates;
                this.displayTemplates();
            }
        } catch (error) {
            console.error('加载模板失败:', error);
        }
    }
    
    displayTemplates() {
        const templatesList = document.getElementById('templatesList');
        templatesList.innerHTML = '';
        
        if (this.templates.length === 0) {
            templatesList.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-warning text-center">
                        <i class="bi bi-folder-x me-2"></i>
                        未找到模板图片，请检查模板目录: D:\\work\\OCR\\Template
                    </div>
                </div>
            `;
            return;
        }
        
        this.templates.forEach(template => {
            const templateItem = document.createElement('div');
            templateItem.className = 'col-md-2 col-sm-4 col-6 mb-3';
            templateItem.innerHTML = `
                <div class="template-item text-center" data-template="${template}">
                    <img src="/api/template/${encodeURIComponent(template)}" 
                         class="template-image mb-2" alt="${template}">
                    <div class="small text-truncate" title="${template}">${template}</div>
                </div>
            `;
            
            templateItem.addEventListener('click', () => this.selectTemplate(template));
            templatesList.appendChild(templateItem);
        });
    }
    
    selectTemplate(template) {
        // 移除之前的选中状态
        document.querySelectorAll('.template-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 添加选中状态
        const selectedItem = document.querySelector(`[data-template="${template}"]`);
        selectedItem.classList.add('selected');
        
        this.selectedTemplate = template;
        this.checkCompareReady();
    }
    
    checkCompareReady() {
        const compareBtn = document.getElementById('compareBtn');
        if (this.selectedSeal && this.selectedTemplate) {
            compareBtn.disabled = false;
        } else {
            compareBtn.disabled = true;
        }
    }
    
    async compareSeals() {
        if (!this.selectedSeal || !this.selectedTemplate) {
            this.showError('请选择要比对的印章和模板');
            return;
        }
        
        // 显示加载状态
        document.getElementById('compareLoading').style.display = 'block';
        document.getElementById('compareBtn').disabled = true;
        
        try {
            const response = await fetch('/api/compare', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    seal_path: this.selectedSeal.image_url,
                    template_name: this.selectedTemplate
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.displayResult(result);
                this.updateStep(4);
            } else {
                this.showError(result.error || '比对失败');
            }
        } catch (error) {
            this.showError('比对出错: ' + error.message);
        } finally {
            document.getElementById('compareLoading').style.display = 'none';
            document.getElementById('compareBtn').disabled = false;
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
        const reportDiv = document.getElementById('comparisonReport');
        reportDiv.innerHTML = result.result.replace(/\n/g, '<br>');
        
        // 判断结论并设置样式
        const conclusion = result.result.toLowerCase();
        if (conclusion.includes('一致') || conclusion.includes('相同')) {
            reportDiv.className = 'alert alert-success';
        } else if (conclusion.includes('不一致') || conclusion.includes('不同')) {
            reportDiv.className = 'alert alert-danger';
        } else {
            reportDiv.className = 'alert alert-info';
        }
        
        resultSection.style.display = 'block';
        
        // 滚动到结果区域
        resultSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    updateStep(step) {
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
    
    resetApp() {
        // 重置数据
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
        document.getElementById('resultSection').style.display = 'none';
        
        this.updateStep(3);
    }
    
    newComparison() {
        // 清理临时文件
        fetch('/api/cleanup', { method: 'POST' }).catch(console.error);
        
        // 重置所有状态
        this.uploadedFile = null;
        this.detectedSeals = [];
        this.selectedSeal = null;
        this.selectedTemplate = null;
        
        // 隐藏所有区域
        document.getElementById('uploadStatus').style.display = 'none';
        document.getElementById('detectSection').style.display = 'none';
        document.getElementById('sealsSection').style.display = 'none';
        document.getElementById('resultSection').style.display = 'none';
        
        // 清空文件输入
        document.getElementById('fileInput').value = '';
        
        // 回到第一步
        this.updateStep(1);
        
        // 滚动到顶部
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        const modal = new bootstrap.Modal(document.getElementById('errorModal'));
        modal.show();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new StampApp();
});
