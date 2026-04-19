import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import ViewerRouter from '../viewers/ViewerRouter.jsx';
import './Canvas2D.css';

let cardIdCounter = 0;
let elementIdCounter = 0;

const CARD_DEFAULT_W = 680;
const CARD_DEFAULT_H = 520;
const STORAGE_KEY = 'vaultview-canvas-scene';
const MIN_SHAPE_SIZE = 8;

const TOOLS = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'hand', label: 'Hand', key: 'H' },
  { id: 'rectangle', label: 'Rect', key: 'R' },
  { id: 'ellipse', label: 'Ellipse', key: 'O' },
  { id: 'diamond', label: 'Diamond', key: 'D' },
  { id: 'arrow', label: 'Arrow', key: 'A' },
  { id: 'line', label: 'Line', key: 'L' },
  { id: 'draw', label: 'Draw', key: 'P' },
  { id: 'text', label: 'Text', key: 'T' },
];

const DEFAULT_STYLE = {
  stroke: '#f0f0f0',
  fill: 'transparent',
  strokeWidth: 2,
  roughness: 1,
  fontSize: 22,
};

const FILL_SWATCHES = ['transparent', '#f0f0f0', '#e8c547', '#5c9ce0', '#5ce08a', '#e05c5c'];
const STROKE_SWATCHES = ['#f0f0f0', '#111111', '#e8c547', '#5c9ce0', '#5ce08a', '#e05c5c'];

function getViewerKey(ext) {
  const e = ext.toLowerCase();
  if (e === 'pdf') return 'pdf';
  if (['docx', 'rtf', 'odt'].includes(e)) return 'docx';
  if (e === 'pptx') return 'pptx';
  if (['xlsx', 'xls', 'csv'].includes(e)) return 'spreadsheet';
  if (['txt', 'md'].includes(e)) return 'text';
  if (['jpg','jpeg','png','gif','webp','svg'].includes(e)) return 'image';
  if (['mp4','avi','mkv','mov','webm'].includes(e)) return 'video';
  if (['mp3','wav','ogg','flac','aac'].includes(e)) return 'audio';
  if (['json','xml','yaml','yml'].includes(e)) return 'code';
  if (e === 'zip') return 'archive';
  if (e === 'epub') return 'epub';
  if (['html','htm'].includes(e)) return 'html';
  return 'unknown';
}

function makeElement(type, x, y, style) {
  return {
    id: ++elementIdCounter,
    type,
    x,
    y,
    w: 0,
    h: 0,
    points: [],
    text: '',
    ...style,
  };
}

function normalizeElement(el) {
  if (el.type === 'draw') return el;
  let { x, y, w, h } = el;
  if (w < 0) { x += w; w = Math.abs(w); }
  if (h < 0) { y += h; h = Math.abs(h); }
  return { ...el, x, y, w, h };
}

function getElementBounds(el) {
  if (el.type === 'draw') {
    const xs = el.points.map(p => p.x);
    const ys = el.points.map(p => p.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

function pointInElement(point, el) {
  const b = getElementBounds(el);
  const pad = Math.max(8, el.strokeWidth || 2);
  return point.x >= b.x - pad && point.x <= b.x + b.w + pad && point.y >= b.y - pad && point.y <= b.y + b.h + pad;
}

function getResizeHandle(point, el) {
  const b = getElementBounds(el);
  const handles = [
    { corner: 'nw', x: b.x - 5, y: b.y - 5 },
    { corner: 'ne', x: b.x + b.w + 5, y: b.y - 5 },
    { corner: 'se', x: b.x + b.w + 5, y: b.y + b.h + 5 },
    { corner: 'sw', x: b.x - 5, y: b.y + b.h + 5 },
  ];
  return handles.find(h => Math.abs(point.x - h.x) <= 10 && Math.abs(point.y - h.y) <= 10)?.corner || null;
}

function screenToWorld(e, board, viewport) {
  const rect = board.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left - viewport.x) / viewport.scale,
    y: (e.clientY - rect.top - viewport.y) / viewport.scale,
  };
}

function clientToBoard(e, board) {
  const rect = board.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function getCanvasCursorMode(e, board, viewport, tool, elements, selectedIds) {
  if (tool === 'hand') return 'grab';
  if (tool === 'text') return 'text';
  if (tool !== 'select') return 'crosshair';

  const point = screenToWorld(e, board, viewport);
  const selected = elements.find(el => selectedIds.includes(el.id));
  const handle = selected ? getResizeHandle(point, selected) : null;
  if (handle) return `${handle}-resize`;

  const hit = [...elements].reverse().find(el => pointInElement(point, el));
  if (!hit) return 'grab';
  if (hit.type === 'text') return 'text';
  return 'move';
}

export default function Canvas2D({ onClose }) {
  const [cards, setCards] = useState([]);
  const [elements, setElements] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [tool, setTool] = useState('select');
  const [style, setStyle] = useState(DEFAULT_STYLE);
  const [activeCard, setActiveCard] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [editingText, setEditingText] = useState(null);
  const [cursorMode, setCursorMode] = useState('grab');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const boardRef = useRef(null);
  const vpRef = useRef(viewport);
  const elementsRef = useRef(elements);
  const selectedRef = useRef(selectedIds);
  const actionRef = useRef(null);
  const dragCard = useRef(null);
  const isSpaceRef = useRef(false);

  useEffect(() => { vpRef.current = viewport; }, [viewport]);
  useEffect(() => { elementsRef.current = elements; }, [elements]);
  useEffect(() => { selectedRef.current = selectedIds; }, [selectedIds]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const selectedElement = selectedIds.length === 1 ? elements.find(el => el.id === selectedIds[0]) : null;

  const commitElements = useCallback((updater, options = {}) => {
    setElements(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!options.skipHistory && next !== prev) {
        setHistory(h => ({ past: [...h.past, prev].slice(-80), future: [] }));
      }
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    if (!history.past.length) return;
    const previous = history.past[history.past.length - 1];
    setHistory(h => ({ past: h.past.slice(0, -1), future: [elementsRef.current, ...h.future].slice(0, 80) }));
    setElements(previous);
    setSelectedIds([]);
  }, [history.past.length]);

  const redo = useCallback(() => {
    if (!history.future.length) return;
    const next = history.future[0];
    setHistory(h => ({ past: [...h.past, elementsRef.current].slice(-80), future: h.future.slice(1) }));
    setElements(next);
    setSelectedIds([]);
  }, [history.future.length]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.elements) {
        setElements(saved.elements);
        const maxId = Math.max(0, ...saved.elements.map(el => Number(el.id) || 0));
        elementIdCounter = Math.max(elementIdCounter, maxId);
      }
      if (saved?.viewport) setViewport(saved.viewport);
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ elements, viewport })); } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [elements, viewport]);

  useEffect(() => {
    const onKeyDown = (e) => {
      const editing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target?.isContentEditable;
      if (e.code === 'Space' && !editing) {
        isSpaceRef.current = true;
        e.preventDefault();
        return;
      }
      if (editing) return;

      const nextTool = TOOLS.find(t => t.key.toLowerCase() === e.key.toLowerCase());
      if (nextTool) {
        setTool(nextTool.id);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedRef.current.length) {
        e.preventDefault();
        deleteSelected();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && selectedRef.current.length) {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (e.key === 'Escape') {
        setSelectedIds([]);
        setEditingText(null);
        setTool('select');
      }
    };
    const onKeyUp = (e) => { if (e.code === 'Space') isSpaceRef.current = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [undo, redo]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const mouse = clientToBoard(e, el);
      const delta = e.deltaY < 0 ? 1.08 : 0.92;
      setViewport(prev => {
        const scale = Math.min(4, Math.max(0.1, prev.scale * delta));
        const worldX = (mouse.x - prev.x) / prev.scale;
        const worldY = (mouse.y - prev.y) / prev.scale;
        return { scale, x: mouse.x - worldX * scale, y: mouse.y - worldY * scale };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  async function openFile() {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.openFileDialog();
    if (result) addCard(result.filePath);
  }

  function addCard(filePath, x, y) {
    const ext = filePath.split('.').pop().toLowerCase();
    const name = filePath.split(/[\\/]/).pop();
    const id = ++cardIdCounter;
    const vp = vpRef.current;
    const brd = boardRef.current?.getBoundingClientRect() || { width: 1200, height: 800 };
    const worldX = x ?? (brd.width / 2 - vp.x) / vp.scale - CARD_DEFAULT_W / 2;
    const worldY = y ?? (brd.height / 2 - vp.y) / vp.scale - CARD_DEFAULT_H / 2;
    const newCard = {
      id, filePath, name, ext, viewerKey: getViewerKey(ext),
      x: worldX, y: worldY, w: CARD_DEFAULT_W, h: CARD_DEFAULT_H, minimized: false,
    };
    setCards(prev => [...prev, newCard]);
    setActiveCard(id);
  }

  function deleteSelected() {
    const ids = new Set(selectedRef.current);
    commitElements(prev => prev.filter(el => !ids.has(el.id)));
    setSelectedIds([]);
  }

  function duplicateSelected() {
    const ids = new Set(selectedRef.current);
    const copies = elementsRef.current
      .filter(el => ids.has(el.id))
      .map(el => ({ ...el, id: ++elementIdCounter, x: el.x + 24, y: el.y + 24, points: el.points?.map(p => ({ x: p.x + 24, y: p.y + 24 })) || [] }));
    if (!copies.length) return;
    commitElements(prev => [...prev, ...copies]);
    setSelectedIds(copies.map(el => el.id));
  }

  function bringToFront() {
    const ids = new Set(selectedRef.current);
    if (!ids.size) return;
    commitElements(prev => [...prev.filter(el => !ids.has(el.id)), ...prev.filter(el => ids.has(el.id))]);
  }

  function sendToBack() {
    const ids = new Set(selectedRef.current);
    if (!ids.size) return;
    commitElements(prev => [...prev.filter(el => ids.has(el.id)), ...prev.filter(el => !ids.has(el.id))]);
  }

  function exportScene() {
    const blob = new Blob([JSON.stringify({ elements, viewport }, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'vaultview-canvas.json');
  }

  function importScene(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const scene = JSON.parse(String(reader.result));
        if (Array.isArray(scene.elements)) {
          commitElements(scene.elements);
          if (scene.viewport) setViewport(scene.viewport);
          elementIdCounter = Math.max(elementIdCounter, ...scene.elements.map(el => Number(el.id) || 0));
        }
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function clearScene() {
    commitElements([]);
    setSelectedIds([]);
  }

  function newBlankCanvas() {
    commitElements([]);
    setCards([]);
    setSelectedIds([]);
    setActiveCard(null);
    setEditingText(null);
    setViewport({ x: 0, y: 0, scale: 1 });
    setTool('select');
  }

  function minimizeWindow() {
    window.electronAPI?.windowMinimize?.();
  }

  function toggleMaximize() {
    if (window.electronAPI?.windowMaximize) {
      window.electronAPI.windowMaximize();
      return;
    }
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  }

  function closeApp() {
    window.electronAPI?.windowClose?.();
  }

  function exportPng() {
    const bounds = getSceneBounds(elements);
    const padding = 40;
    const width = Math.max(800, Math.ceil(bounds.w + padding * 2));
    const height = Math.max(600, Math.ceil(bounds.h + padding * 2));
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.fillStyle = '#101216';
    ctx.fillRect(0, 0, width, height);
    ctx.translate(padding - bounds.x, padding - bounds.y);
    elements.forEach(el => drawCanvasElement(ctx, el));
    canvas.toBlob(blob => blob && downloadBlob(blob, 'vaultview-canvas.png'), 'image/png');
  }

  const handleBoardMouseDown = useCallback((e) => {
    if (e.button !== 0 && e.button !== 1) return;
    const board = boardRef.current;
    if (!board) return;
    const world = screenToWorld(e, board, vpRef.current);
    const selected = elementsRef.current.find(el => selectedRef.current.includes(el.id));
    const handle = selected ? getResizeHandle(world, selected) : null;
    const hit = [...elementsRef.current].reverse().find(el => pointInElement(world, el));
    const useHand = tool === 'hand' || e.button === 1 || isSpaceRef.current || (tool === 'select' && !handle && !hit && !e.shiftKey);

    if (useHand) {
      e.preventDefault();
      setIsPanning(true);
      setCursorMode('grabbing');
      actionRef.current = { type: 'pan', x: e.clientX - vpRef.current.x, y: e.clientY - vpRef.current.y };
      return;
    }

    if (tool === 'select') {
      if (selected && handle) {
        actionRef.current = {
          type: 'resize',
          id: selected.id,
          corner: handle,
          start: world,
          before: elementsRef.current,
        };
        return;
      }

      if (hit) {
        if (e.shiftKey) {
          setSelectedIds(prev => prev.includes(hit.id) ? prev.filter(id => id !== hit.id) : [...prev, hit.id]);
        } else if (!selectedRef.current.includes(hit.id)) {
          setSelectedIds([hit.id]);
        }
        actionRef.current = {
          type: 'move',
          start: world,
          before: elementsRef.current,
          ids: selectedRef.current.includes(hit.id) ? selectedRef.current : [hit.id],
        };
      } else {
        setSelectedIds([]);
        actionRef.current = { type: 'marquee', start: world, current: world };
      }
      return;
    }

    if (tool === 'text') {
      const id = ++elementIdCounter;
      const textEl = { ...makeElement('text', world.x, world.y, style), id, w: 220, h: style.fontSize * 1.6, text: '' };
      commitElements(prev => [...prev, textEl]);
      setSelectedIds([id]);
      setEditingText({ id, x: world.x, y: world.y, value: '' });
      setTool('select');
      return;
    }

    const element = makeElement(tool, world.x, world.y, style);
    if (tool === 'draw') element.points = [world];
    commitElements(prev => [...prev, element]);
    setSelectedIds([element.id]);
    actionRef.current = { type: 'draw-shape', id: element.id, start: world };
  }, [tool, style, commitElements]);

  const handleBoardMouseMove = useCallback((e) => {
    const action = actionRef.current;
    const board = boardRef.current;
    if (!board) return;
    if (!action) {
      setCursorMode(getCanvasCursorMode(e, board, vpRef.current, tool, elementsRef.current, selectedRef.current));
      return;
    }
    if (action.type === 'pan') {
      setViewport(prev => ({ ...prev, x: e.clientX - action.x, y: e.clientY - action.y }));
      setCursorMode('grabbing');
      return;
    }

    const world = screenToWorld(e, board, vpRef.current);
    if (action.type === 'move') {
      const dx = world.x - action.start.x;
      const dy = world.y - action.start.y;
      const ids = new Set(action.ids);
      setElements(action.before.map(el => {
        if (!ids.has(el.id)) return el;
        return {
          ...el,
          x: el.x + dx,
          y: el.y + dy,
          points: el.points?.map(p => ({ x: p.x + dx, y: p.y + dy })) || [],
        };
      }));
      return;
    }

    if (action.type === 'resize') {
      const dx = world.x - action.start.x;
      const dy = world.y - action.start.y;
      setElements(action.before.map(el => el.id === action.id ? resizeElement(el, action.corner, dx, dy) : el));
      return;
    }

    if (action.type === 'marquee') {
      action.current = world;
      const box = normalizeElement({ x: action.start.x, y: action.start.y, w: world.x - action.start.x, h: world.y - action.start.y });
      setSelectedIds(elementsRef.current.filter(el => boundsIntersect(box, getElementBounds(el))).map(el => el.id));
      return;
    }

    if (action.type === 'draw-shape') {
      setElements(prev => prev.map(el => {
        if (el.id !== action.id) return el;
        if (el.type === 'draw') return { ...el, points: [...el.points, world] };
        return { ...el, w: world.x - action.start.x, h: world.y - action.start.y };
      }));
    }
  }, []);

  const handleBoardMouseUp = useCallback(() => {
    const action = actionRef.current;
    if (action?.type === 'move') {
      setHistory(h => ({ past: [...h.past, action.before].slice(-80), future: [] }));
    }
    if (action?.type === 'resize') {
      setHistory(h => ({ past: [...h.past, action.before].slice(-80), future: [] }));
    }
    if (action?.type === 'draw-shape') {
      commitElements(prev => prev.map(el => el.id === action.id ? normalizeElement(el) : el).filter(el => {
        if (el.type === 'draw') return el.points.length > 1;
        return el.type === 'text' || Math.abs(el.w) >= MIN_SHAPE_SIZE || Math.abs(el.h) >= MIN_SHAPE_SIZE;
      }), { skipHistory: true });
    }
    setIsPanning(false);
    actionRef.current = null;
    if (tool === 'select' || tool === 'hand') setCursorMode('grab');
  }, [commitElements]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    const vp = vpRef.current;
    Array.from(e.dataTransfer.files).forEach((file, i) => {
      if (!file.path) return;
      const x = (e.clientX - rect.left - vp.x) / vp.scale + i * 24;
      const y = (e.clientY - rect.top - vp.y) / vp.scale + i * 24;
      addCard(file.path, x, y);
    });
  }, []);

  function updateSelectedStyle(patch) {
    setStyle(prev => ({ ...prev, ...patch }));
    const ids = new Set(selectedRef.current);
    if (ids.size) commitElements(prev => prev.map(el => ids.has(el.id) ? { ...el, ...patch } : el));
  }

  function finishTextEdit(value) {
    const edit = editingText;
    if (!edit) return;
    const text = value.trim();
    commitElements(prev => text
      ? prev.map(el => el.id === edit.id ? { ...el, text, w: Math.max(160, text.length * (el.fontSize * 0.55)), h: el.fontSize * 1.6 } : el)
      : prev.filter(el => el.id !== edit.id)
    );
    setEditingText(null);
  }

  function resetView() {
    setViewport({ x: 0, y: 0, scale: 1 });
  }

  const marquee = actionRef.current?.type === 'marquee' ? actionRef.current : null;
  const marqueeBox = marquee ? normalizeElement({
    x: marquee.start.x,
    y: marquee.start.y,
    w: marquee.current.x - marquee.start.x,
    h: marquee.current.y - marquee.start.y,
  }) : null;

  const cursorClass = useMemo(() => {
    if (isPanning) return 'is-grabbing';
    if (tool === 'hand') return 'is-hand';
    if (tool === 'select') return `is-${cursorMode}`;
    if (tool === 'text') return 'is-text';
    return 'is-crosshair';
  }, [tool, isPanning, cursorMode]);

  return (
    <div className="canvas2d-root">
      <div className="canvas2d-toolbar">
        <div className="c2d-window-controls">
          <button className="c2d-window-dot c2d-window-dot-exit" onClick={onClose} title="Exit canvas"/>
          <button className="c2d-window-dot c2d-window-dot-min" onClick={minimizeWindow} title="Minimize"/>
          <button className="c2d-window-dot c2d-window-dot-max" onClick={toggleMaximize} title="Maximize"/>
          <button className="c2d-window-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{isFullscreen ? '⤢' : '⛶'}</button>
          <button className="c2d-window-btn c2d-window-btn-danger" onClick={closeApp} title="Close app">Close</button>
        </div>
        <button className="c2d-btn c2d-btn-primary" onClick={newBlankCanvas} title="New blank canvas">New</button>
        <div className="c2d-divider"/>
        <SegmentedTools tool={tool} setTool={setTool} />
        <div className="c2d-divider"/>
        <StyleControls style={selectedElement || style} onChange={updateSelectedStyle} />
        <div className="c2d-divider"/>
        <button className="c2d-btn" onClick={openFile} title="Place file card">File</button>
        <button className="c2d-btn" onClick={undo} disabled={!history.past.length} title="Undo">Undo</button>
        <button className="c2d-btn" onClick={redo} disabled={!history.future.length} title="Redo">Redo</button>
        <button className="c2d-btn" onClick={duplicateSelected} disabled={!selectedIds.length} title="Duplicate selected">Duplicate</button>
        <button className="c2d-btn" onClick={deleteSelected} disabled={!selectedIds.length} title="Delete selected">Delete</button>
        <button className="c2d-btn" onClick={bringToFront} disabled={!selectedIds.length} title="Bring selected to front">Front</button>
        <button className="c2d-btn" onClick={sendToBack} disabled={!selectedIds.length} title="Send selected to back">Back</button>
        <div style={{ flex: 1 }}/>
        <span className="c2d-zoom-label">{Math.round(viewport.scale * 100)}%</span>
        <button className="c2d-btn" onClick={() => setViewport(p => ({ ...p, scale: Math.min(4, p.scale * 1.2) }))}>+</button>
        <button className="c2d-btn" onClick={() => setViewport(p => ({ ...p, scale: Math.max(0.1, p.scale * 0.8) }))}>-</button>
        <button className="c2d-btn" onClick={resetView} title="Reset view">Reset</button>
        <button className="c2d-btn" onClick={exportPng} title="Export PNG">PNG</button>
        <button className="c2d-btn" onClick={exportScene} title="Export scene JSON">JSON</button>
        <label className="c2d-btn c2d-file-btn" title="Import scene JSON">
          Import
          <input type="file" accept="application/json,.json" onChange={importScene}/>
        </label>
        <button className="c2d-btn" onClick={clearScene} title="Clear drawing">Clear</button>
        <button className="c2d-btn c2d-btn-close" onClick={onClose} title="Exit canvas mode">Exit</button>
      </div>

      <div
        ref={boardRef}
        className={`canvas2d-board ${cursorClass}`}
        onMouseDown={handleBoardMouseDown}
        onMouseMove={handleBoardMouseMove}
        onMouseUp={handleBoardMouseUp}
        onMouseLeave={handleBoardMouseUp}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        <Grid viewport={viewport} />
        <svg className="canvas2d-drawing-layer" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
          {elements.map(el => (
            <ShapeElement key={el.id} element={el} selected={selectedIds.includes(el.id)} />
          ))}
          {marqueeBox && <rect className="c2d-marquee" x={marqueeBox.x} y={marqueeBox.y} width={marqueeBox.w} height={marqueeBox.h}/>}
        </svg>

        <div className="canvas2d-world" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
          {cards.map(card => (
            <CanvasCard
              key={card.id}
              card={card}
              isActive={card.id === activeCard}
              onMouseDown={() => bringCardToFront(card.id)}
              onDragHeader={(e) => startCardDrag(e, card.id, cards, setCards, setActiveCard, dragCard, vpRef)}
              onClose={() => closeCard(card.id, setCards, setActiveCard)}
              onMinimize={() => setCards(prev => prev.map(c => c.id === card.id ? { ...c, minimized: !c.minimized } : c))}
              onResize={(e) => startCardResize(e, card.id, cards, setCards, vpRef)}
            />
          ))}
        </div>

        {editingText && (
          <textarea
            className="c2d-text-editor"
            autoFocus
            defaultValue={editingText.value}
            style={{
              left: viewport.x + editingText.x * viewport.scale,
              top: viewport.y + editingText.y * viewport.scale,
              fontSize: `${style.fontSize * viewport.scale}px`,
              color: style.stroke,
            }}
            onBlur={e => finishTextEdit(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finishTextEdit(e.currentTarget.value);
              if (e.key === 'Escape') finishTextEdit('');
            }}
          />
        )}

        {cards.length === 0 && elements.length === 0 && (
          <div className="canvas2d-empty">
            <button className="canvas2d-empty-icon" onClick={newBlankCanvas} title="New blank canvas">+</button>
            <p>Draw, type, connect ideas, or drop files onto the canvas.</p>
            <p className="canvas2d-empty-sub">Drag empty space to pan · Ctrl+Scroll zooms · V/R/O/A/L/P/T switch tools</p>
          </div>
        )}
      </div>
    </div>
  );

  function bringCardToFront(id) {
    setActiveCard(id);
    setCards(prev => {
      const card = prev.find(c => c.id === id);
      return card ? [...prev.filter(c => c.id !== id), card] : prev;
    });
  }
}

function SegmentedTools({ tool, setTool }) {
  return (
    <div className="c2d-tool-group">
      {TOOLS.map(t => (
        <button
          key={t.id}
          className={`c2d-tool ${tool === t.id ? 'active' : ''}`}
          onClick={() => setTool(t.id)}
          title={`${t.label} (${t.key})`}
        >
          {toolIcon(t.id)}
        </button>
      ))}
    </div>
  );
}

function StyleControls({ style, onChange }) {
  return (
    <div className="c2d-style-controls">
      <div className="c2d-swatches" title="Stroke color">
        {STROKE_SWATCHES.map(c => <button key={c} className="c2d-swatch" style={{ background: c }} onClick={() => onChange({ stroke: c })}/>)}
      </div>
      <div className="c2d-swatches" title="Fill color">
        {FILL_SWATCHES.map(c => <button key={c} className={`c2d-swatch ${c === 'transparent' ? 'transparent' : ''}`} style={{ background: c }} onClick={() => onChange({ fill: c })}/>)}
      </div>
      <input title="Stroke width" type="range" min="1" max="8" value={style.strokeWidth || 2} onChange={e => onChange({ strokeWidth: Number(e.target.value) })}/>
      <input title="Font size" type="number" min="10" max="72" value={style.fontSize || 22} onChange={e => onChange({ fontSize: Number(e.target.value) || 22 })}/>
    </div>
  );
}

function Grid({ viewport }) {
  return (
    <svg className="canvas2d-grid">
      <defs>
        <pattern id="smallgrid" width={20 * viewport.scale} height={20 * viewport.scale}
          x={viewport.x % (20 * viewport.scale)} y={viewport.y % (20 * viewport.scale)} patternUnits="userSpaceOnUse">
          <path d={`M ${20 * viewport.scale} 0 L 0 0 0 ${20 * viewport.scale}`} fill="none" stroke="#1e232b" strokeWidth="0.5"/>
        </pattern>
        <pattern id="biggrid" width={100 * viewport.scale} height={100 * viewport.scale}
          x={viewport.x % (100 * viewport.scale)} y={viewport.y % (100 * viewport.scale)} patternUnits="userSpaceOnUse">
          <rect width={100 * viewport.scale} height={100 * viewport.scale} fill="url(#smallgrid)"/>
          <path d={`M ${100 * viewport.scale} 0 L 0 0 0 ${100 * viewport.scale}`} fill="none" stroke="#252b35" strokeWidth="1"/>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#biggrid)"/>
    </svg>
  );
}

function ShapeElement({ element, selected }) {
  const el = normalizeElement(element);
  const common = {
    stroke: el.stroke,
    fill: el.fill,
    strokeWidth: el.strokeWidth,
    vectorEffect: 'non-scaling-stroke',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };

  return (
    <g className="c2d-element">
      {el.type === 'rectangle' && <rect {...common} x={el.x} y={el.y} width={el.w} height={el.h} rx="8"/>}
      {el.type === 'ellipse' && <ellipse {...common} cx={el.x + el.w / 2} cy={el.y + el.h / 2} rx={Math.abs(el.w / 2)} ry={Math.abs(el.h / 2)}/>}
      {el.type === 'diamond' && <polygon {...common} points={`${el.x + el.w / 2},${el.y} ${el.x + el.w},${el.y + el.h / 2} ${el.x + el.w / 2},${el.y + el.h} ${el.x},${el.y + el.h / 2}`}/>}
      {el.type === 'line' && <line {...common} fill="none" x1={element.x} y1={element.y} x2={element.x + element.w} y2={element.y + element.h}/>}
      {el.type === 'arrow' && <Arrow element={element} common={common}/>}
      {el.type === 'draw' && <polyline {...common} fill="none" points={el.points.map(p => `${p.x},${p.y}`).join(' ')}/>}
      {el.type === 'text' && (
        <text x={el.x} y={el.y + el.fontSize} fill={el.stroke} fontSize={el.fontSize} fontFamily="Inter, Arial, sans-serif">
          {el.text}
        </text>
      )}
      {selected && <SelectionBox bounds={getElementBounds(el)} />}
    </g>
  );
}

function Arrow({ element, common }) {
  const x1 = element.x;
  const y1 = element.y;
  const x2 = element.x + element.w;
  const y2 = element.y + element.h;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = 12;
  const p1 = `${x2 - size * Math.cos(angle - Math.PI / 6)},${y2 - size * Math.sin(angle - Math.PI / 6)}`;
  const p2 = `${x2},${y2}`;
  const p3 = `${x2 - size * Math.cos(angle + Math.PI / 6)},${y2 - size * Math.sin(angle + Math.PI / 6)}`;
  return (
    <>
      <line {...common} fill="none" x1={x1} y1={y1} x2={x2} y2={y2}/>
      <polyline {...common} fill="none" points={`${p1} ${p2} ${p3}`}/>
    </>
  );
}

function SelectionBox({ bounds }) {
  return (
    <g>
      <rect className="c2d-selection-box" x={bounds.x - 5} y={bounds.y - 5} width={bounds.w + 10} height={bounds.h + 10}/>
      {[
        [bounds.x - 5, bounds.y - 5],
        [bounds.x + bounds.w + 5, bounds.y - 5],
        [bounds.x + bounds.w + 5, bounds.y + bounds.h + 5],
        [bounds.x - 5, bounds.y + bounds.h + 5],
      ].map(([x, y], i) => <rect key={i} className="c2d-selection-handle" x={x - 4} y={y - 4} width="8" height="8" rx="2"/>)}
    </g>
  );
}

function CanvasCard({ card, isActive, onMouseDown, onDragHeader, onClose, onMinimize, onResize }) {
  return (
    <div
      className={`canvas-card ${isActive ? 'canvas-card-active' : ''} ${card.minimized ? 'canvas-card-minimized' : ''}`}
      style={{ left: card.x, top: card.y, width: card.w, height: card.minimized ? 'auto' : card.h }}
      onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e); }}
    >
      <div className="canvas-card-header" onMouseDown={onDragHeader}>
        <span className="canvas-card-icon">{getFileIcon(card.ext)}</span>
        <span className="canvas-card-title" title={card.filePath}>{card.name}</span>
        <div className="canvas-card-actions">
          <button className="canvas-card-btn" onClick={(e) => { e.stopPropagation(); onMinimize(); }} title={card.minimized ? 'Restore' : 'Minimize'}>{card.minimized ? '+' : '-'}</button>
          <button className="canvas-card-btn canvas-card-btn-close" onClick={(e) => { e.stopPropagation(); onClose(); }} title="Close">x</button>
        </div>
      </div>
      {!card.minimized && <div className="canvas-card-body"><ViewerRouter tab={card} /></div>}
      {!card.minimized && <div className="canvas-card-resize" onMouseDown={onResize}/>}
    </div>
  );
}

function startCardDrag(e, id, cards, setCards, setActiveCard, dragCard, vpRef) {
  if (e.button !== 0) return;
  e.stopPropagation();
  setActiveCard(id);
  const card = cards.find(c => c.id === id);
  if (!card) return;
  dragCard.current = { id, startMouseX: e.clientX, startMouseY: e.clientY, startCardX: card.x, startCardY: card.y, scale: vpRef.current.scale };
  const onMove = (e2) => {
    if (!dragCard.current) return;
    const { startMouseX, startMouseY, startCardX, startCardY, scale } = dragCard.current;
    setCards(prev => prev.map(c => c.id === id ? { ...c, x: startCardX + (e2.clientX - startMouseX) / scale, y: startCardY + (e2.clientY - startMouseY) / scale } : c));
  };
  const onUp = () => {
    dragCard.current = null;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function startCardResize(e, id, cards, setCards, vpRef) {
  e.stopPropagation();
  e.preventDefault();
  const card = cards.find(c => c.id === id);
  if (!card) return;
  const scale = vpRef.current.scale;
  const startX = e.clientX;
  const startY = e.clientY;
  const startW = card.w;
  const startH = card.h;
  const onMove = (e2) => {
    setCards(prev => prev.map(c => c.id === id
      ? { ...c, w: Math.max(320, startW + (e2.clientX - startX) / scale), h: Math.max(240, startH + (e2.clientY - startY) / scale) }
      : c
    ));
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function closeCard(id, setCards, setActiveCard) {
  setCards(prev => prev.filter(c => c.id !== id));
  setActiveCard(prev => prev === id ? null : prev);
}

function boundsIntersect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function resizeElement(el, corner, dx, dy) {
  if (el.type === 'draw') {
    const b = getElementBounds(el);
    const next = resizeBox(b, corner, dx, dy);
    const sx = b.w === 0 ? 1 : next.w / b.w;
    const sy = b.h === 0 ? 1 : next.h / b.h;
    return {
      ...el,
      points: el.points.map(p => ({ x: next.x + (p.x - b.x) * sx, y: next.y + (p.y - b.y) * sy })),
    };
  }

  const next = resizeBox({ x: el.x, y: el.y, w: el.w, h: el.h }, corner, dx, dy);
  return { ...el, ...next };
}

function resizeBox(box, corner, dx, dy) {
  let { x, y, w, h } = box;
  if (corner.includes('n')) { y += dy; h -= dy; }
  if (corner.includes('s')) h += dy;
  if (corner.includes('w')) { x += dx; w -= dx; }
  if (corner.includes('e')) w += dx;
  return normalizeElement({ x, y, w, h });
}

function getSceneBounds(elements) {
  if (!elements.length) return { x: 0, y: 0, w: 800, h: 600 };
  const bounds = elements.map(getElementBounds);
  const minX = Math.min(...bounds.map(b => b.x));
  const minY = Math.min(...bounds.map(b => b.y));
  const maxX = Math.max(...bounds.map(b => b.x + b.w));
  const maxY = Math.max(...bounds.map(b => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function drawCanvasElement(ctx, element) {
  const el = normalizeElement(element);
  ctx.save();
  ctx.strokeStyle = el.stroke;
  ctx.fillStyle = el.fill === 'transparent' ? 'rgba(0,0,0,0)' : el.fill;
  ctx.lineWidth = el.strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (el.type === 'rectangle') roundedRect(ctx, el.x, el.y, el.w, el.h, 8);
  if (el.type === 'ellipse') { ctx.beginPath(); ctx.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  if (el.type === 'diamond') { ctx.beginPath(); ctx.moveTo(el.x + el.w / 2, el.y); ctx.lineTo(el.x + el.w, el.y + el.h / 2); ctx.lineTo(el.x + el.w / 2, el.y + el.h); ctx.lineTo(el.x, el.y + el.h / 2); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  if (el.type === 'line' || el.type === 'arrow') { ctx.beginPath(); ctx.moveTo(element.x, element.y); ctx.lineTo(element.x + element.w, element.y + element.h); ctx.stroke(); }
  if (el.type === 'draw') { ctx.beginPath(); el.points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); }
  if (el.type === 'text') { ctx.font = `${el.fontSize}px Arial`; ctx.fillStyle = el.stroke; ctx.fillText(el.text, el.x, el.y + el.fontSize); }
  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect?.(x, y, w, h, r);
  if (!ctx.roundRect) ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.stroke();
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function toolIcon(id) {
  return {
    select: 'V',
    hand: 'H',
    rectangle: '□',
    ellipse: '○',
    diamond: '◇',
    arrow: '→',
    line: '/',
    draw: '✎',
    text: 'T',
  }[id];
}

function getFileIcon(ext) {
  const e = (ext || '').toLowerCase();
  if (e === 'pdf') return 'PDF';
  if (['docx','doc','rtf','odt'].includes(e)) return 'DOC';
  if (['pptx','ppt'].includes(e)) return 'PPT';
  if (['xlsx','xls','csv'].includes(e)) return 'XLS';
  if (['txt','md'].includes(e)) return 'TXT';
  if (['jpg','jpeg','png','gif','webp','svg'].includes(e)) return 'IMG';
  if (['mp4','avi','mkv','mov'].includes(e)) return 'VID';
  if (['mp3','wav','flac'].includes(e)) return 'AUD';
  if (['json','xml','yaml','yml'].includes(e)) return '{}';
  if (e === 'zip') return 'ZIP';
  if (e === 'epub') return 'EPUB';
  if (['html','htm'].includes(e)) return 'WEB';
  return 'FILE';
}
