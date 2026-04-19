import React, { useEffect, useState, useRef } from 'react';

export default function HtmlViewer({ tab }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sandboxed, setSandboxed] = useState(true);
  const iframeRef = useRef(null);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const result = await window.electronAPI.readFileText(tab.filePath);
        if (result.error) throw new Error(result.error);

        const blob = new Blob([result.text], { type: 'text/html' });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) { setSrc(objectUrl); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    }

    load();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [tab.filePath]);

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Loading HTML…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to load HTML</p><small>{error}</small></div>;

  return (
    <div className="viewer-wrapper">
      <div className="html-toolbar">
        <span className="code-lang-badge">HTML</span>
        <div style={{ flex: 1 }}/>
        <label className="html-sandbox-toggle">
          <input
            type="checkbox"
            checked={sandboxed}
            onChange={e => setSandboxed(e.target.checked)}
          />
          <span>Sandboxed</span>
        </label>
        <button
          className="text-mode-btn"
          onClick={() => {
            if (iframeRef.current) iframeRef.current.src = src;
          }}
        >Reload</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <iframe
          ref={iframeRef}
          src={src}
          className="html-iframe"
          title="HTML preview"
          sandbox={sandboxed
            ? ''
            : 'allow-same-origin allow-scripts allow-forms allow-popups'
          }
        />
      </div>
    </div>
  );
}
