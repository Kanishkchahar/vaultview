import React, { useEffect, useState } from 'react';

function formatBytes(b) {
  if (!b) return 'Unknown size';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

export default function UnknownViewer({ tab }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [textPreview, setTextPreview] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const result = await window.electronAPI.readFile(tab.filePath);
        if (cancelled) return;
        if (!result.error) {
          setFileInfo({ size: result.size });
          const textResult = await window.electronAPI.readFileText(tab.filePath);
          if (cancelled) return;
          if (!textResult.error && textResult.text) {
            const isProbablyText = !textResult.text.includes('\x00');
            if (isProbablyText) setTextPreview(textResult.text.slice(0, 4096));
          }
        } else {
          setError(result.error);
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

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Reading file…</span></div>;

  return (
    <div className="viewer-wrapper">
      <div className="viewer-scroll">
        <div className="unknown-container">
          <div className="unknown-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
              <polyline points="13 2 13 9 20 9"/>
              <line x1="9" y1="14" x2="15" y2="14"/>
              <line x1="9" y1="18" x2="11" y2="18"/>
            </svg>
          </div>
          <div className="unknown-title">{tab.name}</div>
          <div className="unknown-meta">
            <span className="format-badge">.{tab.ext || 'unknown'}</span>
            {fileInfo && <span className="unknown-size">{formatBytes(fileInfo.size)}</span>}
          </div>
          <p className="unknown-desc">
            No viewer available for <strong>.{tab.ext}</strong> files.
          </p>
          {error && <p style={{ color: 'var(--red)', fontSize: 12 }}>{error}</p>}
          {textPreview && (
            <div className="unknown-text-preview">
              <div className="unknown-preview-label">Text Preview</div>
              <pre className="text-raw" style={{ maxHeight: 300, overflow: 'auto' }}>{textPreview}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
