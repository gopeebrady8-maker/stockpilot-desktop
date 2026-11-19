// Runs before the StockPilot page loads. Exposes only a tiny, read-only API: nothing from Node.js reaches the page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stockpilotDesktop', {
  isDesktop: true,
  platform: process.platform, // 'win32' | 'darwin'
  retry: (url) => ipcRenderer.invoke('sp:retry', String(url || '')),
});
