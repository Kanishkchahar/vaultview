import React, { useEffect, useState } from 'react';
import { escapeHtml, sanitizeHtml } from '../utils/sanitizeHtml.js';

export default function EpubViewer({ tab }) {
  const [chapters, setChapters] = useState([]);
  const [activeChapter, setActiveChapter] = useState(0);
  const [chapterHtml, setChapterHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState({});
  const [zipRef, setZipRef] = useState(null);
  const [fontSize, setFontSize] = useState(16);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const JSZip = (await import('jszip')).default;

        const result = await window.electronAPI.readFile(tab.filePath);
        if (result.error) throw new Error(result.error);

        const binary = atob(result.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const zip = await JSZip.loadAsync(bytes.buffer);
        if (cancelled) return;
        setZipRef(zip);

        // Parse container.xml to find OPF path
        const containerXml = await zip.files['META-INF/container.xml']?.async('string');
        if (!containerXml) throw new Error('Not a valid EPUB (no container.xml)');

        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, 'application/xml');
        const rootfile = containerDoc.querySelector('rootfile');
        const opfPath = rootfile?.getAttribute('full-path');
        if (!opfPath) throw new Error('Cannot find OPF path');

        const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
        const opfXml = await zip.files[opfPath]?.async('string');
        if (!opfXml) throw new Error('Cannot read OPF file');

        const opfDoc = parser.parseFromString(opfXml, 'application/xml');

        // Metadata
        const title = opfDoc.querySelector('title')?.textContent || tab.name;
        const creator = opfDoc.querySelector('creator')?.textContent || '';
        const description = opfDoc.querySelector('description')?.textContent || '';
        if (!cancelled) setMetadata({ title, creator, description });

        // Build manifest map: id -> href
        const manifestItems = {};
        opfDoc.querySelectorAll('manifest item').forEach(item => {
          manifestItems[item.getAttribute('id')] = item.getAttribute('href');
        });

        // Spine order
        const spineItems = [];
        opfDoc.querySelectorAll('spine itemref').forEach(itemref => {
          const id = itemref.getAttribute('idref');
          if (manifestItems[id]) {
            const href = manifestItems[id];
            spineItems.push({ id, href, path: opfDir + href });
          }
        });

        if (spineItems.length === 0) throw new Error('No readable content found');

        // Build chapter list with labels from TOC if available
        const ncxId = opfDoc.querySelector('spine')?.getAttribute('toc');
        const ncxPath = ncxId && manifestItems[ncxId] ? opfDir + manifestItems[ncxId] : null;
        const tocLabels = {};

        if (ncxPath && zip.files[ncxPath]) {
          const ncxXml = await zip.files[ncxPath].async('string');
          const ncxDoc = parser.parseFromString(ncxXml, 'application/xml');
          ncxDoc.querySelectorAll('navPoint').forEach(nav => {
            const labelEl = nav.querySelector('navLabel text');
            const contentEl = nav.querySelector('content');
            if (labelEl && contentEl) {
              const src = contentEl.getAttribute('src')?.split('#')[0];
              if (src) tocLabels[src] = labelEl.textContent.trim();
            }
          });
        }

        const chapterList = spineItems.map((item, i) => ({
          ...item,
          label: tocLabels[item.href] || `Chapter ${i + 1}`,
          index: i
        }));

        if (!cancelled) {
          setChapters(chapterList);
          setActiveChapter(0);
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

  // Load chapter content when active chapter changes
  useEffect(() => {
    if (!zipRef || chapters.length === 0) return;
    loadChapter(chapters[activeChapter]);
  }, [activeChapter, zipRef, chapters]);

  async function loadChapter(chapter) {
    if (!zipRef || !chapter) return;
    try {
      const html = await zipRef.files[chapter.path]?.async('string');
      if (!html) { setChapterHtml('<p>Chapter content not found</p>'); return; }

      // Clean HTML — strip head, external refs, scripts
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      doc.querySelectorAll('script, link[rel="stylesheet"], style, iframe, object, embed').forEach(el => el.remove());
      const body = doc.querySelector('body');
      setChapterHtml(sanitizeHtml(body ? body.innerHTML : html));
    } catch (e) {
      setChapterHtml(`<p>Failed to load chapter: ${escapeHtml(e.message)}</p>`);
    }
  }

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Parsing EPUB…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to load EPUB</p><small>{error}</small></div>;

  return (
    <div className="viewer-wrapper" style={{ flexDirection: 'row' }}>
      {/* TOC sidebar */}
      <div className="epub-toc">
        <div className="epub-meta">
          <div className="epub-title">{metadata.title}</div>
          {metadata.creator && <div className="epub-author">{metadata.creator}</div>}
        </div>
        <div className="epub-toc-list">
          {chapters.map((ch, i) => (
            <button
              key={i}
              className={`epub-toc-item ${i === activeChapter ? 'epub-toc-item-active' : ''}`}
              onClick={() => setActiveChapter(i)}
            >
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reader */}
      <div className="epub-reader">
        <div className="epub-toolbar">
          <button className="pdf-nav-btn" onClick={() => setFontSize(f => Math.max(10, f - 1))}>A−</button>
          <span className="pdf-page-info">{fontSize}px</span>
          <button className="pdf-nav-btn" onClick={() => setFontSize(f => Math.min(32, f + 1))}>A+</button>
          <div className="pdf-divider"/>
          <button
            className="pdf-nav-btn"
            onClick={() => setActiveChapter(p => Math.max(0, p - 1))}
            disabled={activeChapter === 0}
          >← Prev</button>
          <span className="pdf-page-info">{activeChapter + 1} / {chapters.length}</span>
          <button
            className="pdf-nav-btn"
            onClick={() => setActiveChapter(p => Math.min(chapters.length - 1, p + 1))}
            disabled={activeChapter === chapters.length - 1}
          >Next →</button>
        </div>
        <div className="viewer-scroll">
          <div
            className="epub-content"
            style={{ fontSize: `${fontSize}px` }}
            dangerouslySetInnerHTML={{ __html: chapterHtml }}
          />
        </div>
      </div>
    </div>
  );
}
