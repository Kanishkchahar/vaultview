import React, { useEffect, useState, useRef } from 'react';

export default function AudioViewer({ tab }) {
  const [src, setSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const audioRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const uri = await window.electronAPI.getFilePathUri(tab.filePath);
        if (!cancelled) { setSrc(uri); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setError(e.message); setLoading(false); }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tab.filePath]);

  function formatTime(s) {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  function handleSeek(e) {
    const val = parseFloat(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = val;
    setCurrentTime(val);
  }

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play();
  }

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Loading audio…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to load audio</p><small>{error}</small></div>;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="viewer-wrapper">
      <div className="audio-container">
        <audio
          ref={audioRef}
          src={src}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
          onError={() => setError('Cannot play this audio file.')}
        />

        {/* Waveform decoration */}
        <div className="audio-waveform">
          {Array.from({ length: 48 }, (_, i) => {
            const h = Math.sin(i * 0.5) * 0.5 + Math.sin(i * 1.3) * 0.3 + Math.sin(i * 0.2) * 0.2;
            const heightPct = 15 + Math.abs(h) * 55;
            const filled = (i / 48) * 100 <= progress;
            return (
              <div
                key={i}
                className={`audio-bar ${filled ? 'audio-bar-filled' : ''}`}
                style={{ height: `${heightPct}%`, animationDelay: playing ? `${i * 0.04}s` : '0s' }}
              />
            );
          })}
        </div>

        <div className="audio-file-info">
          <div className="audio-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <div className="audio-filename">{tab.name}</div>
        </div>

        <div className="audio-controls">
          <div className="audio-seek-row">
            <span className="audio-time">{formatTime(currentTime)}</span>
            <input
              type="range"
              className="audio-seek"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
            />
            <span className="audio-time">{formatTime(duration)}</span>
          </div>
          <div className="audio-btn-row">
            <button className="audio-skip-btn" onClick={() => {
              if (audioRef.current) audioRef.current.currentTime = Math.max(0, currentTime - 10);
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="19 20 9 12 19 4 19 20"/><line x1="5" y1="19" x2="5" y2="5"/>
              </svg>
            </button>
            <button className="audio-play-btn" onClick={togglePlay}>
              {playing
                ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              }
            </button>
            <button className="audio-skip-btn" onClick={() => {
              if (audioRef.current) audioRef.current.currentTime = Math.min(duration, currentTime + 10);
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/>
              </svg>
            </button>
            <div className="audio-volume-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                {volume > 0.5 && <path d="M19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07"/>}
                {volume > 0 && volume <= 0.5 && <path d="M15.54 8.46a5 5 0 010 7.07"/>}
              </svg>
              <input
                type="range"
                className="audio-volume"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setVolume(v);
                  if (audioRef.current) audioRef.current.volume = v;
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
