import React from 'react';
import PDFViewer from './PDFViewer.jsx';
import DocxViewer from './DocxViewer.jsx';
import PptxViewer from './PptxViewer.jsx';
import SpreadsheetViewer from './SpreadsheetViewer.jsx';
import TextViewer from './TextViewer.jsx';
import ImageViewer from './ImageViewer.jsx';
import VideoViewer from './VideoViewer.jsx';
import AudioViewer from './AudioViewer.jsx';
import CodeViewer from './CodeViewer.jsx';
import ArchiveViewer from './ArchiveViewer.jsx';
import EpubViewer from './EpubViewer.jsx';
import HtmlViewer from './HtmlViewer.jsx';
import UnknownViewer from './UnknownViewer.jsx';

const VIEWER_MAP = {
  pdf: PDFViewer,
  docx: DocxViewer,
  pptx: PptxViewer,
  spreadsheet: SpreadsheetViewer,
  text: TextViewer,
  image: ImageViewer,
  video: VideoViewer,
  audio: AudioViewer,
  code: CodeViewer,
  archive: ArchiveViewer,
  epub: EpubViewer,
  html: HtmlViewer,
  unknown: UnknownViewer,
};

export default function ViewerRouter({ tab }) {
  const Viewer = VIEWER_MAP[tab.viewerKey] || UnknownViewer;
  return <Viewer key={tab.id} tab={tab} />;
}
