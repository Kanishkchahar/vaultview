import React, { useEffect, useState, useRef } from 'react';
import useZoom from '../hooks/useZoom.js';
import { sanitizeHtml } from '../utils/sanitizeHtml.js';

export default function TextViewer({ tab }) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('rendered');
  const containerRef = useRef(null);
  const [zoom] = useZoom(containerRef, { min: 0.5, max: 2.5, step: 0.1, initial: 1 });
  const isMarkdown = tab.ext.toLowerCase() === 'md';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await window.electronAPI.readFileText(tab.filePath);
        if (result.error) throw new Error(result.error);
        if (!cancelled) setContent(result.text);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tab.filePath]);

  function handleDownload() {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = tab.name; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Loading…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to load file</p><small>{error}</small></div>;

  return (
    <div className="viewer-wrapper">
      <div className="pdf-toolbar">
        {isMarkdown && (
          <>
            <button className={`text-mode-btn ${mode === 'rendered' ? 'active' : ''}`} onClick={() => setMode('rendered')}>Preview</button>
            <button className={`text-mode-btn ${mode === 'raw' ? 'active' : ''}`} onClick={() => setMode('raw')}>Raw</button>
            <div className="pdf-divider"/>
          </>
        )}
        <span className="zoom-hint">Ctrl+Scroll or Ctrl+± to zoom</span>
        <div style={{flex:1}}/>
        <button className="pdf-nav-btn" onClick={handleDownload} title="Download file">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <span className="pdf-page-info">{Math.round(zoom * 100)}%</span>
      </div>
      <div ref={containerRef} className="viewer-scroll">
        {isMarkdown && mode === 'rendered'
          ? <MarkdownContent text={content} zoom={zoom} />
          : <pre className="text-raw" style={{ fontSize: `${zoom * 13}px` }}>{content}</pre>
        }
      </div>
    </div>
  );
}

function MarkdownContent({ text, zoom }) {
  const [html, setHtml] = useState('');
  useEffect(() => {
    async function render() {
      const { marked } = await import('marked');
      marked.setOptions({ breaks: true, gfm: true });
      setHtml(sanitizeHtml(marked.parse(text)));
    }
    render();
  }, [text]);
  return (
    <div
      className="markdown-content"
      style={{ fontSize: `${zoom * 15}px` }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
