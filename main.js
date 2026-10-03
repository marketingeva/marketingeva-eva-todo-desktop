// Eva To-do agent: desktop-app voor Mac en Windows.
//
// De app laadt de To-do agent rechtstreeks uit de Eva hub. Daardoor is het
// precies dezelfde app, met dezelfde data, en loopt alles live synchroon:
// een taak die je hier afvinkt is ook in de hub afgevinkt, en andersom.
// Extra ten opzichte van de browser: een sneltoets die overal op je computer
// werkt (ook in andere programma's) en een icoon in de menubalk/taakbalk.

const { app, BrowserWindow, Tray, Menu, globalShortcut, shell, ipcMain, nativeImage, session, dialog, screen } = require('electron')
const path = require('path')
const fs = require('fs')

const HUB_URL = (process.env.EVA_HUB_URL || 'https://independent-ambition-production-792a.up.railway.app').replace(/\/$/, '')
const PARTITION = 'persist:eva'
const IS_MAC = process.platform === 'darwin'

const SHORTCUTS = [
  { accelerator: 'CommandOrControl+Shift+Space', label: IS_MAC ? '⌘ + Shift + Spatie' : 'Ctrl + Shift + Spatie' },
  { accelerator: 'CommandOrControl+Alt+T', label: IS_MAC ? '⌘ + Option + T' : 'Ctrl + Alt + T' },
  { accelerator: 'CommandOrControl+Shift+K', label: IS_MAC ? '⌘ + Shift + K' : 'Ctrl + Shift + K' },
  { accelerator: 'Alt+Space', label: IS_MAC ? 'Option + Spatie' : 'Alt + Spatie' },
]

let mainWindow = null
let quickWindow = null
let tray = null
let quitting = false

// ── Instellingen (sneltoets, starten bij inloggen) ─────────────────────────

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

function readSettings() {
  try {
    return { shortcut: SHORTCUTS[0].accelerator, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }
  } catch {
    return { shortcut: SHORTCUTS[0].accelerator }
  }
}

function writeSettings(changes) {
  const next = { ...readSettings(), ...changes }
  try { fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2)) } catch { /* niet fataal */ }
  return next
}

const shortcutLabel = (accelerator) =>
  (SHORTCUTS.find(s => s.accelerator === accelerator) || { label: accelerator }).label

// ── Vensters ────────────────────────────────────────────────────────────────

function isHubUrl(url) {
  try { return new URL(url).origin === new URL(HUB_URL).origin } catch { return false }
}

function guardNavigation(win) {
  // Alles van de hub blijft in de app; andere sites openen in de browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!isHubUrl(url)) {
      event.preventDefault()
      if (/^https?:/.test(url)) shell.openExternal(url)
    }
  })
}

function webPreferences() {
  return {
    partition: PARTITION,
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    spellcheck: true,
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: 'Eva To-do agent',
    backgroundColor: '#121016',
    show: false,
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  })
  guardNavigation(mainWindow)
  mainWindow.loadURL(`${HUB_URL}/todo`)
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', (event) => {
    // Sluiten = verbergen; de app blijft actief voor de sneltoets. Afsluiten via het icoon.
    if (!quitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createQuickWindow() {
  quickWindow = new BrowserWindow({
    width: 640,
    height: 250,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#17151c',
    roundedCorners: true,
    webPreferences: webPreferences(),
  })
  guardNavigation(quickWindow)
  quickWindow.loadURL(`${HUB_URL}/todo/quick`)
  quickWindow.on('blur', () => { if (quickWindow && !quickWindow.webContents.isDevToolsOpened()) quickWindow.hide() })
  quickWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      quickWindow.hide()
    }
  })
}

function showQuickWindow() {
  if (!quickWindow || quickWindow.isDestroyed()) createQuickWindow()
  // Midden boven op het scherm waar de muis staat.
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const { x, y, width, height } = display.workArea
  const [w] = quickWindow.getSize()
  quickWindow.setPosition(Math.round(x + (width - w) / 2), Math.round(y + height * 0.18))
  quickWindow.show()
  quickWindow.focus()
  quickWindow.webContents.focus()
}

// ── Sneltoets ───────────────────────────────────────────────────────────────

function registerShortcut(accelerator) {
  globalShortcut.unregisterAll()
  const ok = globalShortcut.register(accelerator, showQuickWindow)
  if (!ok) {
    dialog.showMessageBox({
      type: 'warning',
      message: `De sneltoets ${shortcutLabel(accelerator)} is al in gebruik door een ander programma.`,
      detail: 'Kies een andere sneltoets via het To-do agent-icoon in de menubalk of taakbalk.',
    })
  }
  return ok
}

// ── Menubalk / taakbalk ─────────────────────────────────────────────────────

function trayIcon() {
  if (IS_MAC) {
    const image = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'))
    image.setTemplateImage(true)
    return image
  }
  return nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'))
}

function buildTrayMenu() {
  const settings = readSettings()
  const loginSettings = app.getLoginItemSettings()
  return Menu.buildFromTemplate([
    { label: 'Open To-do agent', click: showMainWindow },
    { label: `Snel toevoegen (${shortcutLabel(settings.shortcut)})`, click: showQuickWindow },
    { type: 'separator' },
    {
      label: 'Sneltoets',
      submenu: SHORTCUTS.map(s => ({
        label: s.label,
        type: 'radio',
        checked: settings.shortcut === s.accelerator,
        click: () => {
          writeSettings({ shortcut: s.accelerator })
          registerShortcut(s.accelerator)
          refreshTray()
        },
      })),
    },
    {
      label: 'Starten bij inloggen',
      type: 'checkbox',
      checked: loginSettings.openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true }),
    },
    { label: 'Open de hub in de browser', click: () => shell.openExternal(HUB_URL) },
    { type: 'separator' },
    { label: `Versie ${app.getVersion()}`, enabled: false },
    { label: 'Afsluiten', click: () => { quitting = true; app.quit() } },
  ])
}

function refreshTray() {
  if (!tray) return
  tray.setContextMenu(buildTrayMenu())
  tray.setToolTip(`Eva To-do agent · Snel toevoegen: ${shortcutLabel(readSettings().shortcut)}`)
}

// ── Communicatie met de pagina (preload) ────────────────────────────────────

ipcMain.on('eva:close-quick', () => {
  if (quickWindow && !quickWindow.isDestroyed()) quickWindow.hide()
  // Hoofdvenster meteen bijwerken met de nieuwe taak.
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('eva:refresh')
})

ipcMain.on('eva:open-browser', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url)
})

ipcMain.on('eva:info', (event) => {
  event.returnValue = { shortcut: shortcutLabel(readSettings().shortcut), version: app.getVersion() }
})

// ── Opstarten ───────────────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)

  app.whenReady().then(() => {
    // Laat de hub weten dat dit de desktop-app is (eigen weergave zonder hub-zijbalk).
    const ses = session.fromPartition(PARTITION)
    ses.setUserAgent(`${ses.getUserAgent()} EvaDesktop/${app.getVersion()}`)

    createMainWindow()
    createQuickWindow()

    tray = new Tray(trayIcon())
    tray.on('click', showMainWindow)
    refreshTray()
    registerShortcut(readSettings().shortcut)

    if (app.isPackaged && process.platform === 'win32') {
      try {
        const { autoUpdater } = require('electron-updater')
        autoUpdater.checkForUpdatesAndNotify().catch(() => {})
      } catch { /* updater niet beschikbaar */ }
    }
  })

  app.on('activate', showMainWindow)
  app.on('before-quit', () => { quitting = true })
  app.on('will-quit', () => globalShortcut.unregisterAll())
  app.on('window-all-closed', () => { /* blijft actief in de menubalk/taakbalk */ })
}
