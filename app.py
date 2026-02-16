from flask import Flask, render_template, request, jsonify
import PyPDF2
import re
import os

app = Flask(__name__)

def clean_text(text):
    """
    Professional text cleaning pipeline for PDF extraction
    """
    if not text:
        return ""
    
    # 1. Fix hyphenated line breaks (word at end of line)
    text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', text)
    text = re.sub(r'(\w+)-\s*\n\s*(\w+)', r'\1\2', text)
    
    # 2. Remove page numbers and headers/footers
    lines = text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        # Skip common page number patterns
        if re.match(r'^\s*\d+\s*$', line):
            continue
        if re.match(r'^\s*Page \d+\s*$', line, re.IGNORECASE):
            continue
        if re.match(r'^\s*-\s*\d+\s*-\s*$', line):
            continue
            
        # Skip very short lines that are likely artifacts
        if len(line.strip()) < 3:
            continue
            
        # Skip lines with only special characters
        if re.match(r'^[\s\d\.,;:\-_\'"]+$', line.strip()):
            continue
            
        cleaned_lines.append(line.rstrip())
    
    text = '\n'.join(cleaned_lines)
    
    # 3. Normalize whitespace
    text = re.sub(r' +', ' ', text)  # multiple spaces to single
    text = re.sub(r'\n\s*\n\s*\n+', '\n\n', text)  # max 2 newlines
    text = re.sub(r'[ \t]+$', '', text, flags=re.MULTILINE)  # trailing spaces
    
    # 4. Fix common PDF artifacts (ligatures)
    text = re.sub(r'ﬁ', 'fi', text)
    text = re.sub(r'ﬂ', 'fl', text)
    text = re.sub(r'ﬀ', 'ff', text)
    text = re.sub(r'ﬃ', 'ffi', text)
    text = re.sub(r'ﬄ', 'ffl', text)
    
    # 5. Remove isolated bullets and markers
    text = re.sub(r'^\s*[•·−–—―■□▪▫●○]\s*$', '', text, flags=re.MULTILINE)
    
    # 6. Fix spacing around punctuation
    text = re.sub(r'\s+([.,;:!?)])', r'\1', text)
    text = re.sub(r'([(])\s+', r'\1', text)
    
    # 7. Remove empty lines at start/end
    text = text.strip()
    
    return text

@app.route("/")
def home():
    """Render the main application page"""
    return render_template("index.html")

@app.route('/api/clean-pdf', methods=['POST'])
def clean_pdf():
    """Process and clean PDF text"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.lower().endswith('.pdf'):
        return jsonify({'error': 'File must be a PDF'}), 400
    
    try:
        print(f"Processing file: {file.filename}")
        # Read PDF
        pdf_reader = PyPDF2.PdfReader(file)
        pages_data = []
        full_text = ''
        
        for page_num, page in enumerate(pdf_reader.pages, 1):
            page_text = page.extract_text()
            if page_text:
                # Clean each page individually
                cleaned_page = clean_text(page_text)
                pages_data.append({
                    'page': page_num,
                    'text': cleaned_page
                })
                full_text += f'[Page {page_num}]\n{cleaned_page}\n\n'
        
        # Apply global cleaning
        full_text = clean_text(full_text)
        
        # Get metadata
        metadata = {
            'pages': len(pdf_reader.pages),
            'filename': file.filename,
            'size': len(full_text)
        }
        
        # Try to get PDF info
        if pdf_reader.metadata:
            metadata['title'] = pdf_reader.metadata.get('/Title', '')
            metadata['author'] = pdf_reader.metadata.get('/Author', '')
        
        if not full_text.strip():
            return jsonify({
                'error': 'No text could be extracted',
                'suggestion': 'This PDF may be scanned or image-based'
            }), 400
        
        return jsonify({
            'success': True,
            'text': full_text,
            'pages': pages_data,
            'metadata': metadata,
            'stats': {
                'characters': len(full_text),
                'words': len(full_text.split()),
                'lines': len(full_text.split('\n'))
            }
        })
    
    except Exception as e:
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
    