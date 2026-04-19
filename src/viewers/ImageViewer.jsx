import React, { useEffect, useState, useRef, useCallback } from 'react';
import useFullscreen from '../hooks/useFullscreen.js';

export default function ImageViewer({ tab }) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(wrapperRef);
  const isSvg = tab.ext.toLowerCase() === 'svg';

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true); setError(null);
        setScale(1); setOffset({ x: 0, y: 0 }); setRotation(0);
        if (isSvg) {
          const result = await window.electronAPI.readFileText(tab.filePath);
          if (result.error) throw new Error(result.error);
          const blob = new Blob([result.text], { type: 'image/svg+xml' });
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setSrc(objectUrl);
        } else {
          const result = await window.electronAPI.readFile(tab.filePath);
          if (result.error) throw new Error(result.error);
          const mimeMap = { jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp' };
          if (!cancelled) setSrc(`data:${mimeMap[tab.ext.toLowerCase()]||'image/png'};base64,${result.data}`);
        }
      } catch (e) { if (!cancelled) setError(e.message); }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [tab.filePath]);

  // Ctrl+Scroll zoom
  useEffect(() => {
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      if (!containerRef.current?.contains(e.target)) return;
      setScale(s => Math.max(0.1, Math.min(10, parseFloat((s + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)))));
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (!e.ctrlKey) return;
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setScale(s => Math.min(10, parseFloat((s+0.15).toFixed(2)))); }
      else if (e.key === '-') { e.preventDefault(); setScale(s => Math.max(0.1, parseFloat((s-0.15).toFixed(2)))); }
      else if (e.key === '0') { e.preventDefault(); setScale(1); setOffset({x:0,y:0}); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  }, [offset]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !dragStart.current) return;
    setOffset({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y });
  }, [dragging]);

  const handleMouseUp = useCallback(() => { setDragging(false); dragStart.current = null; }, []);

  function handleDownload() {
    const a = document.createElement('a');
    a.href = src; a.download = tab.name; a.click();
  }

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Loading image…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to load image</p><small>{error}</small></div>;

  return (
    <div ref={wrapperRef} className="viewer-wrapper">
      <div className="image-toolbar">
        <button className="pdf-nav-btn" onClick={() => setScale(s => Math.max(0.1, parseFloat((s-0.15).toFixed(2))))} title="Zoom out (Ctrl+-)">−</button>
        <span className="pdf-page-info">{Math.round(scale*100)}%</span>
        <button className="pdf-nav-btn" onClick={() => setScale(s => Math.min(10, parseFloat((s+0.15).toFixed(2))))} title="Zoom in (Ctrl++)">+</button>
        <button className="pdf-nav-btn" onClick={() => { setScale(1); setOffset({x:0,y:0}); }} title="Reset zoom (Ctrl+0)">↺</button>
        <div className="pdf-divider"/>
        <button className="pdf-nav-btn" onClick={() => setRotation(r => (r - 90 + 360) % 360)} title="Rotate counter-clockwise">⟲</button>
        <button className="pdf-nav-btn" onClick={() => setRotation(r => (r + 90) % 360)} title="Rotate clockwise">⟳</button>
        <div className="pdf-divider"/>
        <span className="pdf-page-info">{tab.ext.toUpperCase()}</span>
        <div style={{flex:1}}/>
        <button className="pdf-nav-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
          {isFullscreen
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
          }
        </button>
        <button className="pdf-nav-btn" onClick={handleDownload} title="Download image">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
      <div
        ref={containerRef}
        className="image-canvas"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <img
          src={src}
          alt={tab.name}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px,${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            maxWidth: 'none',
            userSelect: 'none',
            transition: dragging ? 'none' : 'transform 0.05s ease'
          }}
          onLoad={(e) => {
            const img = e.target;
            const container = containerRef.current;
            if (container && img.naturalWidth && img.naturalHeight) {
              const sx = (container.clientWidth - 48) / img.naturalWidth;
              const sy = (container.clientHeight - 48) / img.naturalHeight;
              setScale(Math.min(1, Math.min(sx, sy)));
            }
          }}
        />
      </div>
    </div>
  );
}
