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
        document.getElementById('exportBtn').addEventListener('click', this.exportReport.bind(this));
        document.getElementById('newCompareBtn').addEventListener('click', this.newComparison.bind(this));
        
        // 模板上传事件
        const templateInput = document.getElementById('templateInput');
        document.getElementById('uploadTemplateBtn').addEventListener('click', () => templateInput.click());
        templateInput.addEventListener('change', this.uploadTemplate.bind(this));

        // 预览切换事件
        document.getElementById('togglePreviewBtn').addEventListener('click', this.togglePreviewMode.bind(this));
        document.getElementById('closePreviewBtn').addEventListener('click', this.togglePreviewMode.bind(this));
        
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
                
                // 预加载预览但不显示
                const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
                if (pdfPreviewFrame) {
                    pdfPreviewFrame.src = `/api/preview/${result.filename}`;
                }
                
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
        fileList.classList.remove('d-none');
        document.getElementById('detectSection').classList.remove('d-none');
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
                const templateCard = document.getElementById('templateCard');
                if (templateCard) {
                    templateCard.classList.remove('d-none');
                }

                // 自动开启预览模式
                this.setPreviewMode(true);

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
        const sealsCard = document.getElementById('sealsCard');
        const sealsGrid = document.getElementById('sealsGrid');
        const sealCount = document.getElementById('sealCount');
        
        sealCount.textContent = this.detectedSeals.length;
        sealsGrid.innerHTML = '';
        
        if (this.detectedSeals.length === 0) {
            sealsGrid.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-warning text-center py-4">
                        <i class="bi bi-exclamation-triangle me-2" style="font-size: 2rem;"></i>
                        <h5 class="mt-2">未检测到印章</h5>
                        <p class="mb-0">请确保PDF文件中有红色印章</p>
                    </div>
                </div>
            `;
        } else {
            this.detectedSeals.forEach(seal => {
                const sealCard = document.createElement('div');
                sealCard.className = 'seal-card';
                
                // 为图片URL添加时间戳防止缓存
                let imgUrl = seal.image_url;
                if (!imgUrl.includes('?_t=')) {
                    imgUrl = imgUrl + '?_t=' + (seal.timestamp || Date.now());
                }
                
                sealCard.innerHTML = `
                    <div class="seal-image-container">
                        <img src="${imgUrl}" class="seal-image" alt="印章 ${seal.id}" 
                             onerror="this.onerror=null; this.src='${seal.original_image_url}?retry='+Date.now();">
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
            
            // 显示模板区域
            const templateCard = document.getElementById('templateCard');
            if (templateCard) {
                templateCard.classList.remove('d-none');
            }
        }
        
        if (sealsCard) {
            sealsCard.classList.remove('d-none');
            sealsCard.classList.add('fade-in-up');
        }
    }
    
    togglePreviewMode() {
        const layoutContent = document.getElementById('layoutContent');
        const isPreviewMode = layoutContent.classList.contains('preview-mode');
        this.setPreviewMode(!isPreviewMode);
    }

    setPreviewMode(enable) {
        const layoutContent = document.getElementById('layoutContent');
        const rightColumn = document.getElementById('rightColumn');
        const toggleText = document.getElementById('togglePreviewText');
        const toggleBtn = document.getElementById('togglePreviewBtn');

        if (enable) {
            layoutContent.classList.add('preview-mode');
            rightColumn.classList.remove('d-none');
            toggleText.textContent = '隐藏预览';
            toggleBtn.classList.replace('btn-outline-primary', 'btn-primary');
        } else {
            layoutContent.classList.remove('preview-mode');
            rightColumn.classList.add('d-none');
            toggleText.textContent = '显示预览';
            toggleBtn.classList.replace('btn-primary', 'btn-outline-primary');
        }
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

        // 核心交互：同步右侧PDF预览跳转到对应页码
        // 用户已放弃此功能，移除相关逻辑，保持代码整洁
        if (this.uploadedFile && seal.page) {
             console.log(`[Select] Seal on page: ${seal.page}`);
        }

        this.checkCompareReady();
        
        // 滚动到模板选择区域
        document.getElementById('templateCard').scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
    }
    
    async uploadTemplate(e) {
        const file = e.target.files[0];
        if (!file) return;

        // 重置input以便下次选择相同文件
        e.target.value = '';

        if (file.size > 5 * 1024 * 1024) {
            this.showConfirm('文件过大', '模板图片不能超过5MB', () => {});
            return;
        }

        this.showLoading('正在上传模板...', '请稍候...');
        
        const formData = new FormData();
        formData.append('file', file);
        
        try {
            const response = await fetch('/api/upload_template', {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.hideLoading();
                // 重新加载模板列表
                await this.loadTemplates();
                // 提示成功
                const toast = document.createElement('div');
                toast.className = 'position-fixed bottom-0 start-50 translate-middle-x mb-4 p-3 bg-success text-white rounded shadow';
                toast.style.zIndex = '9999';
                toast.innerHTML = `<i class="bi bi-check-circle me-2"></i>模板 "${result.filename}" 上传成功`;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
            } else {
                this.hideLoading();
                this.showConfirm('上传失败', result.error || '上传失败', () => {});
            }
        } catch (error) {
            this.hideLoading();
            this.showConfirm('网络错误', '上传过程中发生错误: ' + error.message, () => {});
        }
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
        if (!templatesGrid) return;
        templatesGrid.innerHTML = '';
    
        this.templates.forEach((template, index) => {
            const templateItem = document.createElement('div');
            templateItem.className = 'template-item';
            
            // 为模板图片添加时间戳
            const templateUrl = `/api/template/${encodeURIComponent(template)}?_t=${Date.now()}`;
            
            templateItem.innerHTML = `
                <img src="${templateUrl}" 
                     class="template-image" 
                     alt="模板 ${index + 1}"
                     onerror="this.onerror=null; this.src='${templateUrl}&retry='+Date.now();">
                <div class="template-name" title="${template}">${template}</div>
            `;
            
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
        
        // 使用 marked 解析 Markdown 内容
        if (typeof marked !== 'undefined') {
            reportContent.innerHTML = marked.parse(result.result);
        } else {
            // 降级处理
            reportContent.innerHTML = result.result.replace(/\n/g, '<br>');
        }
        
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
        
        resultSection.classList.remove('d-none');
        resultSection.classList.add('fade-in-up');
        
        // 滚动到结果区域
        setTimeout(() => {
            resultSection.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start' 
            });
        }, 100);
    }
    
    async exportReport() {
        if (!this.selectedSeal || !this.selectedTemplate) {
            this.showConfirm('无法导出', '当前没有比对结果可供导出', () => {});
            return;
        }

        this.showLoading('正在生成报告...', '正在将比对结果导出为PDF文件...');
        
        try {
            // 确保html2canvas和jspdf已加载
            if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
                throw new Error('导出组件未加载，请刷新页面重试');
            }

            const element = document.querySelector('.comparison-container');
            
            // 临时隐藏按钮区域以获得更纯净的截图
            const btnContainer = element.querySelector('.d-flex.justify-content-center.gap-3');
            if (btnContainer) btnContainer.style.display = 'none';

            // 临时修改样式以确保完整捕获
            const originalOverflow = element.style.overflow;
            element.style.overflow = 'visible';

            const canvas = await html2canvas(element, {
                scale: 2, // 提高清晰度
                useCORS: true, // 允许跨域图片
                logging: false,
                backgroundColor: '#ffffff',
                height: element.scrollHeight, // 强制捕获完整高度
                windowHeight: element.scrollHeight
            });

            // 恢复样式和按钮
            element.style.overflow = originalOverflow;
            if (btnContainer) btnContainer.style.display = '';

            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            
            // 创建PDF (A4纵向)
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = 210;
            const pdfHeight = 297;
            const margin = 10;
            const headerHeight = 35; // 第一页头部预留高度
            
            // 计算图片在PDF中的尺寸
            const contentWidth = pdfWidth - (margin * 2);
            const contentHeight = canvas.height * contentWidth / canvas.width;
            
            // Page 1 Header
            pdf.setFontSize(16);
            pdf.text("Stamp Verification Report", pdfWidth / 2, 20, { align: "center" });
            pdf.setFontSize(10);
            pdf.setTextColor(100);
            const dateStr = new Date().toLocaleString();
            pdf.text(`Generated at: ${dateStr}`, pdfWidth / 2, 28, { align: "center" });

            // 渲染逻辑：支持多页分割
            // 第一页可用高度
            const page1VisibleHeight = pdfHeight - headerHeight - margin;
            
            // 绘制第一页图片
            pdf.addImage(imgData, 'PNG', margin, headerHeight, contentWidth, contentHeight);

            let heightLeft = contentHeight - page1VisibleHeight;
            let printedHeight = page1VisibleHeight; // 已打印的图片高度（相对于图片顶部）

            // 如果还有剩余内容，添加新页面
            while (heightLeft > 0) {
                pdf.addPage();
                
                // 计算下一页图片的起始Y坐标（负值，从而让图片向上偏移）
                // 使得图片的第 printedHeight 处 对应页面的 margin 处
                // ImageY + printedHeight = margin => ImageY = margin - printedHeight
                const nextImageY = margin - printedHeight;
                
                pdf.addImage(imgData, 'PNG', margin, nextImageY, contentWidth, contentHeight);
                
                const pageFullHeight = pdfHeight - (margin * 2);
                heightLeft -= pageFullHeight;
                printedHeight += pageFullHeight;
            }
            
            // 添加页脚 (每页都加，或者只在最后一页加？这里选择只在最后一页加)
            pdf.setFontSize(8);
            pdf.setTextColor(150);
            pdf.text("Generated by AI Stamp Verification System", pdfWidth / 2, pdfHeight - 10, { align: "center" });

            // 下载文件
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            pdf.save(`印章比对报告_${timestamp}.pdf`);
            
            this.hideLoading();
            
        } catch (error) {
            console.error('Export failed:', error);
            this.hideLoading();
            
            // 恢复按钮显示（如果出错时还隐藏着）
            const element = document.querySelector('.comparison-container');
            const btnContainer = element?.querySelector('.d-flex.justify-content-center.gap-3');
            if (btnContainer) btnContainer.style.display = '';
            
            this.showConfirm('导出失败', '生成PDF报告时发生错误: ' + error.message, () => {});
        }
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
        resultSection.classList.add('d-none');
        resultSection.classList.remove('fade-in-up');
        
        // 滚动到印章选择区域
        const sealsCard = document.getElementById('sealsCard');
        if (sealsCard) {
            sealsCard.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        }
    }
    
    newComparison() {
        this.showConfirm('确认新建比对', '这将清除当前所有数据，开始新的比对。是否继续？', async () => {
            this.showLoading('正在清理...', '请稍候...');
            
            try {
                // 1. 先清理后端文件
                await fetch('/api/cleanup', { 
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                // 给后端一点时间完成清理
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 2. 重置所有状态
                this.uploadedFile = null;
                this.detectedSeals = [];
                this.selectedSeal = null;
                this.selectedTemplate = null;
                this.currentStep = 1;
                
                // 3. 强制清空所有图片缓存
                document.querySelectorAll('img').forEach(img => {
                    if (img.src.includes('/temp/') || img.src.includes('/api/template/')) {
                        img.src = '';
                    }
                });
                
                // 4. 清空所有显示区域
                document.getElementById('fileList').innerHTML = '';
                document.getElementById('fileList').classList.add('d-none');
                
                document.getElementById('sealsGrid').innerHTML = '';
                const sealsCard = document.getElementById('sealsCard');
                if (sealsCard) sealsCard.classList.add('d-none');
                
                document.getElementById('templatesGrid').innerHTML = '';
                document.getElementById('templateCard').classList.add('d-none');
                
                // 重置PDF预览状态
                this.setPreviewMode(false);
                const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
                if (pdfPreviewFrame) {
                    pdfPreviewFrame.src = '';
                }

                document.getElementById('resultSection').classList.add('d-none');
                document.getElementById('reportContent').innerHTML = '';
                
                // 5. 重置文件输入
                document.getElementById('fileInput').value = '';
                
                // 6. 重置按钮
                document.getElementById('compareBtn').disabled = true;
                document.getElementById('compareBtn').classList.remove('pulse');
                
                // 8. 隐藏加载并滚动到顶部
                this.hideLoading();
                window.scrollTo({ top: 0, behavior: 'smooth' });
                
                // 9. 重新加载模板
                setTimeout(() => {
                    this.loadTemplates();
                }, 100);
                
            } catch (error) {
                this.hideLoading();
                console.error('清理失败:', error);
                this.showConfirm('清理失败', '清理过程中发生错误，建议刷新页面', () => {
                    location.reload();
                });
            }
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
