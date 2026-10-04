// Brug tussen de hub-pagina en de desktop-app. De hub leest window.evaDesktop.
const { contextBridge, ipcRenderer } = require('electron')

let info = { shortcut: undefined, version: undefined }
try { info = ipcRenderer.sendSync('eva:info') || info } catch { /* niet fataal */ }

contextBridge.exposeInMainWorld('evaDesktop', {
  closeQuickAdd: () => ipcRenderer.send('eva:close-quick'),
  openInBrowser: (url) => ipcRenderer.send('eva:open-browser', String(url)),
  shortcut: info.shortcut,
  version: info.version,
  // Vanaf 1.1: Instellingen → Desktop in de hub (sneltoetsen, menubalk, Dock, opstarten).
  capabilities: ['settings'],
  getSettings: () => ipcRenderer.sendSync('eva:get-settings'),
  setSettings: (changes) => ipcRenderer.invoke('eva:set-settings', changes),
})

// Hoofdvenster verversen na snel toevoegen in het kleine venster.
ipcRenderer.on('eva:refresh', () => window.dispatchEvent(new Event('eva:refresh')))
