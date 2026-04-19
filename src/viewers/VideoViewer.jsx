import React, { useEffect, useState, useRef } from 'react';

export default function VideoViewer({ tab }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Use file:// URI — Electron allows local file access with webSecurity:false
        const uri = await window.electronAPI.getFilePathUri(tab.filePath);
        if (!cancelled) {
          setSrc(uri);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tab.filePath]);

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Loading video…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to load video</p><small>{error}</small></div>;

  const ext = tab.ext.toLowerCase();
  // MKV/AVI may not be supported natively — show a notice
  const nativeSupported = ['mp4', 'webm', 'mov', 'ogg'].includes(ext);

  return (
    <div className="viewer-wrapper">
      <div className="media-container">
        {!nativeSupported && (
          <div className="media-compat-notice">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>.{ext.toUpperCase()} may have limited browser support. Playback depends on installed codecs.</span>
          </div>
        )}
        <video
          ref={videoRef}
          src={src}
          controls
          className="media-player media-video"
          onError={() => setError(`Cannot play this ${ext.toUpperCase()} file. Codec may not be supported.`)}
        >
          Your browser does not support this video format.
        </video>
        <div className="media-filename">{tab.name}</div>
      </div>
    </div>
  );
}
