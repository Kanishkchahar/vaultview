import React, { useEffect, useState, useRef } from 'react';
import useZoom from '../hooks/useZoom.js';

export default function SpreadsheetViewer({ tab }) {
  const [sheets, setSheets] = useState([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const [zoom] = useZoom(containerRef, { min: 0.5, max: 2, step: 0.1, initial: 1 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const XLSX = await import('xlsx');
        const ext = tab.ext.toLowerCase();
        let workbook;
        if (ext === 'csv') {
          const textResult = await window.electronAPI.readFileText(tab.filePath);
          if (textResult.error) throw new Error(textResult.error);
          workbook = XLSX.read(textResult.text, { type: 'string' });
        } else {
          const result = await window.electronAPI.readFile(tab.filePath);
          if (result.error) throw new Error(result.error);
          const binary = atob(result.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          workbook = XLSX.read(bytes, { type: 'array' });
        }
        const allSheets = workbook.SheetNames.map(name => {
          const ws = workbook.Sheets[name];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
          return { name, data };
        });
        if (!cancelled) { setSheets(allSheets); setActiveSheet(0); }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tab.filePath]);

  if (loading) return <div className="viewer-loading"><div className="spinner"/><span>Loading spreadsheet…</span></div>;
  if (error) return <div className="viewer-error"><p>Failed to load spreadsheet</p><small>{error}</small></div>;
  if (sheets.length === 0) return <div className="viewer-error"><p>No data found</p></div>;

  const sheet = sheets[activeSheet];
  const headers = sheet.data[0] || [];
  const rows = sheet.data.slice(1);

  return (
    <div className="viewer-wrapper">
      <div className="pdf-toolbar">
        {sheets.length > 1 && (
          <>
            {sheets.map((s, i) => (
              <button
                key={i}
                className={`sheet-tab ${i === activeSheet ? 'sheet-tab-active' : ''}`}
                onClick={() => setActiveSheet(i)}
              >{s.name}</button>
            ))}
            <div className="pdf-divider"/>
          </>
        )}
        <span className="zoom-hint">Ctrl+Scroll or Ctrl+± to zoom</span>
        <div style={{flex:1}}/>
        <span className="pdf-page-info">{Math.round(zoom * 100)}%</span>
      </div>
      <div ref={containerRef} className="viewer-scroll" style={{ padding: 0 }}>
        <div className="spreadsheet-info" style={{ fontSize: `${zoom * 11}px` }}>
          {rows.length} rows × {headers.length} columns
        </div>
        <div className="spreadsheet-wrap">
          <table className="spreadsheet-table" style={{ fontSize: `${zoom * 13}px` }}>
            <thead>
              <tr>
                <th className="row-num-header">#</th>
                {headers.map((h, i) => <th key={i}>{String(h)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri}>
                  <td className="row-num">{ri + 1}</td>
                  {headers.map((_, ci) => <td key={ci}>{String(row[ci] ?? '')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
