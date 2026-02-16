// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// DOM refs
const pdfInput = document.getElementById('pdfInput');
const uploadZone = document.getElementById('uploadZone');
const fileMetaSection = document.getElementById('fileMetaSection');
const pdfPreviewArea = document.getElementById('pdfPreviewArea');
const textDisplayArea = document.getElementById('textDisplayArea');
const pageCountBadge = document.getElementById('pageCountBadge');
const pageCountPreview = document.getElementById('pageCountPreview');
const tabFirstPage = document.getElementById('tabFirstPage');
const tabAllPages = document.getElementById('tabAllPages');
const allPagesPreviewArea = document.getElementById('allPagesPreviewArea');
const fileTabsContainer = document.getElementById('fileTabsContainer');
const fileTabs = document.getElementById('fileTabs');

// API endpoint
const API_ENDPOINT = 'http://127.0.0.1:5000/api/clean-pdf';

// Device detection
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isTablet = /(iPad|Android(?!.*mobile))/i.test(navigator.userAgent);

// File size limits based on device
const MAX_FILE_SIZE = isMobile ? 15 * 1024 * 1024 : 50 * 1024 * 1024;

// State management
let files = [];
let currentFileIndex = -1;
let currentPreviewTab = 'first'; // 'first' or 'all'

// Helper: sanitize HTML
const escapeHTML = (unsafe) => {
    if (!unsafe) return '';
    return unsafe.replace(/[&<>"]/g, (m) => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        if (m === '"') return '&quot;';
        return m;
    });
};

// Helper: format file size
const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
};

// Helper: get file icon based on status
const getFileIcon = (status) => {
    switch(status) {
        case 'completed': return '✅';
        case 'error': return '❌';
        case 'processing': return '⏳';
        default: return '📄';
    }
};

// Update file tabs
const updateFileTabs = () => {
    if (files.length === 0) {
        fileTabsContainer.style.display = 'none';
        return;
    }
    
    fileTabsContainer.style.display = 'block';
    
    let tabsHtml = '';
    files.forEach((fileData, index) => {
        const isActive = index === currentFileIndex;
        const fileName = fileData.file.name.length > 20 
            ? fileData.file.name.substring(0, 18) + '…' 
            : fileData.file.name;
        
        tabsHtml += `
            <button class="file-tab ${isActive ? 'active' : ''}" data-index="${index}">
                <span class="file-icon">${getFileIcon(fileData.status)}</span>
                <span class="file-name" title="${escapeHTML(fileData.file.name)}">${escapeHTML(fileName)}</span>
                <span class="file-status ${fileData.status}">${fileData.status}</span>
                <span class="close-tab" onclick="event.stopPropagation(); removeFile(${index})">✕</span>
            </button>
        `;
    });
    
    fileTabs.innerHTML = tabsHtml;
};

// Remove a file
const removeFile = (index) => {
    if (index < 0 || index >= files.length) return;
    
    files.splice(index, 1);
    
    if (files.length === 0) {
        resetToEmpty();
    } else {
        if (currentFileIndex >= files.length) {
            currentFileIndex = files.length - 1;
        }
        switchToFile(currentFileIndex);
        updateFileTabs();
    }
};

// Reset upload zone to original state
const resetUploadZone = () => {
    const uploadContent = document.querySelector('.upload-zone .upload-content');
    if (uploadContent) {
        uploadContent.innerHTML = `
            <span class="upload-icon-large">📘</span>
            <span class="upload-label">Browse or drop PDFs</span>
            <span class="upload-hint">Multiple files allowed · Max 50 MB each</span>
        `;
    }
};

// Switch preview tabs
const switchPreviewTab = (tab) => {
    currentPreviewTab = tab;
    
    if (tab === 'first') {
        tabFirstPage.classList.add('active');
        tabAllPages.classList.remove('active');
        pdfPreviewArea.style.display = 'flex';
        allPagesPreviewArea.style.display = 'none';
    } else {
        tabFirstPage.classList.remove('active');
        tabAllPages.classList.add('active');
        pdfPreviewArea.style.display = 'none';
        allPagesPreviewArea.style.display = 'flex';
        
        if (currentFileIndex >= 0 && files[currentFileIndex]) {
            renderAllPages(files[currentFileIndex]);
        }
    }
};

// Render all pages
const renderAllPages = async (fileData) => {
    if (!fileData.allPagesCanvas) {
        fileData.allPagesCanvas = [];
        fileData.allPagesRendered = false;
    }
    
    if (fileData.allPagesRendered) {
        displayAllPages(fileData);
        return;
    }
    
    try {
        allPagesPreviewArea.innerHTML = '<div class="empty-preview-message"><span>🔄 Rendering all pages...</span></div>';
        
        const arrayBuffer = await fileData.file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;
        
        fileData.allPagesCanvas = [];
        allPagesPreviewArea.innerHTML = '';
        
        let scale;
        if (isMobile) {
            scale = window.innerWidth < 400 ? 0.4 : 0.5;
        } else if (isTablet) {
            scale = 0.7;
        } else {
            scale = 0.9;
        }
        
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: scale });
            
            const pageDiv = document.createElement('div');
            pageDiv.style.width = '100%';
            pageDiv.style.display = 'flex';
            pageDiv.style.flexDirection = 'column';
            pageDiv.style.alignItems = 'center';
            
            const pageLabel = document.createElement('div');
            pageLabel.className = 'page-indicator';
            pageLabel.textContent = `Page ${pageNum} of ${totalPages}`;
            pageDiv.appendChild(pageLabel);
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d', { alpha: false });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.className = 'pdf-page-canvas';
            canvas.setAttribute('data-page', pageNum);
            
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            pageDiv.appendChild(canvas);
            allPagesPreviewArea.appendChild(pageDiv);
            fileData.allPagesCanvas.push(canvas);
        }
        
        fileData.allPagesRendered = true;
        
    } catch (error) {
        console.error('Error rendering all pages:', error);
        allPagesPreviewArea.innerHTML = `<div class="empty-preview-message" style="color: #b33a3a;">⚠️ Failed to render all pages</div>`;
    }
};

// Display already rendered all pages
const displayAllPages = (fileData) => {
    allPagesPreviewArea.innerHTML = '';
    if (fileData.allPagesCanvas && fileData.allPagesCanvas.length > 0) {
        fileData.allPagesCanvas.forEach((canvas, index) => {
            const pageDiv = document.createElement('div');
            pageDiv.style.width = '100%';
            pageDiv.style.display = 'flex';
            pageDiv.style.flexDirection = 'column';
            pageDiv.style.alignItems = 'center';
            
            const pageLabel = document.createElement('div');
            pageLabel.className = 'page-indicator';
            pageLabel.textContent = `Page ${index + 1} of ${fileData.allPagesCanvas.length}`;
            pageDiv.appendChild(pageLabel);
            
            pageDiv.appendChild(canvas);
            allPagesPreviewArea.appendChild(pageDiv);
        });
    }
};

// Switch to a specific file
const switchToFile = (index) => {
    if (index < 0 || index >= files.length || index === currentFileIndex) return;
    
    currentFileIndex = index;
    const fileData = files[index];
    
    // Update file metadata
    fileMetaSection.innerHTML = `
        <div class="file-metadata">
            <span style="font-size: 1.4rem; margin-right: 4px;">📌</span>
            <span style="font-weight: 600;">${escapeHTML(fileData.file.name)}</span>
            <span style="color: #3f657d;">${formatFileSize(fileData.file.size)}</span>
        </div>
    `;

    resetUploadZone();

    // Update page indicators
    if (fileData.pages) {
        pageCountBadge.innerText = `${fileData.pages} page${fileData.pages > 1 ? 's' : ''}`;
        pageCountPreview.innerText = `${fileData.pages} page${fileData.pages > 1 ? 's' : ''}`;
    } else {
        pageCountBadge.innerText = fileData.status || 'ready';
        pageCountPreview.innerText = fileData.status === 'error' ? 'error' : '—';
    }

    // Update preview based on current tab
    if (currentPreviewTab === 'first') {
        if (fileData.previewCanvas) {
            pdfPreviewArea.innerHTML = '';
            pdfPreviewArea.appendChild(fileData.previewCanvas);
        } else if (fileData.status === 'error') {
            pdfPreviewArea.innerHTML = `<div class="empty-preview-message" style="color: #b33a3a;">⚠️ Preview failed</div>`;
        } else {
            pdfPreviewArea.innerHTML = `<div class="empty-preview-message"><span>⏺ No preview available</span></div>`;
        }
    } else {
        if (fileData.allPagesRendered) {
            displayAllPages(fileData);
        } else {
            renderAllPages(fileData);
        }
    }

    // Update text content
    if (fileData.text) {
        textDisplayArea.innerHTML = '';
        const textContainer = document.createElement('div');
        textContainer.style.whiteSpace = 'pre-wrap';
        textContainer.style.wordBreak = 'break-word';
        textContainer.style.fontSize = isMobile ? '0.9rem' : '0.98rem';
        textContainer.style.lineHeight = '1.7';
        textContainer.textContent = fileData.text;
        textDisplayArea.appendChild(textContainer);
    } else if (fileData.status === 'processing') {
        textDisplayArea.innerHTML = `<div class="placeholder-text"><span>⏳ Processing ${fileData.file.name}...</span></div>`;
    } else if (fileData.status === 'error') {
        textDisplayArea.innerHTML = `<div class="placeholder-text" style="color: #b34a4a;">
            ❌ Error: ${escapeHTML(fileData.error || 'Unknown error')}
        </div>`;
    }

    updateFileTabs();
};

// Render PDF preview (first page)
const renderPdfPreview = async (fileData) => {
    try {
        const arrayBuffer = await fileData.file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;

        fileData.pages = totalPages;

        const firstPage = await pdf.getPage(1);
        
        let scale;
        if (isMobile) {
            scale = window.innerWidth < 400 ? 0.6 : 0.8;
        } else if (isTablet) {
            scale = 1.2;
        } else {
            scale = 1.65;
        }
        
        const viewport = firstPage.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: false });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'pdf-page-canvas';

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await firstPage.render(renderContext).promise;
        fileData.previewCanvas = canvas;

        if (files[currentFileIndex] === fileData && currentPreviewTab === 'first') {
            pdfPreviewArea.innerHTML = '';
            pdfPreviewArea.appendChild(canvas);
            pageCountBadge.innerText = `${totalPages} page${totalPages > 1 ? 's' : ''}`;
            pageCountPreview.innerText = `${totalPages} page${totalPages > 1 ? 's' : ''}`;
        }

        return true;
    } catch (error) {
        console.error('Preview error:', error);
        fileData.status = 'error';
        fileData.error = 'Preview failed';
        updateFileTabs();
        
        if (files[currentFileIndex] === fileData) {
            pdfPreviewArea.innerHTML = `<div class="empty-preview-message" style="color: #b33a3a;">⚠️ Preview failed</div>`;
        }
        
        return false;
    }
};

// Extract text via API
const extractTextViaAPI = async (fileData) => {
    const formData = new FormData();
    formData.append('file', fileData.file);

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `HTTP error ${response.status}`);
        }

        return { success: true, data };
    } catch (error) {
        console.error('API error:', error);
        return { success: false, error: error.message };
    }
};

// Process a single file
const processFile = async (fileData) => {
    fileData.status = 'processing';
    updateFileTabs();
    
    if (files[currentFileIndex] === fileData) {
        textDisplayArea.innerHTML = `<div class="placeholder-text"><span>⏳ Processing ${fileData.file.name}...</span></div>`;
    }

    await renderPdfPreview(fileData);

    const result = await extractTextViaAPI(fileData);

    if (result.success) {
        fileData.status = 'completed';
        fileData.text = result.data.text;
        fileData.pages = result.data.metadata?.pages || fileData.pages;
        updateFileTabs();
        
        if (files[currentFileIndex] === fileData) {
            textDisplayArea.innerHTML = '';
            const textContainer = document.createElement('div');
            textContainer.style.whiteSpace = 'pre-wrap';
            textContainer.style.wordBreak = 'break-word';
            textContainer.style.fontSize = isMobile ? '0.9rem' : '0.98rem';
            textContainer.style.lineHeight = '1.7';
            textContainer.textContent = fileData.text;
            textDisplayArea.appendChild(textContainer);
            
            pageCountBadge.innerText = `${fileData.pages} page${fileData.pages > 1 ? 's' : ''}`;
            pageCountPreview.innerText = `${fileData.pages} page${fileData.pages > 1 ? 's' : ''}`;
        }
        
        if (currentPreviewTab === 'all' && files[currentFileIndex] === fileData) {
            renderAllPages(fileData);
        }
    } else {
        fileData.status = 'error';
        fileData.error = result.error;
        updateFileTabs();
        
        if (files[currentFileIndex] === fileData) {
            textDisplayArea.innerHTML = `<div class="placeholder-text" style="color: #b34a4a;">
                ❌ Failed: ${escapeHTML(result.error)}
            </div>`;
            pageCountBadge.innerText = 'error';
            pageCountPreview.innerText = 'error';
        }
    }
};

// Process multiple files
const processFiles = async (fileList) => {
    const validFiles = [];
    for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        
        if (file.type !== 'application/pdf') {
            alert(`"${file.name}" is not a PDF. Skipping.`);
            continue;
        }

        if (file.size > MAX_FILE_SIZE) {
            const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
            alert(`"${file.name}" is too large (max ${maxSizeMB}MB). Skipping.`);
            continue;
        }

        validFiles.push({
            file: file,
            status: 'pending',
            pages: null,
            text: null,
            error: null,
            previewCanvas: null,
            allPagesCanvas: null,
            allPagesRendered: false
        });
    }

    if (validFiles.length === 0) return;

    files = [...files, ...validFiles];
    
    if (currentFileIndex === -1) {
        currentFileIndex = 0;
        const firstFile = files[0];
        fileMetaSection.innerHTML = `
            <div class="file-metadata">
                <span style="font-size: 1.4rem; margin-right: 4px;">📌</span>
                <span style="font-weight: 600;">${escapeHTML(firstFile.file.name)}</span>
                <span style="color: #3f657d;">${formatFileSize(firstFile.file.size)}</span>
            </div>
        `;
    }
    
    resetUploadZone();
    updateFileTabs();
    
    for (const fileData of validFiles) {
        await processFile(fileData);
    }
};

// Reset to empty state
const resetToEmpty = () => {
    files = [];
    currentFileIndex = -1;
    fileMetaSection.innerHTML = '';
    pdfPreviewArea.innerHTML = `<div class="empty-preview-message" id="previewEmptyMsg"><span style="opacity: 0.8;">⏺ No PDF loaded — upload to preview</span></div>`;
    allPagesPreviewArea.innerHTML = '';
    allPagesPreviewArea.style.display = 'none';
    pdfPreviewArea.style.display = 'flex';
    textDisplayArea.innerHTML = `<div class="placeholder-text"><span>⬅ Upload PDFs to extract & display text</span></div>`;
    pageCountBadge.innerText = 'ready';
    pageCountPreview.innerText = '—';
    fileTabsContainer.style.display = 'none';
    
    switchPreviewTab('first');
    resetUploadZone();
};

// Event Listeners
pdfInput.addEventListener('change', (e) => {
    const fileList = e.target.files;
    if (fileList.length > 0) {
        processFiles(fileList);
    } else {
        resetToEmpty();
    }
    pdfInput.value = '';
});

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.background = '#f2f8ff';
    uploadZone.style.borderColor = '#0a2a44';
});

uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadZone.style.background = '#f9fcff';
    uploadZone.style.borderColor = '#b8ccda';
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.background = '#f9fcff';
    uploadZone.style.borderColor = '#b8ccda';

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFiles(files);
    }
});

uploadZone.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT') {
        pdfInput.click();
    }
});

pdfInput.addEventListener('click', (e) => {
    e.stopPropagation();
});

// File tab click handler
fileTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.file-tab');
    if (tab && !e.target.classList.contains('close-tab')) {
        const index = parseInt(tab.dataset.index, 10);
        if (!isNaN(index) && index !== currentFileIndex) {
            switchToFile(index);
        }
    }
});

tabFirstPage.addEventListener('click', () => switchPreviewTab('first'));
tabAllPages.addEventListener('click', () => switchPreviewTab('all'));

window.addEventListener('load', () => {
    resetToEmpty();
    
    if (isMobile) {
        const hintElement = document.querySelector('.upload-hint');
        if (hintElement) {
            hintElement.textContent = `Max ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB each · tap to select multiple`;
        }
    }
});

window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        if (currentFileIndex >= 0 && files[currentFileIndex]) {
            if (currentPreviewTab === 'first') {
                renderPdfPreview(files[currentFileIndex]);
            } else {
                renderAllPages(files[currentFileIndex]);
            }
        }
    }, 300);
});