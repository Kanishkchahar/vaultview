import React, { useEffect, useState, useRef } from 'react';
import useZoom from '../hooks/useZoom.js';
import { escapeHtml, sanitizeHtml } from '../utils/sanitizeHtml.js';

export default function DocxViewer({ tab }) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const [zoom] = useZoom(containerRef, { min: 0.5, max: 2.5, step: 0.1, initial: 1 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const mammoth = await import('mammoth');
        const result = await window.electronAPI.readFile(tab.filePath);
        if (result.error) throw new Error(result.error);
        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        try {
          const output = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
          if (!cancelled) setHtml(sanitizeHtml(output.value));
        } catch {
          const textResult = await window.electronAPI.readFileText(tab.filePath);
          if (!cancelled) setHtml(`<pre>${escapeHtml(textResult.text || '')}</pre>`);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tab.filePath]);

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Converting document…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to load document</p><small>{error}</small></div>;

  return (
    <div className="viewer-wrapper">
      <div className="pdf-toolbar">
        <span className="zoom-hint">Ctrl+Scroll or Ctrl+± to zoom</span>
        <div style={{flex:1}}/>
        <span className="pdf-page-info">{Math.round(zoom * 100)}%</span>
      </div>
      <div ref={containerRef} className="viewer-scroll">
        <div
          className="docx-content"
          style={{ fontSize: `${zoom * 15}px` }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
