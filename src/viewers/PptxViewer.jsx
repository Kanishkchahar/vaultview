import React, { useEffect, useState } from 'react';

export default function PptxViewer({ tab }) {
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const result = await window.electronAPI.readFile(tab.filePath);
        if (result.error) throw new Error(result.error);

        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        // Parse the PPTX zip manually for slide text.
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(bytes.buffer);

        const slideFiles = Object.keys(zip.files)
          .filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/))
          .sort((a, b) => {
            const na = parseInt(a.match(/\d+/)[0]);
            const nb = parseInt(b.match(/\d+/)[0]);
            return na - nb;
          });

        const slideData = await Promise.all(slideFiles.map(async (name, i) => {
          const xmlStr = await zip.files[name].async('string');
          const parser = new DOMParser();
          const doc = parser.parseFromString(xmlStr, 'application/xml');

          // Extract text runs
          const textElements = doc.querySelectorAll('t');
          const texts = [];
          textElements.forEach(el => {
            const t = el.textContent.trim();
            if (t) texts.push(t);
          });

          // Try to get title (first sp with idx=0 or title placeholder)
          const title = texts[0] || `Slide ${i + 1}`;
          const body = texts.slice(1);

          return { index: i, title, body, rawTexts: texts };
        }));

        if (!cancelled) {
          setSlides(slideData);
          setActiveSlide(0);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tab.filePath]);

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Parsing presentation…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to load presentation</p><small>{error}</small></div>;
  if (slides.length === 0) return <div className="viewer-error"><p>No slides found</p></div>;

  const slide = slides[activeSlide];

  return (
    <div className="viewer-wrapper pptx-viewer">
      <div className="pptx-nav">
        {slides.map((s, i) => (
          <button
            key={i}
            className={`pptx-thumb ${i === activeSlide ? 'pptx-thumb-active' : ''}`}
            onClick={() => setActiveSlide(i)}
          >
            <span className="pptx-thumb-num">{i + 1}</span>
            <span className="pptx-thumb-title">{s.title.slice(0, 24)}{s.title.length > 24 ? '…' : ''}</span>
          </button>
        ))}
      </div>
      <div className="pptx-main">
        <div className="pptx-slide">
          <div className="pptx-slide-num">Slide {activeSlide + 1} of {slides.length}</div>
          <h2 className="pptx-slide-title">{slide.title}</h2>
          <div className="pptx-slide-body">
            {slide.body.map((line, i) => (
              <p key={i} className="pptx-line">{line}</p>
            ))}
            {slide.body.length === 0 && (
              <p className="pptx-empty-slide">No text content on this slide</p>
            )}
          </div>
        </div>
        <div className="pptx-controls">
          <button
            className="pdf-nav-btn"
            onClick={() => setActiveSlide(p => Math.max(0, p - 1))}
            disabled={activeSlide === 0}
          >
            ← Prev
          </button>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{activeSlide + 1} / {slides.length}</span>
          <button
            className="pdf-nav-btn"
            onClick={() => setActiveSlide(p => Math.min(slides.length - 1, p + 1))}
            disabled={activeSlide === slides.length - 1}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
