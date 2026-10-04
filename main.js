// Eva To-do agent: desktop-app voor Mac en Windows.
//
// De app laadt de To-do agent rechtstreeks uit de Eva hub. Daardoor is het
// precies dezelfde app, met dezelfde data, en loopt alles live synchroon:
// een taak die je hier afvinkt is ook in de hub afgevinkt, en andersom.
// Extra ten opzichte van de browser: sneltoetsen die overal op je computer werken
// (snel toevoegen en app tonen/verbergen, zelf in te stellen in Instellingen → Desktop)
// en een icoon in de menubalk/taakbalk.

const { app, BrowserWindow, Tray, Menu, globalShortcut, shell, ipcMain, nativeImage, session, dialog, screen } = require('electron')
const path = require('path')
const fs = require('fs')

const HUB_URL = (process.env.EVA_HUB_URL || 'https://independent-ambition-production-792a.up.railway.app').replace(/\/$/, '')
const PARTITION = 'persist:eva'
const IS_MAC = process.platform === 'darwin'

const DEFAULTS = {
  quickShortcut: 'CommandOrControl+Shift+Space',  // Taak snel toevoegen
  toggleShortcut: 'CommandOrControl+Shift+O',     // To-do agent tonen/verbergen
  showTray: true,
  showDock: true,
}

let mainWindow = null
let quickWindow = null
let tray = null
let quitting = false

// ── Instellingen (sneltoetsen, menubalk, Dock) ─────────────────────────────
// In te stellen in de app zelf: To-do agent → Instellingen → Desktop.

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')

function readSettings() {
  let stored = {}
  try { stored = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) } catch { /* eerste start */ }
  // Versie 1.0 bewaarde één sneltoets onder "shortcut".
  if (stored.shortcut && stored.quickShortcut === undefined) stored.quickShortcut = stored.shortcut
  delete stored.shortcut
  return { ...DEFAULTS, ...stored }
}

function writeSettings(changes) {
  const next = { ...readSettings(), ...changes }
  try { fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2)) } catch { /* niet fataal */ }
  return next
}

/** "CommandOrControl+Shift+Space" → "⌘ + ⇧ + Spatie" (Mac) of "Ctrl + Shift + Spatie". */
function shortcutLabel(accelerator) {
  if (!accelerator) return 'geen'
  const names = IS_MAC
    ? { CommandOrControl: '⌘', Command: '⌘', Control: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Space: 'Spatie' }
    : { CommandOrControl: 'Ctrl', Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Space: 'Spatie' }
  return accelerator.split('+').map(p => names[p] || p).join(' + ')
}

function publicSettings() {
  const s = readSettings()
  return {
    quickShortcut: s.quickShortcut || null,
    toggleShortcut: s.toggleShortcut || null,
    showTray: !!s.showTray,
    showDock: !!s.showDock,
    openAtLogin: app.getLoginItemSettings().openAtLogin,
    platform: process.platform,
  }
}

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

// ── Sneltoetsen ─────────────────────────────────────────────────────────────

function toggleMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide()
    if (IS_MAC && !readSettings().showDock) app.hide()
  } else {
    showMainWindow()
  }
}

/** Registreert beide sneltoetsen. Geeft per sneltoets terug of het lukte. */
function registerShortcuts(settings = readSettings()) {
  globalShortcut.unregisterAll()
  const result = { quick: true, toggle: true }
  if (settings.quickShortcut) {
    try { result.quick = globalShortcut.register(settings.quickShortcut, showQuickWindow) } catch { result.quick = false }
  }
  if (settings.toggleShortcut) {
    try { result.toggle = globalShortcut.register(settings.toggleShortcut, toggleMainWindow) } catch { result.toggle = false }
  }
  return result
}

function warnTakenShortcuts(result, settings) {
  const taken = []
  if (!result.quick) taken.push(shortcutLabel(settings.quickShortcut))
  if (!result.toggle) taken.push(shortcutLabel(settings.toggleShortcut))
  if (!taken.length) return
  dialog.showMessageBox({
    type: 'warning',
    message: `De sneltoets ${taken.join(' en ')} is al in gebruik door een ander programma.`,
    detail: 'Kies een andere in To-do agent → Instellingen → Desktop.',
  })
}

/** Instellingen wijzigen vanuit de pagina. Een bezette sneltoets wordt niet opgeslagen. */
function applySettings(changes) {
  const before = readSettings()
  const next = { ...before }
  for (const key of ['quickShortcut', 'toggleShortcut']) {
    if (key in changes) next[key] = changes[key] ? String(changes[key]).slice(0, 60) : null
  }
  if ('showTray' in changes) next.showTray = !!changes.showTray
  if ('showDock' in changes) next.showDock = !!changes.showDock

  if (next.quickShortcut && next.quickShortcut === next.toggleShortcut) {
    return { ok: false, error: 'Kies twee verschillende sneltoetsen.', settings: publicSettings() }
  }
  if (IS_MAC && !next.showTray && !next.showDock) {
    return { ok: false, error: 'Menubalk en Dock kunnen niet allebei uit, anders is de app niet meer te vinden.', settings: publicSettings() }
  }

  if ('quickShortcut' in changes || 'toggleShortcut' in changes) {
    const result = registerShortcuts(next)
    if (!result.quick || !result.toggle) {
      registerShortcuts(before)  // terug naar wat werkte
      const bad = !result.quick ? next.quickShortcut : next.toggleShortcut
      return { ok: false, error: `${shortcutLabel(bad)} is al in gebruik door een ander programma. Kies een andere.`, settings: publicSettings() }
    }
  }
  writeSettings(next)

  if ('showTray' in changes) setTrayVisible(next.showTray)
  if ('showDock' in changes && IS_MAC) {
    if (next.showDock) app.dock.show(); else app.dock.hide()
  }
  if ('openAtLogin' in changes) {
    app.setLoginItemSettings({ openAtLogin: !!changes.openAtLogin, openAsHidden: true })
  }
  refreshTray()
  return { ok: true, settings: publicSettings() }
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

function openSettings() {
  showMainWindow()
  mainWindow.webContents.loadURL(`${HUB_URL}/todo/settings#desktop`)
}

function buildTrayMenu() {
  const settings = readSettings()
  return Menu.buildFromTemplate([
    { label: `Open To-do agent${settings.toggleShortcut ? ` (${shortcutLabel(settings.toggleShortcut)})` : ''}`, click: showMainWindow },
    { label: `Snel toevoegen${settings.quickShortcut ? ` (${shortcutLabel(settings.quickShortcut)})` : ''}`, click: showQuickWindow },
    { type: 'separator' },
    { label: 'Instellingen…', click: openSettings },
    { label: 'Open de hub in de browser', click: () => shell.openExternal(HUB_URL) },
    { type: 'separator' },
    { label: `Versie ${app.getVersion()}`, enabled: false },
    { label: 'Afsluiten', click: () => { quitting = true; app.quit() } },
  ])
}

function setTrayVisible(visible) {
  if (visible && !tray) {
    tray = new Tray(trayIcon())
    tray.on('click', showMainWindow)
  } else if (!visible && tray) {
    tray.destroy()
    tray = null
  }
}

function refreshTray() {
  if (!tray) return
  const s = readSettings()
  tray.setContextMenu(buildTrayMenu())
  tray.setToolTip(`Eva To-do agent · Snel toevoegen: ${shortcutLabel(s.quickShortcut)}`)
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
  event.returnValue = { shortcut: shortcutLabel(readSettings().quickShortcut), version: app.getVersion() }
})

ipcMain.on('eva:get-settings', (event) => { event.returnValue = publicSettings() })
ipcMain.handle('eva:set-settings', (_event, changes) => applySettings(changes && typeof changes === 'object' ? changes : {}))

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

    const settings = readSettings()
    if (IS_MAC && !settings.showDock && settings.showTray) app.dock.hide()
    setTrayVisible(settings.showTray || (IS_MAC && !settings.showDock))
    refreshTray()
    warnTakenShortcuts(registerShortcuts(settings), settings)

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
