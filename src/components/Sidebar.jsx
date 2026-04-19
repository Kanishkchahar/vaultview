import React, { useState } from 'react';
import './Sidebar.css';

function formatTime(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function getExtColor(ext) {
  const e = (ext || '').toLowerCase();
  if (['pdf'].includes(e)) return '#e05c5c';
  if (['docx','doc','rtf','odt'].includes(e)) return '#5c9ce0';
  if (['pptx','ppt'].includes(e)) return '#e07d5c';
  if (['xlsx','xls','csv'].includes(e)) return '#5ce08a';
  if (['jpg','jpeg','png','gif','webp','svg'].includes(e)) return '#c85ce0';
  if (['mp4','avi','mkv','mov'].includes(e)) return '#e0c55c';
  if (['mp3','wav'].includes(e)) return '#5ce0d6';
  if (['json','xml','yaml'].includes(e)) return '#e8c547';
  if (['zip','rar','7z'].includes(e)) return '#888';
  return '#666';
}

export default function Sidebar({ recentFiles, onOpenFile, onRemoveRecent, onClearRecent }) {
  const [hoveredPath, setHoveredPath] = useState(null);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Recent</span>
        {recentFiles.length > 0 && (
          <button className="sidebar-clear" onClick={onClearRecent} title="Clear all">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          </button>
        )}
      </div>

      <div className="sidebar-list">
        {recentFiles.length === 0 ? (
          <div className="sidebar-empty">
            <p>No recent files</p>
          </div>
        ) : (
          recentFiles.map(file => (
            <div
              key={file.path}
              className={`sidebar-item ${hoveredPath === file.path ? 'sidebar-item-hover' : ''}`}
              onClick={() => onOpenFile(file.path)}
              onMouseEnter={() => setHoveredPath(file.path)}
              onMouseLeave={() => setHoveredPath(null)}
              title={file.path}
            >
              <div
                className="sidebar-item-ext"
                style={{ color: getExtColor(file.ext), borderColor: getExtColor(file.ext) + '44' }}
              >
                {(file.ext || '?').toUpperCase().slice(0, 4)}
              </div>
              <div className="sidebar-item-info">
                <div className="sidebar-item-name">{file.name}</div>
                <div className="sidebar-item-time">{formatTime(file.timestamp)}</div>
              </div>
              {hoveredPath === file.path && (
                <button
                  className="sidebar-item-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveRecent(file.path);
                  }}
                  title="Remove from recent"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
