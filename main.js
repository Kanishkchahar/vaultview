const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const isDev = process.env.NODE_ENV === 'development';
const BUFFERED_FILE_LIMIT = 200 * 1024 * 1024;
const TEXT_FILE_LIMIT = 25 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = [
  'pdf',
  'docx', 'rtf', 'odt',
  'pptx',
  'xlsx', 'xls', 'csv',
  'txt', 'md',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
  'mp4', 'avi', 'mkv', 'mov', 'webm',
  'mp3', 'wav', 'ogg', 'flac', 'aac',
  'json', 'xml', 'yaml', 'yml',
  'zip',
  'epub',
  'html', 'htm'
];

// Recent files storage
const RECENT_FILES_PATH = path.join(app.getPath('userData'), 'recentFiles.json');

function loadRecentFiles() {
  try {
    if (fs.existsSync(RECENT_FILES_PATH)) {
      return JSON.parse(fs.readFileSync(RECENT_FILES_PATH, 'utf-8'));
    }
  } catch (e) {}
  return [];
}

function saveRecentFiles(files) {
  try {
    fs.writeFileSync(RECENT_FILES_PATH, JSON.stringify(files, null, 2));
  } catch (e) {}
}

function addRecentFile(filePath) {
  const file = getReadableFile(filePath);
  if (file.error) throw new Error(file.error);
  filePath = file.path;

  let recent = loadRecentFiles();
  recent = recent.filter(f => f.path !== filePath);
  recent.unshift({
    path: filePath,
    name: path.basename(filePath),
    ext: path.extname(filePath).toLowerCase().slice(1),
    timestamp: Date.now()
  });
  if (recent.length > 20) recent = recent.slice(0, 20);
  saveRecentFiles(recent);
  return recent;
}

function getReadableFile(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    return { error: 'Invalid file path' };
  }

  try {
    const resolved = path.resolve(filePath);
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return { error: 'Path is not a file' };
    return { path: resolved, stat };
  } catch (e) {
    return { error: e.message };
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0d0d0d',
    titleBarStyle: 'hidden',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      zoomFactor: 1.0
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Disable Electron's built-in Ctrl+= / Ctrl+- / Ctrl+0 zoom completely
  // so our React viewers handle it instead
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1.0);
    win.webContents.setVisualZoomLevelLimits(1, 1);
  });

  // Block the default zoom keyboard shortcuts at the menu level
  const { Menu } = require('electron');
  Menu.setApplicationMenu(null);

  // Handle file open from OS (double-click)
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    win.webContents.send('open-file-path', filePath);
  });

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();

  ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [
        { name: 'All Supported Files', extensions: SUPPORTED_EXTENSIONS },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const recent = addRecentFile(filePath);
      return { filePath, recent };
    }
    return null;
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const file = getReadableFile(filePath);
      if (file.error) throw new Error(file.error);
      if (file.stat.size > BUFFERED_FILE_LIMIT) {
        throw new Error(`File is too large to buffer (${Math.round(file.stat.size / 1048576)} MB).`);
      }

      const buffer = fs.readFileSync(file.path);
      return { 
        data: buffer.toString('base64'),
        size: buffer.length,
        name: path.basename(file.path),
        ext: path.extname(file.path).toLowerCase().slice(1)
      };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('read-file-text', async (event, filePath) => {
    try {
      const file = getReadableFile(filePath);
      if (file.error) throw new Error(file.error);
      if (file.stat.size > TEXT_FILE_LIMIT) {
        throw new Error(`Text file is too large to load (${Math.round(file.stat.size / 1048576)} MB).`);
      }

      const text = fs.readFileSync(file.path, 'utf-8');
      return { text };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('get-recent-files', () => loadRecentFiles());

  ipcMain.handle('add-recent-file', (event, filePath) => {
    try {
      return addRecentFile(filePath);
    } catch {
      return loadRecentFiles();
    }
  });

  ipcMain.handle('remove-recent-file', (event, filePath) => {
    let recent = loadRecentFiles();
    recent = recent.filter(f => f.path !== filePath);
    saveRecentFiles(recent);
    return recent;
  });

  ipcMain.handle('clear-recent-files', () => {
    saveRecentFiles([]);
    return [];
  });

  ipcMain.handle('file-exists', (event, filePath) => {
    return !getReadableFile(filePath).error;
  });

  ipcMain.handle('get-file-path-uri', (event, filePath) => {
    const file = getReadableFile(filePath);
    if (file.error) throw new Error(file.error);
    return pathToFileURL(file.path).toString();
  });

  // Window controls
  ipcMain.on('window-minimize', () => win.minimize());
  ipcMain.on('window-maximize', () => {
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  ipcMain.on('window-close', () => win.close());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
