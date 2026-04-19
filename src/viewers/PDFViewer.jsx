import React, { useEffect, useRef, useState, useCallback } from 'react';
import useFullscreen from '../hooks/useFullscreen.js';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const SCALE_MIN   = 0.25;   // 25%
const SCALE_MAX   = 4.0;    // 400%
const SCALE_STEP  = 0.15;
const PAN_NUDGE   = 10;     // px per arrow key press
const MIN_VISIBLE = 0.2;    // at least 20% of canvas must stay in view
const PRESETS     = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function clampScale(s) {
  return parseFloat(Math.min(SCALE_MAX, Math.max(SCALE_MIN, s)).toFixed(3));
}

/**
 * Clamp pan offset so at least MIN_VISIBLE of the canvas
 * is always visible inside the container.
 */
function clampOffset(ox, oy, canvasW, canvasH, containerW, containerH, scale) {
  const scaledW = canvasW * scale;
  const scaledH = canvasH * scale;

  const minX = scaledW <= containerW
    ? (containerW - scaledW) / 2
    : containerW - scaledW + scaledW * MIN_VISIBLE;
  const maxX = scaledW <= containerW
    ? minX
    : scaledW * (1 - MIN_VISIBLE);
  const minY = scaledH <= containerH
    ? (containerH - scaledH) / 2
    : containerH - scaledH + scaledH * MIN_VISIBLE;
  const maxY = scaledH <= containerH
    ? minY
    : scaledH * (1 - MIN_VISIBLE);

  return {
    x: Math.min(maxX, Math.max(minX, ox)),
    y: Math.min(maxY, Math.max(minY, oy)),
  };
}

/**
 * Center the canvas inside the container.
 */
function centeredOffset(canvasW, canvasH, containerW, containerH, scale) {
  return {
    x: (containerW - canvasW * scale) / 2,
    y: (containerH - canvasH * scale) / 2,
  };
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function PDFViewer({ tab }) {
  const wrapperRef    = useRef(null);
  const containerRef  = useRef(null);  // scrollable viewport div
  const canvasRef     = useRef(null);  // actual PDF canvas
  const renderTaskRef = useRef(null);
  const pdfDocRef     = useRef(null);

  // Zoom + pan stored together for easy reset/save
  const [view, setView] = useState({ scale: 1.0, x: 0, y: 0 });
  // Refs mirror state so event handlers read fresh values without re-binding
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [numPages, setNumPages]     = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [progress, setProgress]     = useState(0);
  const [rotation, setRotation]     = useState(0);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });  // rendered canvas dims

  // UI panels
  const [searchOpen, setSearchOpen]       = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchIdx, setSearchIdx]         = useState(0);
  const [bookmarks, setBookmarks]         = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showThumbs, setShowThumbs]       = useState(false);
  const [thumbs, setThumbs]               = useState([]);
  const [showInfo, setShowInfo]           = useState(false);
  const [fileInfo, setFileInfo]           = useState(null);
  const [gotoValue, setGotoValue]         = useState('');
  const [showMinimap, setShowMinimap]     = useState(false);

  const searchInputRef      = useRef(null);
  const thumbsGeneratedRef  = useRef(false);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(wrapperRef);

  // ── Derived: is canvas larger than container? ──
  const isZoomedIn = view.scale > 1.0;

  // ─────────────────────────────────────────────
  // ZOOM — change scale, keep point under cursor fixed
  // ─────────────────────────────────────────────
  /**
   * Apply a new scale, optionally zooming toward a focal point
   * (clientX/Y relative to container).
   */
  const applyScale = useCallback((newScale, focalX, focalY) => {
    newScale = clampScale(newScale);
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) { setView(v => ({ ...v, scale: newScale })); return; }

    const { w, h } = canvasSize;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    setView(prev => {
      // If no focal point given, zoom toward center
      const fx = focalX ?? cw / 2;
      const fy = focalY ?? ch / 2;

      // World point under cursor before zoom
      const worldX = (fx - prev.x) / prev.scale;
      const worldY = (fy - prev.y) / prev.scale;

      // New offset so that same world point stays under cursor
      let nx = fx - worldX * newScale;
      let ny = fy - worldY * newScale;

      // Toolbar/dropdown zoom has no cursor focal point, so use centered zoom.
      if (focalX == null || focalY == null) {
        const centered = centeredOffset(w, h, cw, ch, newScale);
        nx = centered.x;
        ny = centered.y;
      } else {
        const clamped = clampOffset(nx, ny, w, h, cw, ch, newScale);
        nx = clamped.x;
        ny = clamped.y;
      }

      return { scale: newScale, x: nx, y: ny };
    });
  }, [canvasSize]);

  const zoomIn    = useCallback((fx, fy) => applyScale(viewRef.current.scale + SCALE_STEP, fx, fy), [applyScale]);
  const zoomOut   = useCallback((fx, fy) => applyScale(viewRef.current.scale - SCALE_STEP, fx, fy), [applyScale]);
  const zoomReset = useCallback(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;
    const { w, h } = canvasSize;
    const centered  = centeredOffset(w, h, container.clientWidth, container.clientHeight, 1.0);
    setView({ scale: 1.0, x: centered.x, y: centered.y });
  }, [canvasSize]);

  // ─────────────────────────────────────────────
  // MOUSE WHEEL — Ctrl+Scroll zooms at cursor position
  // Uses a stable callback so the listener always has
  // the latest applyScale without re-binding on every render.
  // ─────────────────────────────────────────────
  const applyScaleRef = useRef(applyScale);
  useEffect(() => { applyScaleRef.current = applyScale; }, [applyScale]);

  // Attach wheel listener via ref callback — guarantees el is in the DOM
  const setContainerRef = useCallback((el) => {
    // Detach from old element
    if (containerRef.current && containerRef.current !== el) {
      containerRef.current.__wheelHandler && containerRef.current.removeEventListener('wheel', containerRef.current.__wheelHandler);
    }
    containerRef.current = el;
    if (!el) return;

    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      // Cursor position relative to the container
      const rect  = el.getBoundingClientRect();
      const fx    = e.clientX - rect.left;
      const fy    = e.clientY - rect.top;
      const delta = e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
      applyScaleRef.current(viewRef.current.scale + delta, fx, fy);
    };

    el.__wheelHandler = onWheel;
    el.addEventListener('wheel', onWheel, { passive: false });
  }, []);

  // ─────────────────────────────────────────────
  // PINCH GESTURE — two-finger zoom on touch devices
  // ─────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let lastDist   = null;
    let lastMidX   = null;
    let lastMidY   = null;

    const getTouchDist = (t) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        lastDist = getTouchDist(e.touches);
        const rect = el.getBoundingClientRect();
        lastMidX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
        lastMidY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
      }
    };

    const onTouchMove = (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        if (lastDist === null) { lastDist = dist; return; }
        const ratio    = dist / lastDist;
        const newScale = clampScale(viewRef.current.scale * ratio);
        applyScale(newScale, lastMidX, lastMidY);
        lastDist = dist;
      }
    };

    const onTouchEnd = () => { lastDist = null; };

    el.addEventListener('touchstart',  onTouchStart, { passive: true });
    el.addEventListener('touchmove',   onTouchMove,  { passive: false });
    el.addEventListener('touchend',    onTouchEnd,   { passive: true });

    return () => {
      el.removeEventListener('touchstart',  onTouchStart);
      el.removeEventListener('touchmove',   onTouchMove);
      el.removeEventListener('touchend',    onTouchEnd);
    };
  }, [applyScale]);

  // ─────────────────────────────────────────────
  // PAN — mouse drag
  // ─────────────────────────────────────────────
  const panStart = useRef(null);
  const [isPanning, setIsPanning] = useState(false);

  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    panStart.current = { mx: e.clientX, my: e.clientY, ox: viewRef.current.x, oy: viewRef.current.y };
    setIsPanning(true);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (!panStart.current) return;
      const dx = e.clientX - panStart.current.mx;
      const dy = e.clientY - panStart.current.my;
      const nx = panStart.current.ox + dx;
      const ny = panStart.current.oy + dy;
      const container = containerRef.current;
      const { w, h } = canvasSize;
      if (!container) return;
      const { x, y } = clampOffset(nx, ny, w, h, container.clientWidth, container.clientHeight, viewRef.current.scale);
      setView(prev => ({ ...prev, x, y }));
    };

    const onUp = () => {
      panStart.current = null;
      setIsPanning(false);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [canvasSize]);

  // ─────────────────────────────────────────────
  // PAN — touch drag (single finger)
  // ─────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let touchPanStart = null;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      touchPanStart = { mx: e.touches[0].clientX, my: e.touches[0].clientY, ox: viewRef.current.x, oy: viewRef.current.y };
    };

    const onTouchMove = (e) => {
      if (e.touches.length !== 1 || !touchPanStart) return;
      e.preventDefault();
      const dx = e.touches[0].clientX - touchPanStart.mx;
      const dy = e.touches[0].clientY - touchPanStart.my;
      const nx = touchPanStart.ox + dx;
      const ny = touchPanStart.oy + dy;
      const container = containerRef.current;
      const { w, h } = canvasSize;
      if (!container) return;
      const { x, y } = clampOffset(nx, ny, w, h, container.clientWidth, container.clientHeight, viewRef.current.scale);
      setView(prev => ({ ...prev, x, y }));
    };

    const onTouchEnd = () => { touchPanStart = null; };

    el.addEventListener('touchstart',  onTouchStart, { passive: true });
    el.addEventListener('touchmove',   onTouchMove,  { passive: false });
    el.addEventListener('touchend',    onTouchEnd,   { passive: true });

    return () => {
      el.removeEventListener('touchstart',  onTouchStart);
      el.removeEventListener('touchmove',   onTouchMove);
      el.removeEventListener('touchend',    onTouchEnd);
    };
  }, [canvasSize]);

  // ─────────────────────────────────────────────
  // KEYBOARD SHORTCUTS
  // ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const active = document.activeElement;
      const inInput = active?.tagName === 'INPUT' || active?.tagName === 'SELECT';

      // Zoom shortcuts (always active)
      if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomIn(); return; }
      if (e.ctrlKey && e.key === '-')  { e.preventDefault(); zoomOut(); return; }
      if (e.ctrlKey && e.key === '0')  { e.preventDefault(); zoomReset(); return; }
      if (e.ctrlKey && e.key === 'f')  { e.preventDefault(); setSearchOpen(s => !s); setTimeout(() => searchInputRef.current?.focus(), 50); return; }

      if (inInput) return; // don't hijack inputs for nav keys

      // Page navigation
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'j')
        return setCurrentPage(p => Math.min(numPages, p + 1));
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp'   || e.key === 'k')
        return setCurrentPage(p => Math.max(1, p - 1));

      // Pan nudge with arrow keys when zoomed in (override page nav when zoomed)
      if (viewRef.current.scale > 1.0) {
        const container = containerRef.current;
        const { w, h } = canvasSize;
        if (!container) return;
        const nudge = (dx, dy) => {
          setView(prev => {
            const { x, y } = clampOffset(prev.x + dx, prev.y + dy, w, h, container.clientWidth, container.clientHeight, prev.scale);
            return { ...prev, x, y };
          });
        };
        if (e.key === 'ArrowRight') { e.preventDefault(); nudge(-PAN_NUDGE, 0); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); nudge(PAN_NUDGE,  0); }
        if (e.key === 'ArrowDown')  { e.preventDefault(); nudge(0, -PAN_NUDGE); }
        if (e.key === 'ArrowUp')    { e.preventDefault(); nudge(0,  PAN_NUDGE); }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [numPages, zoomIn, zoomOut, zoomReset, canvasSize]);

  // ─────────────────────────────────────────────
  // LOAD PDF — runs once per file
  // ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setThumbs([]); thumbsGeneratedRef.current = false;
    setSearchResults([]); setSearchQuery(''); setSearchOpen(false);
    setBookmarks([]); setProgress(0); setRotation(0);

    async function loadPDF() {
      try {
        setLoading(true); setError(null);
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.mjs', import.meta.url
        ).toString();

        const result = await window.electronAPI.readFile(tab.filePath);
        if (result.error) throw new Error(result.error);

        const binary = atob(result.data);
        const bytes  = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        if (cancelled) return;

        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        setFileInfo({ name: tab.name, size: result.size, ext: tab.ext });
        setLoading(false);
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    }

    loadPDF();
    return () => { cancelled = true; };
  }, [tab.filePath]);

  // ─────────────────────────────────────────────
  // RENDER — re-render only on page/rotation change
  // Zoom uses CSS transform — NO re-render on zoom
  // ─────────────────────────────────────────────
  useEffect(() => {
    if (!pdfDocRef.current || loading) return;
    renderPage(currentPage, rotation);
    setProgress(numPages > 0 ? Math.round((currentPage / numPages) * 100) : 0);
  }, [currentPage, rotation, loading, numPages]);

  async function renderPage(pageNum, pageRotation) {
    if (!pdfDocRef.current || !canvasRef.current) return;
    if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }

    try {
      const page     = await pdfDocRef.current.getPage(pageNum);
      // Render at scale=1; CSS transform handles zoom (no re-render on zoom)
      const viewport = page.getViewport({ scale: 1.0, rotation: pageRotation });
      const canvas   = canvasRef.current;
      const ctx      = canvas.getContext('2d');

      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      setCanvasSize({ w: viewport.width, h: viewport.height });

      const task = page.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;
      await task.promise;

      // After render, center the canvas
      const container = containerRef.current;
      if (container) {
        const centered = centeredOffset(viewport.width, viewport.height, container.clientWidth, container.clientHeight, viewRef.current.scale);
        setView(prev => ({ ...prev, x: centered.x, y: centered.y }));
      }
    } catch (e) {
      if (e.name !== 'RenderingCancelledException') console.error(e);
    }
  }

  // ─────────────────────────────────────────────
  // THUMBNAIL GENERATION
  // ─────────────────────────────────────────────
  async function generateThumbs() {
    if (!pdfDocRef.current || thumbsGeneratedRef.current) return;
    thumbsGeneratedRef.current = true;
    const total = pdfDocRef.current.numPages;
    const results = [];
    for (let i = 1; i <= total; i++) {
      try {
        const page     = await pdfDocRef.current.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas   = document.createElement('canvas');
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        results.push({ page: i, dataUrl: canvas.toDataURL('image/jpeg', 0.7) });
        setThumbs([...results]);
      } catch {}
    }
  }

  // ─────────────────────────────────────────────
  // SEARCH
  // ─────────────────────────────────────────────
  async function runSearch(query) {
    if (!query.trim() || !pdfDocRef.current) { setSearchResults([]); return; }
    const results = [];
    for (let i = 1; i <= pdfDocRef.current.numPages; i++) {
      try {
        const page        = await pdfDocRef.current.getPage(i);
        const textContent = await page.getTextContent();
        const text        = textContent.items.map(item => item.str).join(' ');
        let idx = 0;
        const lower = text.toLowerCase();
        const q     = query.toLowerCase();
        while ((idx = lower.indexOf(q, idx)) !== -1) {
          results.push({ page: i, offset: idx, snippet: text.slice(Math.max(0, idx - 20), idx + q.length + 20) });
          idx += q.length;
        }
      } catch {}
    }
    setSearchResults(results);
    setSearchIdx(0);
    if (results.length > 0) setCurrentPage(results[0].page);
  }

  function navigateSearch(dir) {
    if (!searchResults.length) return;
    const next = (searchIdx + dir + searchResults.length) % searchResults.length;
    setSearchIdx(next);
    setCurrentPage(searchResults[next].page);
  }

  // ─────────────────────────────────────────────
  // DOWNLOAD
  // ─────────────────────────────────────────────
  async function handleDownload() {
    const result = await window.electronAPI.readFile(tab.filePath);
    if (result.error) return;
    const binary = atob(result.data);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = tab.name; a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────
  // BOOKMARKS
  // ─────────────────────────────────────────────
  function addBookmark() {
    if (bookmarks.find(b => b.page === currentPage)) return;
    setBookmarks(prev => [...prev, { page: currentPage }].sort((a, b) => a.page - b.page));
  }

  function removeBookmark(page) {
    setBookmarks(prev => prev.filter(b => b.page !== page));
  }

  // ─────────────────────────────────────────────
  // MINIMAP — shows current viewport position
  // ─────────────────────────────────────────────
  function Minimap() {
    const container = containerRef.current;
    if (!container || !canvasSize.w || view.scale <= 1.0) return null;

    const MMAP_W  = 120;
    const MMAP_H  = Math.round(MMAP_W * (canvasSize.h / canvasSize.w));
    const scaleX  = MMAP_W / (canvasSize.w * view.scale);
    const scaleY  = MMAP_H / (canvasSize.h * view.scale);
    const vpW     = Math.min(MMAP_W, container.clientWidth * scaleX);
    const vpH     = Math.min(MMAP_H, container.clientHeight * scaleY);
    const vpX     = Math.max(0, -view.x * scaleX);
    const vpY     = Math.max(0, -view.y * scaleY);
    const thumb   = thumbs[currentPage - 1];

    return (
      <div className="pdf-minimap" title="Minimap — shows your current view position">
        {thumb
          ? <img src={thumb.dataUrl} alt="minimap" style={{ width: MMAP_W, height: MMAP_H, display: 'block', objectFit: 'fill' }}/>
          : <div style={{ width: MMAP_W, height: MMAP_H, background: 'var(--bg-elevated)' }}/>
        }
        {/* Viewport indicator */}
        <div className="pdf-minimap-vp" style={{ left: vpX, top: vpY, width: vpW, height: vpH }}/>
      </div>
    );
  }

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Loading PDF…</span></div>;
  if (error)   return <div className="viewer-error"><p>Failed to load PDF</p><small>{error}</small></div>;

  const isBookmarked = bookmarks.find(b => b.page === currentPage);

  return (
    <div ref={wrapperRef} className={`viewer-wrapper pdf-viewer-root ${isFullscreen ? 'pdf-fullscreen' : ''}`}>

      {/* ── Reading progress bar ── */}
      <div className="pdf-progress-bar">
        <div className="pdf-progress-fill" style={{ width: `${progress}%` }}/>
      </div>

      {/* ── Toolbar ── */}
      <div className="pdf-toolbar">

        {/* Page navigation */}
        <button className="pdf-nav-btn" onClick={() => setCurrentPage(p => Math.max(1, p-1))} disabled={currentPage<=1} title="Previous page (← or K)">‹</button>
        <form onSubmit={e => { e.preventDefault(); const v = parseInt(gotoValue); if (v >= 1 && v <= numPages) setCurrentPage(v); setGotoValue(''); }}>
          <input
            className="pdf-page-input"
            value={gotoValue || currentPage}
            onChange={e => setGotoValue(e.target.value)}
            onFocus={() => setGotoValue(String(currentPage))}
            onBlur={() => setGotoValue('')}
            aria-label="Go to page" title="Go to page"
          />
        </form>
        <span className="pdf-page-info" title="Total pages">/ {numPages}</span>
        <button className="pdf-nav-btn" onClick={() => setCurrentPage(p => Math.min(numPages, p+1))} disabled={currentPage>=numPages} title="Next page (→ or J)">›</button>

        <div className="pdf-divider"/>

        {/* Zoom controls */}
        <button className="pdf-nav-btn" onClick={() => zoomOut()} title="Zoom out (Ctrl+-)">−</button>
        <span className="pdf-page-info">{Math.round(view.scale * 100)}%</span>
        <button className="pdf-nav-btn" onClick={() => zoomIn()} title="Zoom in (Ctrl++)">+</button>

        {/* Preset zoom dropdown */}
        <select
          className="pdf-zoom-select"
          value={PRESETS.includes(parseFloat(view.scale.toFixed(2))) ? view.scale : ''}
          onChange={e => applyScale(parseFloat(e.target.value))}
          title="Zoom preset"
          aria-label="Zoom preset"
        >
          {!PRESETS.includes(parseFloat(view.scale.toFixed(2))) && (
            <option value="" disabled>{Math.round(view.scale * 100)}%</option>
          )}
          {PRESETS.map(p => (
            <option key={p} value={p}>{Math.round(p * 100)}%</option>
          ))}
        </select>

        <button className="pdf-nav-btn" onClick={zoomReset} title="Reset zoom to 100% (Ctrl+0)">↺ 100%</button>

        <div className="pdf-divider"/>

        {/* Rotate */}
        <button className="pdf-nav-btn" onClick={() => setRotation(r => (r - 90 + 360) % 360)} title="Rotate counter-clockwise">⟲</button>
        <button className="pdf-nav-btn" onClick={() => setRotation(r => (r + 90) % 360)} title="Rotate clockwise">⟳</button>

        <div className="pdf-divider"/>

        {/* Search */}
        <button
          className={`pdf-nav-btn ${searchOpen ? 'pdf-btn-active' : ''}`}
          onClick={() => { setSearchOpen(s => !s); setTimeout(() => searchInputRef.current?.focus(), 50); }}
          title="Search (Ctrl+F)" aria-label="Open search"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>

        {/* Bookmark */}
        <button
          className={`pdf-nav-btn ${isBookmarked ? 'pdf-btn-active' : ''}`}
          onClick={addBookmark} title="Bookmark this page" aria-label="Add bookmark"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill={isBookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
        </button>
        {bookmarks.length > 0 && (
          <button className={`pdf-nav-btn ${showBookmarks ? 'pdf-btn-active' : ''}`} onClick={() => setShowBookmarks(s => !s)} title="Show bookmarks">{bookmarks.length}</button>
        )}

        {/* Thumbnails */}
        <button
          className={`pdf-nav-btn ${showThumbs ? 'pdf-btn-active' : ''}`}
          onClick={() => { setShowThumbs(s => !s); generateThumbs(); }}
          title="Thumbnail sidebar" aria-label="Toggle thumbnails"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        </button>

        {/* Minimap toggle */}
        {isZoomedIn && (
          <button
            className={`pdf-nav-btn ${showMinimap ? 'pdf-btn-active' : ''}`}
            onClick={() => { setShowMinimap(s => !s); if (!thumbsGeneratedRef.current) generateThumbs(); }}
            title="Toggle minimap" aria-label="Toggle minimap"
          >⊞</button>
        )}

        {/* File info */}
        <button className={`pdf-nav-btn ${showInfo ? 'pdf-btn-active' : ''}`} onClick={() => setShowInfo(s => !s)} title="File info" aria-label="File info">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </button>

        <div style={{ flex: 1 }}/>

        {/* Fullscreen */}
        <button className="pdf-nav-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'} aria-label="Toggle fullscreen">
          {isFullscreen
            ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"/></svg>
            : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
          }
        </button>

        {/* Download */}
        <button className="pdf-nav-btn" onClick={handleDownload} title="Download PDF" aria-label="Download">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>

      {/* ── Search bar ── */}
      {searchOpen && (
        <div className="pdf-search-bar">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref={searchInputRef}
            className="pdf-search-input"
            placeholder="Search in PDF…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.shiftKey ? navigateSearch(-1) : runSearch(searchQuery); }
              if (e.key === 'Escape') setSearchOpen(false);
            }}
            aria-label="Search in document"
          />
          <button className="pdf-nav-btn" onClick={() => runSearch(searchQuery)} title="Search">Go</button>
          {searchResults.length > 0 && (
            <>
              <span className="pdf-search-count">{searchIdx + 1} / {searchResults.length}</span>
              <button className="pdf-nav-btn" onClick={() => navigateSearch(-1)} title="Previous match (Shift+Enter)">‹</button>
              <button className="pdf-nav-btn" onClick={() => navigateSearch(1)} title="Next match (Enter)">›</button>
            </>
          )}
          {searchResults.length === 0 && searchQuery && (
            <span className="pdf-search-count" style={{ color: 'var(--red)' }}>No results</span>
          )}
          <button className="pdf-nav-btn" onClick={() => { setSearchOpen(false); setSearchResults([]); setSearchQuery(''); }} style={{ marginLeft: 'auto' }} title="Close search">✕</button>
        </div>
      )}

      {/* ── Body: sidebars + canvas ── */}
      <div className="pdf-viewer-body">

        {/* Thumbnail sidebar */}
        {showThumbs && (
          <div className="pdf-thumb-sidebar">
            {thumbs.length === 0 && <div className="pdf-thumb-loading"><div className="spinner"/></div>}
            {thumbs.map(t => (
              <div key={t.page} className={`pdf-thumb ${t.page === currentPage ? 'pdf-thumb-active' : ''}`} onClick={() => setCurrentPage(t.page)} title={`Page ${t.page}`}>
                <img src={t.dataUrl} alt={`Page ${t.page}`} className="pdf-thumb-img"/>
                <span className="pdf-thumb-num">{t.page}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bookmarks sidebar */}
        {showBookmarks && (
          <div className="pdf-bookmarks-sidebar">
            <div className="pdf-sidebar-header">Bookmarks</div>
            {bookmarks.map(b => (
              <div key={b.page} className={`pdf-bookmark-item ${b.page === currentPage ? 'pdf-bookmark-active' : ''}`}>
                <button className="pdf-bookmark-jump" onClick={() => setCurrentPage(b.page)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
                  Page {b.page}
                </button>
                <button className="pdf-bookmark-del" onClick={() => removeBookmark(b.page)} title="Remove bookmark">✕</button>
              </div>
            ))}
            {bookmarks.length === 0 && <p style={{fontSize:11,color:'var(--text-muted)',padding:'8px 12px'}}>No bookmarks yet</p>}
          </div>
        )}

        {/* File info panel */}
        {showInfo && fileInfo && (
          <div className="pdf-info-panel">
            <div className="pdf-sidebar-header">File Info</div>
            <div className="pdf-info-row"><span>Name</span><span>{fileInfo.name}</span></div>
            <div className="pdf-info-row"><span>Size</span><span>{formatBytes(fileInfo.size)}</span></div>
            <div className="pdf-info-row"><span>Type</span><span>PDF</span></div>
            <div className="pdf-info-row"><span>Pages</span><span>{numPages}</span></div>
            <div className="pdf-info-row"><span>Zoom</span><span>{Math.round(view.scale * 100)}%</span></div>
            <div className="pdf-info-row"><span>Rotation</span><span>{rotation}°</span></div>
          </div>
        )}

        {/* ── Canvas viewport ── */}
        <div
          ref={setContainerRef}
          className="pdf-canvas-area"
          onMouseDown={handleMouseDown}
          style={{ cursor: isPanning ? 'grabbing' : (isZoomedIn ? 'grab' : 'default'), userSelect: 'none' }}
        >
          {/* CSS transform: scale + translate. PDF is NOT re-rendered on zoom. */}
          <canvas
            ref={canvasRef}
            className="pdf-canvas"
            style={{
              position: 'absolute',
              top: 0, left: 0,
              transformOrigin: '0 0',
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transition: isPanning ? 'none' : 'transform 0.05s ease-out',
              willChange: 'transform',
              imageRendering: 'crisp-edges',
            }}
          />
        </div>

        {/* ── Minimap ── */}
        {showMinimap && isZoomedIn && <Minimap />}
      </div>
    </div>
  );
}

function formatBytes(b) {
  if (!b) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}
