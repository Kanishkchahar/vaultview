import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useZoom — attach Ctrl+Scroll and Ctrl+[+/-/0] to the whole window,
 * applying zoom only when the mouse is over (or focus is inside) the container.
 * The key fix: effects run once on mount, read containerRef.current at event time.
 */
export default function useZoom(containerRef, { min = 0.4, max = 4, step = 0.1, initial = 1 } = {}) {
  const [zoom, setZoom] = useState(initial);

  const clamp = (v) => parseFloat(Math.min(max, Math.max(min, v)).toFixed(2));

  // Ctrl + Mouse Wheel
  useEffect(() => {
    const onWheel = (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault(); // always block Electron native zoom

      // Apply only if scroll is inside our container
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(e.target) && !el.isSameNode(e.target)) return;

      const delta = e.deltaY < 0 ? step : -step;
      setZoom(prev => clamp(prev + delta));
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, []); // run once — reads ref.current at event time, always fresh

  // Ctrl + = / - / 0
  useEffect(() => {
    const onKey = (e) => {
      if (!e.ctrlKey) return;
      if (!['=', '+', '-', '0'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === '=' || e.key === '+') setZoom(prev => clamp(prev + step));
      else if (e.key === '-') setZoom(prev => clamp(prev - step));
      else if (e.key === '0') setZoom(initial);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // run once

  return [zoom, setZoom];
}
