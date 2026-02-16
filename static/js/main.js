// Configure pdf.js worker
if (typeof pdfjsLib === 'undefined') {
    console.error('❌ CRITICAL: pdf.js library not loaded!');
    console.error('Check if the CDN link is working: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.min.js');
} else {
    console.log('✅ pdf.js library loaded successfully');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
    console.log('✅ pdf.js worker configured');
}

// DOM refs
const pdfInput = document.getElementById('pdfInput');
const uploadZone = document.getElementById('uploadZone');
const fileMetaSection = document.getElementById('fileMetaSection');
const pdfPreviewArea = document.getElementById('pdfPreviewArea');
const previewEmptyMsg = document.getElementById('previewEmptyMsg');
const textDisplayArea = document.getElementById('textDisplayArea');
const pageCountBadge = document.getElementById('pageCountBadge');
const pageCountPreview = document.getElementById('pageCountPreview');
const pdfFilesList = document.getElementById('pdfFilesList');

// API endpoint
const API_ENDPOINT = '/api/clean-pdf';

// Device detection
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isTablet = /(iPad|Android(?!.*mobile))/i.test(navigator.userAgent);

// File size limits based on device
const MAX_FILE_SIZE = isMobile ? 15 * 1024 * 1024 : 50 * 1024 * 1024; // 15MB mobile, 50MB desktop

// ============================================
// MULTI-PDF STATE MANAGEMENT
// ============================================
let activePDFs = new Map(); // Store all uploaded PDFs with their data
let activeTabId = null; // Currently active tab

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

// Helper: generate unique ID
const generateId = () => {
    return 'pdf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
};

// Helper: truncate filename for display
const truncateFilename = (filename, maxLength = 20) => {
    if (filename.length <= maxLength) return filename;
    const extension = filename.split('.').pop();
    const nameWithoutExt = filename.slice(0, -(extension.length + 1));
    const truncated = nameWithoutExt.slice(0, maxLength - 3 - extension.length);
    return `${truncated}...${extension}`;
};

// Reset UI to empty state
const resetToEmpty = () => {
    activePDFs.clear();
    activeTabId = null;
    fileMetaSection.innerHTML = '';
    pdfPreviewArea.innerHTML = `<div class="empty-preview-message" id="previewEmptyMsg"><span style="opacity: 0.8;">⏺ No PDF loaded — upload to preview</span></div>`;
    textDisplayArea.innerHTML = `<div class="placeholder-text"><span>⬅ Upload a PDF to extract & display text</span></div>`;
    pageCountBadge.innerText = 'ready';
    pageCountPreview.innerText = '—';
    pdfFilesList.classList.add('hidden');
    pdfFilesList.innerHTML = '';
};

// ============================================
// FILE LIST MANAGEMENT (LEFT PANEL)
// ============================================

// Create a file list item for a PDF
const createFileListItem = (pdfId, filename, filesize) => {
    const item = document.createElement('div');
    item.className = 'pdf-file-item';
    item.dataset.pdfId = pdfId;
    
    item.innerHTML = `
        <span class="pdf-file-icon">📄</span>
        <div class="pdf-file-info">
            <div class="pdf-file-name" title="${escapeHTML(filename)}">${escapeHTML(truncateFilename(filename, 25))}</div>
            <div class="pdf-file-size">${formatFileSize(filesize)}</div>
        </div>
        <span class="pdf-file-remove" title="Remove">×</span>
    `;
    
    // Item click - switch to this PDF
    item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('pdf-file-remove')) {
            switchToFile(pdfId);
        }
    });
    
    // Remove button click
    item.querySelector('.pdf-file-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeFile(pdfId);
    });
    
    pdfFilesList.appendChild(item);
    pdfFilesList.classList.remove('hidden');
    
    return item;
};

// Switch to a different file
const switchToFile = (pdfId) => {
    if (!activePDFs.has(pdfId)) return;
    
    console.log('Switching to file:', pdfId);
    
    // Update active file styling
    document.querySelectorAll('.pdf-file-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.pdfId === pdfId) {
            item.classList.add('active');
        }
    });
    
    activeTabId = pdfId;
    
    // Display the PDF's content
    const pdfData = activePDFs.get(pdfId);
    displayPDFContent(pdfData);
};

// Remove a file
const removeFile = (pdfId) => {
    if (!activePDFs.has(pdfId)) return;
    
    console.log('Removing file:', pdfId);
    
    // Remove from map
    activePDFs.delete(pdfId);
    
    // Remove list item element
    const item = document.querySelector(`.pdf-file-item[data-pdf-id="${pdfId}"]`);
    if (item) {
        item.remove();
    }
    
    // If this was the active file, switch to another or reset
    if (activeTabId === pdfId) {
        if (activePDFs.size > 0) {
            // Switch to the first remaining PDF
            const firstPdfId = Array.from(activePDFs.keys())[0];
            switchToFile(firstPdfId);
        } else {
            // No PDFs left, reset to empty
            resetToEmpty();
        }
    }
    
    // Hide files list if no PDFs
    if (activePDFs.size === 0) {
        pdfFilesList.classList.add('hidden');
    }
};

// Display a PDF's content in the preview and text areas
const displayPDFContent = (pdfData) => {
    console.log('Displaying PDF content for:', pdfData.filename);
    
    // Update file metadata - show how many PDFs are loaded
    const fileCount = activePDFs.size;
    const fileCountText = fileCount > 1 ? `${fileCount} PDFs selected` : '';
    
    fileMetaSection.innerHTML = fileCountText ? `
        <div class="file-metadata">
            <span style="font-size: 1.4rem; margin-right: 4px;">📌</span>
            <span style="font-weight: 600;">${escapeHTML(fileCountText)}</span>
        </div>
    ` : '';
    
    // Update preview area
    if (pdfData.previewCanvas) {
        console.log('Canvas exists - width:', pdfData.previewCanvas.width, 'height:', pdfData.previewCanvas.height);
        pdfPreviewArea.innerHTML = '';
        
        // Create a new canvas and copy the image data
        const clonedCanvas = document.createElement('canvas');
        clonedCanvas.width = pdfData.previewCanvas.width;
        clonedCanvas.height = pdfData.previewCanvas.height;
        clonedCanvas.className = 'pdf-page-canvas';
        clonedCanvas.setAttribute('aria-label', 'PDF first page preview');
        
        // Add inline styles to ensure visibility
        clonedCanvas.style.display = 'block';
        clonedCanvas.style.maxWidth = '100%';
        clonedCanvas.style.height = 'auto';
        clonedCanvas.style.margin = '0 auto';
        
        const ctx = clonedCanvas.getContext('2d');
        ctx.drawImage(pdfData.previewCanvas, 0, 0);
        
        pdfPreviewArea.appendChild(clonedCanvas);
        console.log('✅ Canvas cloned and appended to DOM');
        console.log('Preview area children:', pdfPreviewArea.children.length);
        console.log('Canvas in DOM:', pdfPreviewArea.querySelector('canvas'));
    } else {
        console.log('❌ No preview canvas available for this PDF');
        pdfPreviewArea.innerHTML = `<div class="empty-preview-message"><span>⏺ Preview not available</span></div>`;
    }
    
    // Update text area
    if (pdfData.extractedText) {
        textDisplayArea.innerHTML = '';
        const textContainer = document.createElement('div');
        textContainer.style.whiteSpace = 'pre-wrap';
        textContainer.style.wordBreak = 'break-word';
        textContainer.style.fontSize = isMobile ? '0.9rem' : '0.98rem';
        textContainer.style.lineHeight = '1.7';
        textContainer.textContent = pdfData.extractedText;
        textDisplayArea.appendChild(textContainer);
    } else {
        textDisplayArea.innerHTML = `<div class="placeholder-text"><span>⏳ Extracting text...</span></div>`;
    }
    
    // Update page counts
    const pageText = `${pdfData.totalPages} page${pdfData.totalPages > 1 ? 's' : ''}`;
    pageCountBadge.innerText = pageText;
    pageCountPreview.innerText = pageText;
};

// ============================================
// PDF PROCESSING
// ============================================

// Render PDF preview using pdf.js (client-side) - OPTIMIZED FOR ALL DEVICES
const renderPdfPreview = async (file) => {
    try {
        console.log('Starting PDF preview render for:', file.name);
        const arrayBuffer = await file.arrayBuffer();
        console.log('ArrayBuffer created, size:', arrayBuffer.byteLength);
        
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;
        console.log('PDF loaded, total pages:', totalPages);

        // Render first page with device-optimized scale
        const firstPage = await pdf.getPage(1);
        console.log('First page retrieved');
        
        // Adaptive scaling based on device and screen size
        let scale;
        if (isMobile) {
            scale = window.innerWidth < 400 ? 0.6 : 0.8; // Small phones vs larger phones
        } else if (isTablet) {
            scale = 1.2;
        } else {
            scale = 1.65; // Desktop
        }
        console.log('Rendering with scale:', scale);
        
        const viewport = firstPage.getViewport({ scale: scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { alpha: false }); // Better performance
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'pdf-page-canvas';
        canvas.setAttribute('aria-label', 'PDF first page preview');
        console.log('Canvas created:', canvas.width, 'x', canvas.height);

        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await firstPage.render(renderContext).promise;
        console.log('✅ PDF preview rendered successfully');
        
        return { success: true, totalPages, canvas };
    } catch (error) {
        console.error('❌ Preview rendering error:', error);
        console.error('Error stack:', error.stack);
        return { success: false, error, totalPages: 0, canvas: null };
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

// Main PDF processing function - ENHANCED WITH MULTI-PDF SUPPORT
const processPdf = async (file) => {
    // Basic validation
    if (!file || file.type !== 'application/pdf') {
        alert('Please select a valid PDF document.');
        return;
    }

    // File size validation (device-specific limits)
    if (file.size > MAX_FILE_SIZE) {
        const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
        alert(`File too large! Maximum size is ${maxSizeMB}MB${isMobile ? ' on mobile devices' : ''}.\n\nYour file: ${formatFileSize(file.size)}`);
        return;
    }

    // Generate unique ID for this PDF
    const pdfId = generateId();
    
    // Create initial PDF data object
    const pdfData = {
        id: pdfId,
        filename: file.name,
        filesize: file.size,
        totalPages: 0,
        previewCanvas: null,
        extractedText: null,
        status: 'processing'
    };
    
    // Add to activePDFs
    activePDFs.set(pdfId, pdfData);
    
    // Create file list item
    const item = createFileListItem(pdfId, file.name, file.size);
    
    // Switch to this file
    switchToFile(pdfId);
    
    // Show loading state
    textDisplayArea.innerHTML = `<div class="placeholder-text"><span>⏳ Processing ${escapeHTML(file.name)}...</span></div>`;
    pageCountBadge.innerText = 'loading…';
    pageCountPreview.innerText = 'loading';

    // Render preview (client-side)
    console.log('Calling renderPdfPreview for:', file.name);
    const previewResult = await renderPdfPreview(file);
    console.log('Preview result:', previewResult);
    
    if (previewResult.success) {
        pdfData.totalPages = previewResult.totalPages;
        pdfData.previewCanvas = previewResult.canvas;
        console.log('Preview canvas stored:', !!pdfData.previewCanvas);
        
        // Update display if this PDF is still active
        if (activeTabId === pdfId) {
            console.log('Displaying preview canvas in DOM');
            pdfPreviewArea.innerHTML = '';
            pdfPreviewArea.appendChild(previewResult.canvas);
            console.log('Preview canvas appended to pdfPreviewArea');
            const pageText = `${previewResult.totalPages} page${previewResult.totalPages > 1 ? 's' : ''}`;
            pageCountBadge.innerText = pageText;
            pageCountPreview.innerText = pageText;
        } else {
            console.log('PDF is not active, skipping display');
        }
    } else {
        console.error('Preview rendering failed:', previewResult.error);
        pdfData.previewCanvas = null;
        if (activeTabId === pdfId) {
            const errorMsg = isMobile 
                ? '⚠️ Preview failed — file may be too large for mobile' 
                : '⚠️ Could not render preview — corrupted or encrypted file';
            pdfPreviewArea.innerHTML = `<div class="empty-preview-message" style="color: #b33a3a; border-color: #f3d7d7;">${errorMsg}</div>`;
        }
    }

    // Extract text via API (server-side)
    const result = await extractTextViaAPI(file);

    if (result.success) {
        pdfData.extractedText = result.data.text || '[No text extracted]';
        pdfData.status = 'complete';
        
        // Update page count if available from API
        if (result.data.metadata?.pages) {
            pdfData.totalPages = result.data.metadata.pages;
        }
        
        // Update display if this PDF is still active
        if (activeTabId === pdfId) {
            textDisplayArea.innerHTML = '';
            const textContainer = document.createElement('div');
            textContainer.style.whiteSpace = 'pre-wrap';
            textContainer.style.wordBreak = 'break-word';
            textContainer.style.fontSize = isMobile ? '0.9rem' : '0.98rem';
            textContainer.style.lineHeight = '1.7';
            textContainer.textContent = pdfData.extractedText;
            textDisplayArea.appendChild(textContainer);
            
            if (pdfData.totalPages > 0) {
                const pageText = `${pdfData.totalPages} page${pdfData.totalPages > 1 ? 's' : ''}`;
                pageCountBadge.innerText = pageText;
                pageCountPreview.innerText = pageText;
            }
        }
    } else {
        pdfData.extractedText = `❌ Failed to extract text: ${result.error || 'Unknown error'}`;
        pdfData.status = 'error';
        
        // Update display if this PDF is still active
        if (activeTabId === pdfId) {
            textDisplayArea.innerHTML = `<div class="placeholder-text" style="color: #b34a4a;">
                ${pdfData.extractedText}
            </div>`;
            pageCountBadge.innerText = 'error';
            pageCountPreview.innerText = 'error';
        }
    }
};

// Process multiple files
const processMultipleFiles = async (files) => {
    for (let i = 0; i < files.length; i++) {
        await processPdf(files[i]);
    }
};

// ============================================
// EVENT LISTENERS
// ============================================

// File input change - support multiple files
if (pdfInput) {
    pdfInput.addEventListener('change', (e) => {
        console.log('File input changed');
        const files = Array.from(e.target.files);
        console.log('Files selected:', files.length);
        if (files.length > 0) {
            processMultipleFiles(files);
        }
        // Reset input to allow re-uploading same file
        e.target.value = '';
    });
}

// Enhanced drag and drop
if (uploadZone) {
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.add('drag-over');
    });

    uploadZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('drag-over');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
        
        if (files.length === 0) {
            alert('Only PDF files are supported.');
            return;
        }
        
        if (files.length > 10) {
            alert('Maximum 10 files can be uploaded at once.');
            return;
        }
        
        processMultipleFiles(files);
    });

    // Click to upload (works on all devices)
    uploadZone.addEventListener('click', (e) => {
        console.log('Upload zone clicked', e.target.tagName);
        // Prevent double-triggering if clicking the input directly
        if (e.target !== pdfInput) {
            e.preventDefault();
            pdfInput.click();
        }
    });
}

if (pdfInput) {
    pdfInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Initialize on load
window.addEventListener('load', () => {
    console.log('PDF Viewer initialized');
    console.log('Elements found:', {
        pdfInput: !!pdfInput,
        uploadZone: !!uploadZone,
        fileMetaSection: !!fileMetaSection,
        pdfPreviewArea: !!pdfPreviewArea,
        textDisplayArea: !!textDisplayArea,
        pdfFilesList: !!pdfFilesList
    });
    
    resetToEmpty();
    
    // Mobile-specific adjustments
    if (isMobile && pdfInput) {
        // Remove 'multiple' attribute on mobile for simpler UX
        pdfInput.removeAttribute('multiple');
        console.log('Mobile detected: Single file upload mode');
    }
    
    // Update hint text
    const hintElement = document.querySelector('.upload-hint');
    if (hintElement) {
        if (isMobile) {
            hintElement.textContent = `Maximum size ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)} MB · tap to select`;
        }
    }
    
    // Test click functionality
    if (!pdfInput) {
        console.error('ERROR: pdfInput element not found!');
    }
    if (!uploadZone) {
        console.error('ERROR: uploadZone element not found!');
    }
});

// Handle orientation changes on mobile
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        // Re-render preview if exists after orientation change
        if (activeTabId && activePDFs.has(activeTabId)) {
            const pdfData = activePDFs.get(activeTabId);
            if (pdfData.previewCanvas) {
                displayPDFContent(pdfData);
            }
        }
    }, 300);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + W to close active file
    if ((e.ctrlKey || e.metaKey) && e.key === 'w' && activeTabId) {
        e.preventDefault();
        removeFile(activeTabId);
    }
    
    // Ctrl/Cmd + Tab to switch between files
    if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && activePDFs.size > 1) {
        e.preventDefault();
        const pdfIds = Array.from(activePDFs.keys());
        const currentIndex = pdfIds.indexOf(activeTabId);
        const nextIndex = (currentIndex + 1) % pdfIds.length;
        switchToFile(pdfIds[nextIndex]);
    }
});