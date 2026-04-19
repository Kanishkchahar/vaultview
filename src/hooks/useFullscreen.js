import { useState, useEffect, useCallback } from 'react';

export default function useFullscreen(ref) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const enter = useCallback(() => {
    const el = ref?.current || document.documentElement;
    el.requestFullscreen?.();
  }, [ref]);

  const exit = useCallback(() => {
    document.exitFullscreen?.();
  }, []);

  const toggle = useCallback(() => {
    isFullscreen ? exit() : enter();
  }, [isFullscreen, enter, exit]);

  // Escape key exits
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isFullscreen) exit(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, exit]);

  return { isFullscreen, toggle, enter, exit };
}
