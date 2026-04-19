import React, { useState, useEffect, useCallback, useRef } from 'react';
import TopBar from './components/TopBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import ViewerRouter from './viewers/ViewerRouter.jsx';
import Canvas2D from './components/Canvas2D.jsx';
import useTheme from './hooks/useTheme.js';
import './App.css';

function getViewerKey(ext) {
  const e = ext.toLowerCase();
  if (['pdf'].includes(e)) return 'pdf';
  if (['docx', 'rtf', 'odt'].includes(e)) return 'docx';
  if (['pptx'].includes(e)) return 'pptx';
  if (['xlsx', 'xls', 'csv'].includes(e)) return 'spreadsheet';
  if (['txt', 'md'].includes(e)) return 'text';
  if (['jpg','jpeg','png','gif','webp','svg'].includes(e)) return 'image';
  if (['mp4','avi','mkv','mov','webm'].includes(e)) return 'video';
  if (['mp3','wav','ogg','flac','aac'].includes(e)) return 'audio';
  if (['json','xml','yaml','yml'].includes(e)) return 'code';
  if (['zip'].includes(e)) return 'archive';
  if (['epub'].includes(e)) return 'epub';
  if (['html','htm'].includes(e)) return 'html';
  return 'unknown';
}

let tabIdCounter = 0;

export default function App() {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [recentFiles, setRecentFiles] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [canvasMode, setCanvasMode] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const dragCounter = useRef(0);

  // Ref always holds latest tabs — prevents stale closure in openFilePath
  const tabsRef = useRef([]);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);

  const openFilePath = useCallback(async (filePath) => {
    if (!filePath) return;

    const existing = tabsRef.current.find(t => t.filePath === filePath);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const ext = filePath.split('.').pop().toLowerCase();
    const name = filePath.split(/[\\/]/).pop();
    const id = ++tabIdCounter;

    const newTab = { id, filePath, name, ext, viewerKey: getViewerKey(ext) };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);

    if (window.electronAPI) {
      const recent = await window.electronAPI.addRecentFile(filePath);
      setRecentFiles(recent);
    }
  }, []);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getRecentFiles().then(setRecentFiles);
      window.electronAPI.onOpenFilePath((fp) => openFilePath(fp));
    }
  }, []);

  const handleOpenFile = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openFileDialog();
    if (result) {
      await openFilePath(result.filePath);
      setRecentFiles(result.recent);
    }
  }, [openFilePath]);

  // Both setTabs and setActiveTabId use functional updaters — no stale reads
  const closeTab = useCallback((id, e) => {
    e?.stopPropagation();
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      setActiveTabId(current => {
        if (current !== id) return current;
        if (next.length === 0) return null;
        const idx = prev.findIndex(t => t.id === id);
        return next[Math.min(idx, next.length - 1)].id;
      });
      return next;
    });
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.items?.length > 0) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => { e.preventDefault(); }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    Array.from(e.dataTransfer.files).forEach(file => {
      if (file.path) openFilePath(file.path);
    });
  }, [openFilePath]);

  return (
    <div
      className="app-root"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <TopBar
        onOpenFile={handleOpenFile}
        tabs={tabs}
        activeTabId={activeTabId}
        onTabSelect={setActiveTabId}
        onTabClose={closeTab}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(p => !p)}
        canvasMode={canvasMode}
        onToggleCanvas={() => setCanvasMode(p => !p)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <div className="app-body">
        {sidebarOpen && (
          <Sidebar
            recentFiles={recentFiles}
            onOpenFile={openFilePath}
            onRemoveRecent={async (fp) => {
              if (window.electronAPI) {
                const updated = await window.electronAPI.removeRecentFile(fp);
                setRecentFiles(updated);
              }
            }}
            onClearRecent={async () => {
              if (window.electronAPI) {
                const updated = await window.electronAPI.clearRecentFiles();
                setRecentFiles(updated);
              }
            }}
          />
        )}
        <main className="viewer-area">
          {tabs.length === 0 ? (
            <EmptyState onOpenFile={handleOpenFile} onNewCanvas={() => setCanvasMode(true)} />
          ) : (
            tabs.map(tab => (
              <div
                key={tab.id}
                className="viewer-panel"
                style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
              >
                <ViewerRouter tab={tab} />
              </div>
            ))
          )}
        </main>
      </div>

      {canvasMode && <Canvas2D onClose={() => setCanvasMode(false)} />}

      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-inner">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            <span>Drop file to open</span>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onOpenFile, onNewCanvas }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/>
          <polyline points="13 2 13 9 20 9"/>
        </svg>
      </div>
      <h2>No file open</h2>
      <p>Open a file to start viewing, or drag & drop onto this window.</p>
      <div className="empty-actions">
        <button className="empty-plus-btn" onClick={onNewCanvas} title="New blank canvas" aria-label="New blank canvas">+</button>
        <button className="btn-primary" onClick={onOpenFile}>Open File</button>
      </div>
      <div className="empty-formats">
        {['PDF','DOCX','PPTX','XLSX','MP4','MP3','ZIP','EPUB','IMG','JSON'].map(f => (
          <span key={f} className="format-badge">{f}</span>
        ))}
      </div>
    </div>
  );
}
