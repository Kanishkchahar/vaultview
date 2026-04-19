import React from 'react';
import './TopBar.css';

export default function TopBar({ onOpenFile, tabs, activeTabId, onTabSelect, onTabClose, sidebarOpen, onToggleSidebar, canvasMode, onToggleCanvas, theme, onToggleTheme }) {
  const handleMinimize = () => window.electronAPI?.windowMinimize();
  const handleMaximize = () => window.electronAPI?.windowMaximize();
  const handleClose = () => window.electronAPI?.windowClose();

  return (
    <header className="topbar">
      {/* Left: App identity + sidebar toggle */}
      <div className="topbar-left">
        <button className="sidebar-toggle" onClick={onToggleSidebar} title="Toggle sidebar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {sidebarOpen
              ? <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>
              : <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>
            }
          </svg>
        </button>
        <div className="app-brand">
          <span className="app-brand-icon">⬡</span>
          <span className="app-brand-name">VaultView</span>
        </div>
        <button className="open-btn" onClick={onOpenFile}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          Open
        </button>
        <button className={`open-btn ${canvasMode ? 'open-btn-active' : ''}`} onClick={onToggleCanvas} title="2D Canvas workspace">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          Canvas
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'tab-active' : ''}`}
            onClick={() => onTabSelect(tab.id)}
          >
            <span className="tab-icon">{getFileIcon(tab.ext)}</span>
            <span className="tab-name" title={tab.filePath}>{tab.name}</span>
            <button
              className="tab-close"
              onClick={(e) => onTabClose(tab.id, e)}
              title="Close tab"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Theme toggle */}
      <div className="topbar-right" style={{display:'flex',alignItems:'center',flexShrink:0,zIndex:1}}>
        <button className="wc-btn" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle theme">
          {theme === 'dark'
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
          }
        </button>
      </div>

      {/* Window controls */}
      <div className="window-controls">
        <button className="wc-btn wc-min" onClick={handleMinimize} title="Minimize">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button className="wc-btn wc-max" onClick={handleMaximize} title="Maximize">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="4" y="4" width="16" height="16" rx="1"/>
          </svg>
        </button>
        <button className="wc-btn wc-close" onClick={handleClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    </header>
  );
}

function getFileIcon(ext) {
  const e = (ext || '').toLowerCase();
  if (['pdf'].includes(e)) return '📄';
  if (['docx','doc','rtf','odt'].includes(e)) return '📝';
  if (['pptx','ppt'].includes(e)) return '📊';
  if (['xlsx','xls','csv'].includes(e)) return '📈';
  if (['txt','md'].includes(e)) return '📃';
  if (['jpg','jpeg','png','gif','webp','svg'].includes(e)) return '🖼';
  if (['mp4','avi','mkv','mov'].includes(e)) return '🎬';
  if (['mp3','wav','flac'].includes(e)) return '🎵';
  if (['json','xml','yaml','yml'].includes(e)) return '{ }';
  if (['zip'].includes(e)) return '📦';
  if (['epub'].includes(e)) return '📚';
  if (['html','htm'].includes(e)) return '🌐';
  return '📄';
}
