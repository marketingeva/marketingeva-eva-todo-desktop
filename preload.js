// Brug tussen de hub-pagina en de desktop-app. De hub leest window.evaDesktop.
const { contextBridge, ipcRenderer } = require('electron')

let info = { shortcut: undefined, version: undefined }
try { info = ipcRenderer.sendSync('eva:info') || info } catch { /* niet fataal */ }

contextBridge.exposeInMainWorld('evaDesktop', {
  closeQuickAdd: () => ipcRenderer.send('eva:close-quick'),
  openInBrowser: (url) => ipcRenderer.send('eva:open-browser', String(url)),
  shortcut: info.shortcut,
  version: info.version,
})

// Hoofdvenster verversen na snel toevoegen in het kleine venster.
ipcRenderer.on('eva:refresh', () => window.dispatchEvent(new Event('eva:refresh')))
