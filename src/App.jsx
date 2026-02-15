import React, { useState, useRef, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb } from 'pdf-lib';

// Set up PDF.js worker
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function RedactionTool() {
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [pdfPages, setPdfPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [redactions, setRedactions] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const canvasRef = useRef(null);
  const imageRef = useRef(null);

  // Handle file upload
  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;

    const fileExtension = uploadedFile.name.split('.').pop().toLowerCase();
    
    if (!['pdf', 'png', 'jpg', 'jpeg'].includes(fileExtension)) {
      alert('Please upload PDF, PNG, or JPG files only');
      return;
    }

    setFile(uploadedFile);
    setFileType(fileExtension);
    setRedactions([]);
    setHistory([]);
    setHistoryIndex(-1);
    setCurrentPage(0);

    if (fileExtension === 'pdf') {
      await loadPDF(uploadedFile);
    } else {
      loadImage(uploadedFile);
    }
  };

  // Load PDF and convert pages to images
  const loadPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: context, viewport }).promise;
      pages.push(canvas.toDataURL('image/png'));
    }

    setPdfPages(pages);
    setImageSrc(pages[0]);
  };

  // Load image file
  const loadImage = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setImageSrc(e.target.result);
      setPdfPages([]);
    };
    reader.readAsDataURL(file);
  };

  // Draw canvas with image and redactions
  useEffect(() => {
    if (!imageSrc || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Draw all redaction boxes
      redactions.forEach(rect => {
        ctx.fillStyle = 'black';
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      });
    };

    img.src = imageSrc;
  }, [imageSrc, redactions]);

  // Mouse down - start drawing
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setIsDrawing(true);
    setStartPos({ x, y });
  };

  // Mouse move - draw preview
  const handleMouseMove = (e) => {
    if (!isDrawing || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;

    // Redraw everything with preview
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      
      // Draw saved redactions
      redactions.forEach(r => {
        ctx.fillStyle = 'black';
        ctx.fillRect(r.x, r.y, r.width, r.height);
      });

      // Draw preview
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      const width = currentX - startPos.x;
      const height = currentY - startPos.y;
      ctx.fillRect(startPos.x, startPos.y, width, height);
      ctx.strokeRect(startPos.x, startPos.y, width, height);
    };
    img.src = imageSrc;
  };

  // Mouse up - save redaction
  const handleMouseUp = (e) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;

    const newRedaction = {
      x: Math.min(startPos.x, currentX),
      y: Math.min(startPos.y, currentY),
      width: Math.abs(currentX - startPos.x),
      height: Math.abs(currentY - startPos.y)
    };

    // Only save if rectangle has size
    if (newRedaction.width > 5 && newRedaction.height > 5) {
      const newRedactions = [...redactions, newRedaction];
      setRedactions(newRedactions);
      
      // Save to history
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newRedactions);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }

    setIsDrawing(false);
    setStartPos(null);
  };

  // Undo
  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setRedactions(history[historyIndex - 1]);
    } else if (historyIndex === 0) {
      setHistoryIndex(-1);
      setRedactions([]);
    }
  };

  // Redo
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setRedactions(history[historyIndex + 1]);
    }
  };



  // Download as PNG
  const downloadAsPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const originalName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
    const link = document.createElement('a');
    link.download = `${originalName}_redacted.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Download as PDF
  const downloadAsPDF = async () => {
    if (!canvasRef.current) return;

    const pdfDoc = await PDFDocument.create();
    const canvas = canvasRef.current;
    
    const pngImageBytes = canvas.toDataURL('image/png');
    const pngImage = await pdfDoc.embedPng(pngImageBytes);
    const page = pdfDoc.addPage([canvas.width, canvas.height]);
    
    page.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    });

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    
    const originalName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
    link.download = `${originalName}_redacted.pdf`;
    link.click();
  };

  // Change page for multi-page PDFs
  const changePage = (pageIndex) => {
    setCurrentPage(pageIndex);
    setImageSrc(pdfPages[pageIndex]);
    setRedactions([]);
    setHistory([]);
    setHistoryIndex(-1);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      color: '#1e293b',
      padding: '2rem 1rem'
    }}>
      <style>{`
        :root {
          --primary-color: #2563eb;
          --primary-hover: #1d4ed8;
          --success-color: #10b981;
          --error-color: #ef4444;
          --bg-color: #f8fafc;
          --card-bg: #ffffff;
          --text-color: #1e293b;
          --text-muted: #64748b;
          --border-color: #e2e8f0;
          --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
          --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
        }
        
        * { box-sizing: border-box; }
        
        .file-input {
          display: none;
        }
        
        .upload-btn {
          background: var(--primary-color);
          color: white;
          border: none;
          padding: 0.875rem 2rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          border-radius: 0.5rem;
          transition: all 0.2s;
          display: inline-block;
        }
        
        .upload-btn:hover {
          background: var(--primary-hover);
          box-shadow: var(--shadow-lg);
          transform: translateY(-1px);
        }
        
        .btn {
          background: var(--card-bg);
          color: var(--text-color);
          border: 1px solid var(--border-color);
          padding: 0.75rem 1.5rem;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          border-radius: 0.5rem;
          transition: all 0.2s;
        }
        
        .btn:hover:not(:disabled) {
          border-color: var(--primary-color);
          background: #eff6ff;
          transform: translateY(-1px);
        }
        
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none !important;
        }
        
        .btn-primary {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }
        
        .btn-primary:hover:not(:disabled) {
          background: var(--primary-hover);
          border-color: var(--primary-hover);
        }
        
        canvas {
          border: 2px solid var(--border-color);
          cursor: crosshair;
          max-width: 100%;
          height: auto;
          box-shadow: var(--shadow-lg);
          border-radius: 0.5rem;
          background: white;
        }
        
        .page-btn {
          background: var(--card-bg);
          color: var(--text-color);
          border: 1px solid var(--border-color);
          padding: 0.5rem 1rem;
          font-size: 0.875rem;
          cursor: pointer;
          border-radius: 0.375rem;
          margin: 0 0.25rem;
          transition: all 0.2s ease;
          font-weight: 500;
        }
        
        .page-btn:hover {
          border-color: var(--primary-color);
          background: #eff6ff;
        }
        
        .page-btn.active {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }
        
        .card {
          background: var(--card-bg);
          border-radius: 0.75rem;
          padding: 2rem;
          margin-bottom: 1.5rem;
          box-shadow: var(--shadow);
          border: 1px solid var(--border-color);
        }
      `}</style>

      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{
            fontSize: '2.5rem',
            marginBottom: '0.5rem',
            color: 'var(--primary-color)',
            fontWeight: '600'
          }}>
            Document Redaction Tool
          </h1>
          
          <p style={{
            color: 'var(--text-muted)',
            fontSize: '1.1rem'
          }}>
            Upload → Draw boxes → Download • 100% Client-Side
          </p>
        </header>

        {/* Upload Section */}
        <div className="card">
          <h2 style={{
            fontSize: '1.5rem',
            marginBottom: '1.25rem',
            color: 'var(--text-color)',
            fontWeight: '600'
          }}>
            Upload Document
          </h2>
          <div style={{ textAlign: 'center' }}>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={handleFileUpload}
              className="file-input"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="upload-btn">
              📁 Choose File (PDF, PNG, or JPG)
            </label>
            {file && (
              <p style={{
                marginTop: '1rem',
                color: 'var(--text-muted)',
                fontSize: '0.95rem'
              }}>
                <strong>Selected:</strong> {file.name}
              </p>
            )}
          </div>
        </div>

        {/* Canvas */}
        {imageSrc && (
          <div className="card">
            <h3 style={{
              fontSize: '1.2rem',
              marginBottom: '1rem',
              color: 'var(--text-color)',
              fontWeight: '600'
            }}>
              Redaction Canvas
            </h3>
            <div style={{
              marginBottom: '1rem',
              padding: '0.875rem',
              background: '#eff6ff',
              borderRadius: '0.5rem',
              fontSize: '0.9rem',
              color: '#1e40af',
              border: '1px solid #bfdbfe',
              textAlign: 'center'
            }}>
              🖱️ Click and drag on the image to draw redaction boxes
            </div>
            <div style={{ textAlign: 'center' }}>
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
            
            {/* Page Navigation for PDFs - compact, under canvas */}
            {pdfPages.length > 1 && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                background: 'var(--bg-color)',
                borderRadius: '0.5rem',
                textAlign: 'center',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                flexWrap: 'wrap'
              }}>
                <span style={{ 
                  fontSize: '0.875rem',
                  color: 'var(--text-muted)',
                  fontWeight: '500'
                }}>
                  Page {currentPage + 1} of {pdfPages.length}
                </span>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {pdfPages.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => changePage(idx)}
                      className={`page-btn ${idx === currentPage ? 'active' : ''}`}
                      style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.813rem',
                        minWidth: '2rem'
                      }}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        {imageSrc && (
          <div className="card">
            <h3 style={{
              fontSize: '1.2rem',
              marginBottom: '1rem',
              color: 'var(--text-color)',
              fontWeight: '600'
            }}>
              Actions
            </h3>
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={handleUndo}
                disabled={historyIndex < 0}
                className="btn"
              >
                ↶ Undo
              </button>
              <button
                onClick={handleRedo}
                disabled={historyIndex >= history.length - 1}
                className="btn"
              >
                ↷ Redo
              </button>
              <button
                onClick={downloadAsPNG}
                className="btn btn-primary"
              >
                ⬇ Download PNG
              </button>
              <button
                onClick={downloadAsPDF}
                className="btn btn-primary"
              >
                ⬇ Download PDF
              </button>
            </div>
            
            {/* Info */}
            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: 'var(--bg-color)',
              borderRadius: '0.5rem',
              fontSize: '0.9rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
              border: '1px solid var(--border-color)'
            }}>
              <strong style={{ color: 'var(--text-color)' }}>Current Session:</strong> {redactions.length} redaction{redactions.length !== 1 ? 's' : ''} • {fileType?.toUpperCase()}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer style={{
          textAlign: 'center',
          marginTop: '3rem',
          paddingTop: '2rem',
          borderTop: '1px solid var(--border-color)',
          color: 'var(--text-muted)',
          fontSize: '0.9rem'
        }}>
          <p style={{ marginBottom: '0.5rem' }}>
            All processing happens in your browser. No data is uploaded to any server.
          </p>
          <p style={{
            fontSize: '0.875rem',
            color: 'var(--error-color)',
            fontWeight: '500'
          }}>
            ⚠️ Always verify redacted documents before sharing
          </p>
        </footer>
      </div>
    </div>
  );
}