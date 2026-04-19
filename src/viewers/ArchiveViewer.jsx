import React, { useEffect, useState } from 'react';

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function getFileIcon(name) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return '🖼';
  if (['pdf'].includes(ext)) return '📄';
  if (['txt','md'].includes(ext)) return '📃';
  if (['js','jsx','ts','tsx','py','java','cpp','c','h','css','html'].includes(ext)) return '💻';
  if (['json','xml','yaml','yml'].includes(ext)) return '{ }';
  if (['mp4','avi','mkv'].includes(ext)) return '🎬';
  if (['mp3','wav'].includes(ext)) return '🎵';
  if (['zip'].includes(ext)) return '📦';
  if (name.endsWith('/')) return '📁';
  return '📄';
}

export default function ArchiveViewer({ tab }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [previewContent, setPreviewContent] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [zipRef, setZipRef] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const JSZip = (await import('jszip')).default;

        const result = await window.electronAPI.readFile(tab.filePath);
        if (result.error) throw new Error(result.error);

        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const zip = await JSZip.loadAsync(bytes.buffer);
        if (cancelled) return;

        setZipRef(zip);

        const list = [];
        zip.forEach((relativePath, file) => {
          list.push({
            path: relativePath,
            name: relativePath.split('/').filter(Boolean).pop() || relativePath,
            isDir: file.dir,
            size: file._data?.uncompressedSize || 0,
            compressedSize: file._data?.compressedSize || 0,
            date: file.date,
          });
        });

        list.sort((a, b) => {
          if (a.isDir && !b.isDir) return -1;
          if (!a.isDir && b.isDir) return 1;
          return a.path.localeCompare(b.path);
        });

        if (!cancelled) setEntries(list);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tab.filePath]);

  async function previewEntry(entry) {
    if (!zipRef || entry.isDir) return;
    setSelected(entry.path);
    setPreviewContent(null);
    setPreviewLoading(true);

    try {
      const ext = entry.name.split('.').pop()?.toLowerCase() || '';
      const textExts = ['txt','md','json','xml','yaml','yml','js','jsx','ts','tsx','css','html','htm','py','java','c','cpp','h','sh','bat','csv','log','ini','toml'];
      const imgExts = ['jpg','jpeg','png','gif','webp','svg'];

      if (textExts.includes(ext)) {
        const text = await zipRef.files[entry.path].async('string');
        setPreviewContent({ type: 'text', content: text.slice(0, 50000), ext });
      } else if (imgExts.includes(ext)) {
        const b64 = await zipRef.files[entry.path].async('base64');
        const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
        setPreviewContent({ type: 'image', src: `data:${mimeMap[ext] || 'image/png'};base64,${b64}` });
      } else {
        setPreviewContent({ type: 'binary', ext, size: entry.size });
      }
    } catch (e) {
      setPreviewContent({ type: 'error', message: e.message });
    } finally {
      setPreviewLoading(false);
    }
  }

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Extracting archive…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to open archive</p><small>{error}</small></div>;

  const filtered = filter
    ? entries.filter(e => e.path.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  const totalSize = entries.reduce((s, e) => s + (e.size || 0), 0);

  return (
    <div className="viewer-wrapper" style={{ flexDirection: 'row' }}>
      {/* File tree */}
      <div className="archive-tree">
        <div className="archive-tree-header">
          <div className="archive-stats">
            {entries.length} files · {formatBytes(totalSize)}
          </div>
          <input
            className="archive-filter"
            placeholder="Filter…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        <div className="archive-list">
          {filtered.map(entry => (
            <div
              key={entry.path}
              className={`archive-entry ${selected === entry.path ? 'archive-entry-selected' : ''} ${entry.isDir ? 'archive-dir' : ''}`}
              onClick={() => !entry.isDir && previewEntry(entry)}
              style={{ paddingLeft: `${(entry.path.split('/').length - 1) * 12 + 12}px` }}
            >
              <span className="archive-entry-icon">{getFileIcon(entry.isDir ? '/' : entry.name)}</span>
              <span className="archive-entry-name">{entry.name}</span>
              {!entry.isDir && entry.size > 0 && (
                <span className="archive-entry-size">{formatBytes(entry.size)}</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Preview pane */}
      <div className="archive-preview">
        {!selected && (
          <div className="archive-preview-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>Select a file to preview</p>
          </div>
        )}
        {previewLoading && <div className="viewer-loading"><div className="spinner"/></div>}
        {!previewLoading && previewContent && (
          <div className="archive-preview-content">
            {previewContent.type === 'text' && (
              <pre className="archive-text-preview">{previewContent.content}</pre>
            )}
            {previewContent.type === 'image' && (
              <img src={previewContent.src} alt="" className="archive-img-preview" />
            )}
            {previewContent.type === 'binary' && (
              <div className="archive-binary-notice">
                <p>Binary file (.{previewContent.ext})</p>
                <small>{formatBytes(previewContent.size)}</small>
              </div>
            )}
            {previewContent.type === 'error' && (
              <div className="archive-binary-notice" style={{ color: 'var(--red)' }}>
                <p>Preview failed</p><small>{previewContent.message}</small>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
