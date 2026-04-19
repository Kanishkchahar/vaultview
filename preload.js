const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  readFileText: (filePath) => ipcRenderer.invoke('read-file-text', filePath),
  getRecentFiles: () => ipcRenderer.invoke('get-recent-files'),
  addRecentFile: (filePath) => ipcRenderer.invoke('add-recent-file', filePath),
  removeRecentFile: (filePath) => ipcRenderer.invoke('remove-recent-file', filePath),
  clearRecentFiles: () => ipcRenderer.invoke('clear-recent-files'),
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),
  getFilePathUri: (filePath) => ipcRenderer.invoke('get-file-path-uri', filePath),
  onOpenFilePath: (callback) => ipcRenderer.on('open-file-path', (_, filePath) => callback(filePath)),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
});
