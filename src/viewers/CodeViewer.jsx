import React, { useEffect, useState, useRef } from 'react';
import useZoom from '../hooks/useZoom.js';

export default function CodeViewer({ tab }) {
  const [content, setContent] = useState('');
  const [highlighted, setHighlighted] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [wordWrap, setWordWrap] = useState(false);
  const [lineNumbers, setLineNumbers] = useState(true);
  const containerRef = useRef(null);
  const [zoom] = useZoom(containerRef, { min: 0.5, max: 2.5, step: 0.1, initial: 1 });
  const ext = tab.ext.toLowerCase();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const result = await window.electronAPI.readFileText(tab.filePath);
        if (result.error) throw new Error(result.error);
        const text = result.text;
        if (cancelled) return;
        setContent(text);
        let displayText = text;
        if (ext === 'json') {
          try { displayText = JSON.stringify(JSON.parse(text), null, 2); } catch {}
        }
        const hljs = await import('highlight.js');
        const langMap = { json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml' };
        const lang = langMap[ext] || 'plaintext';
        let res;
        try { res = hljs.default.highlight(displayText, { language: lang }); }
        catch { res = hljs.default.highlightAuto(displayText); }
        if (!cancelled) setHighlighted(res.value);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tab.filePath]);

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Parsing…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to load file</p><small>{error}</small></div>;

  const lines = highlighted.split('\n');
  const lineCount = content.split('\n').length;

  return (
    <div className="viewer-wrapper">
      <div className="code-toolbar">
        <span className="code-lang-badge">{ext.toUpperCase()}</span>
        <span className="code-stat">{lineCount} lines</span>
        <div className="pdf-divider"/>
        <span className="zoom-hint">Ctrl+Scroll or Ctrl+± to zoom</span>
        <div style={{ flex: 1 }}/>
        <span className="pdf-page-info">{Math.round(zoom * 100)}%</span>
        <div className="pdf-divider"/>
        <button className={`text-mode-btn ${wordWrap ? 'active' : ''}`} onClick={() => setWordWrap(w => !w)}>Wrap</button>
        <button className={`text-mode-btn ${lineNumbers ? 'active' : ''}`} onClick={() => setLineNumbers(l => !l)}>#</button>
        <button className="text-mode-btn" onClick={() => navigator.clipboard?.writeText(content)} title="Copy to clipboard">Copy</button>
        <button className="pdf-nav-btn" onClick={() => {
          const blob = new Blob([content], {type:'text/plain'});
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href=url; a.download=tab.name; a.click();
          URL.revokeObjectURL(url);
        }} title="Download file">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
      <div ref={containerRef} className="viewer-scroll" style={{ padding: 0, background: '#0d0d0d' }}>
        <div className={`code-block ${wordWrap ? 'code-wrap' : ''}`}>
          {lineNumbers && (
            <div className="code-line-nums" aria-hidden="true">
              {lines.map((_, i) => (
                <div key={i} className="code-line-num" style={{ fontSize: `${zoom * 12}px` }}>{i + 1}</div>
              ))}
            </div>
          )}
          <pre
            className="code-pre hljs"
            style={{ fontSize: `${zoom * 13}px` }}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </div>
      </div>
    </div>
  );
}
