// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// DOM refs
const pdfInput = document.getElementById('pdfInput');
const uploadZone = document.getElementById('uploadZone');
const fileMetaSection = document.getElementById('fileMetaSection');
const pdfPreviewArea = document.getElementById('pdfPreviewArea');
const previewEmptyMsg = document.getElementById('previewEmptyMsg');
const textDisplayArea = document.getElementById('textDisplayArea');
const pageCountBadge = document.getElementById('pageCountBadge');
const pageCountPreview = document.getElementById('pageCountPreview');

// API endpoint
const API_ENDPOINT = '/api/clean-pdf';

// Device detection
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isTablet = /(iPad|Android(?!.*mobile))/i.test(navigator.userAgent);

// File size limits based on device
const MAX_FILE_SIZE = isMobile ? 15 * 1024 * 1024 : 50 * 1024 * 1024; // 15MB mobile, 50MB desktop

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

// Reset UI to empty state
const resetToEmpty = () => {
    fileMetaSection.innerHTML = '';
    pdfPreviewArea.innerHTML = `<div class="empty-preview-message" id="previewEmptyMsg"><span style="opacity: 0.8;">⏺ No PDF loaded — upload to preview</span></div>`;
    textDisplayArea.innerHTML = `<div class="placeholder-text"><span>⬅ Upload a PDF to extract & display text</span></div>`;
    pageCountBadge.innerText = 'ready';
    pageCountPreview.innerText = '—';
};

// Render PDF preview using pdf.js (client-side) - OPTIMIZED FOR ALL DEVICES
const renderPdfPreview = async (file) => {
    try {
        // Show loading state
        pdfPreviewArea.innerHTML = `<div class="empty-preview-message"><span>🔄 Rendering preview...</span></div>`;
        
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;

        // Update page indicators
        pageCountBadge.innerText = `${totalPages} page${totalPages > 1 ? 's' : ''}`;
        pageCountPreview.innerText = `${totalPages} page${totalPages > 1 ? 's' : ''}`;

        // Render first page with device-optimized scale
        const firstPage = await pdf.getPage(1);
        
        // Adaptive scaling based on device and screen size
        let scale;
        if (isMobile) {
            scale = window.innerWidth < 400 ? 0.6 : 0.8; // Small phones vs larger phones
        } else if (isTablet) {
            scale = 1.2;
        } else {
            scale = 1.65; // Desktop
        }
        
        const viewport = firstPage.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: false }); // Better performance
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'pdf-page-canvas';
        canvas.setAttribute('aria-label', 'PDF first page preview');

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await firstPage.render(renderContext).promise;
        pdfPreviewArea.innerHTML = '';
        pdfPreviewArea.appendChild(canvas);
        
        return { success: true, totalPages };
    } catch (error) {
        console.error('Preview rendering error:', error);
        const errorMsg = isMobile 
            ? '⚠️ Preview failed — file may be too large for mobile' 
            : '⚠️ Could not render preview — corrupted or encrypted file';
        pdfPreviewArea.innerHTML = `<div class="empty-preview-message" style="color: #b33a3a; border-color: #f3d7d7;">${errorMsg}</div>`;
        return { success: false, error };
    }
};

// Send PDF to Flask endpoint for text extraction
const extractTextViaAPI = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to extract text');
        }

        return { success: true, data };
    } catch (error) {
        console.error('API error:', error);
        return { success: false, error: error.message };
    }
};

// Main PDF processing function - ENHANCED WITH VALIDATION
const processPdf = async (file) => {
    // Basic validation
    if (!file || file.type !== 'application/pdf') {
        alert('Please select a valid PDF document.');
        pdfInput.value = '';
        resetToEmpty();
        return;
    }

    // File size validation (device-specific limits)
    if (file.size > MAX_FILE_SIZE) {
        const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
        alert(`File too large! Maximum size is ${maxSizeMB}MB${isMobile ? ' on mobile devices' : ''}.\n\nYour file: ${formatFileSize(file.size)}`);
        pdfInput.value = '';
        resetToEmpty();
        return;
    }

    // Update file metadata
    fileMetaSection.innerHTML = `
        <div class="file-metadata">
            <span style="font-size: 1.4rem; margin-right: 4px;">📌</span>
            <span style="font-weight: 600;">${escapeHTML(file.name)}</span>
            <span style="color: #3f657d;">${formatFileSize(file.size)}</span>
        </div>
    `;

    // Set loading state
    pageCountBadge.innerText = 'loading…';
    pageCountPreview.innerText = 'loading';
    textDisplayArea.innerHTML = `<div class="placeholder-text"><span>⏳ Extracting text via API...</span></div>`;

    // Render preview (client-side)
    await renderPdfPreview(file);

    // Extract text via API (server-side with PyPDF2 + cleaning)
    const result = await extractTextViaAPI(file);

    if (result.success) {
        // Display the cleaned text from Flask
        textDisplayArea.innerHTML = '';
        const textContainer = document.createElement('div');
        textContainer.style.whiteSpace = 'pre-wrap';
        textContainer.style.wordBreak = 'break-word';
        textContainer.style.fontSize = isMobile ? '0.9rem' : '0.98rem';
        textContainer.style.lineHeight = '1.7';
        
        // Use the cleaned text from your Flask endpoint
        textContainer.textContent = result.data.text || '[No text extracted]';
        textDisplayArea.appendChild(textContainer);
        
        // Update page count if available from API
        if (result.data.metadata?.pages) {
            pageCountBadge.innerText = `${result.data.metadata.pages} page${result.data.metadata.pages > 1 ? 's' : ''}`;
            pageCountPreview.innerText = `${result.data.metadata.pages} page${result.data.metadata.pages > 1 ? 's' : ''}`;
        }
    } else {
        // Show error message
        textDisplayArea.innerHTML = `<div class="placeholder-text" style="color: #b34a4a;">
            ❌ Failed to extract text: ${escapeHTML(result.error || 'Unknown error')}
        </div>`;
        pageCountBadge.innerText = 'error';
        pageCountPreview.innerText = 'error';
    }
};

// ----- Event Listeners -----
pdfInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        processPdf(file);
    } else {
        resetToEmpty();
    }
});

// Drag and drop (works on desktop, gracefully degrades on mobile)
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
        const file = files[0];
        if (file.type === 'application/pdf') {
            pdfInput.files = files;
            processPdf(file);
        } else {
            alert('Only PDF files are supported.');
        }
    }
});

// Click to upload (works on all devices)
uploadZone.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT') {
        pdfInput.click();
    }
});

pdfInput.addEventListener('click', (e) => {
    e.stopPropagation();
});

// Initialize on load
window.addEventListener('load', () => {
    resetToEmpty();
    
    // Update hint text for mobile
    if (isMobile) {
        const hintElement = document.querySelector('.upload-hint');
        if (hintElement) {
            hintElement.textContent = `Maximum size ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB · tap to select`;
        }
    }
});

// Handle orientation changes on mobile
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        // Re-render preview if exists after orientation change
        const canvas = pdfPreviewArea.querySelector('.pdf-page-canvas');
        if (canvas && pdfInput.files.length > 0) {
            renderPdfPreview(pdfInput.files[0]);
        }
    }, 300);
});