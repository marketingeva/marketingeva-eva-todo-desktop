// Eva To-do agent: desktop-app voor Mac en Windows.
//
// De app laadt de To-do agent rechtstreeks uit de Eva hub. Daardoor is het
// precies dezelfde app, met dezelfde data, en loopt alles live synchroon:
// een taak die je hier afvinkt is ook in de hub afgevinkt, en andersom.
// Extra ten opzichte van de browser: sneltoetsen die overal op je computer werken
// (snel toevoegen en app tonen/verbergen, zelf in te stellen in Instellingen → Desktop)
// en een icoon in de menubalk/taakbalk. De app werkt zichzelf bij (Mac en Windows).

const { app, BrowserWindow, Tray, Menu, globalShortcut, shell, ipcMain, nativeImage, session, dialog, screen, net } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')

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
    // Mac: geen grijze titelbalk; de knopjes staan in de pagina, de hub laat er ruimte voor.
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset' } : {}),
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

const QUICK_SIZE = { width: 640, height: 250, max: 760 }

function createQuickWindow() {
  quickWindow = new BrowserWindow({
    width: QUICK_SIZE.width,
    height: QUICK_SIZE.height,
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
  quickWindow.setBounds({
    x: Math.round(x + (width - QUICK_SIZE.width) / 2), y: Math.round(y + height * 0.18),
    width: QUICK_SIZE.width, height: QUICK_SIZE.height,
  })
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
    ...(canSelfUpdate() ? [{ label: 'Zoek naar updates…', click: () => checkForMacUpdate({ manual: true }) }] : []),
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

// ── Bijwerken (Mac) ─────────────────────────────────────────────────────────
// Windows werkt bij via electron-updater. Op de Mac kan dat alleen met een Apple-certificaat,
// en deze app is ad-hoc ondertekend. Daarom hier een eigen variant: de nieuwste release op
// GitHub opzoeken, de .dmg op de achtergrond downloaden en na akkoord de app vervangen en
// opnieuw starten (hetzelfde als de installatieregel uit de README).

const RELEASES_API = 'https://api.github.com/repos/marketingeva/marketingeva-eva-todo-desktop/releases/latest'
const UPDATE_INTERVAL = 4 * 60 * 60 * 1000  // elke 4 uur; GitHub staat 60 verzoeken per uur toe
let updateBusy = false

/** "1.10.0" > "1.9.2" */
function isNewer(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number)
  const pb = String(b).replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0)
  }
  return false
}

/** De geïnstalleerde app, bijv. "/Applications/Eva To-do agent.app". */
const appBundlePath = () => path.resolve(process.execPath, '..', '..', '..')

/** Alleen de ingepakte Mac-app, en alleen als we de map mogen overschrijven. */
function canSelfUpdate() {
  if (!IS_MAC || !app.isPackaged) return false
  const bundle = appBundlePath()
  if (!bundle.endsWith('.app') || bundle.includes('/AppTranslocation/')) return false
  try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); return true } catch { return false }
}

async function downloadDmg(url, version) {
  const file = path.join(app.getPath('temp'), `Eva-To-do-agent-${version}.dmg`)
  if (fs.existsSync(file)) return file  // eerder gedownload en toen "Later" gekozen
  const res = await net.fetch(url)
  if (!res.ok || !res.body) throw new Error(`Download mislukt (${res.status})`)
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(`${file}.part`))
  fs.renameSync(`${file}.part`, file)
  return file
}

/** Sluit de app; een los script wacht tot hij weg is, zet de nieuwe versie neer en start die. */
function installAndRestart(dmg) {
  const script = path.join(app.getPath('temp'), 'eva-todo-update.sh')
  fs.writeFileSync(script, [
    '#!/bin/bash',
    '# $1 = dmg, $2 = geïnstalleerde app, $3 = naam van de app in de dmg, $4 = pid van de oude app',
    'set -e',
    'trap \'[ -n "$MNT" ] && hdiutil detach "$MNT" -quiet; [ -d "$2" ] && open "$2"\' ERR',
    'while kill -0 "$4" 2>/dev/null; do sleep 0.5; done',
    'MNT="$(hdiutil attach -nobrowse -noautoopen "$1" | tail -1 | awk -F\'\\t\' \'{print $NF}\')"',
    'rm -rf "$2.nieuw"',
    'cp -R "$MNT/$3" "$2.nieuw"',  // eerst kopiëren: mislukt dat, dan blijft de oude app staan
    'rm -rf "$2"',
    'mv "$2.nieuw" "$2"',
    'hdiutil detach "$MNT" -quiet || true',
    'xattr -dr com.apple.quarantine "$2" 2>/dev/null || true',
    // macOS bewaart app-iconen in een cache; zonder dit seintje blijft een nieuw icoon onzichtbaar.
    'touch "$2"',
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$2" 2>/dev/null || true',
    'rm -f "$1"',
    'open "$2"',
    '',
  ].join('\n'))
  const bundle = appBundlePath()
  spawn('/bin/bash', [script, dmg, bundle, `${app.getName()}.app`, String(process.pid)], { detached: true, stdio: 'ignore' }).unref()
  quitting = true
  app.quit()
}

async function checkForMacUpdate({ manual = false } = {}) {
  if (updateBusy || !canSelfUpdate()) return
  updateBusy = true
  try {
    const res = await net.fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) throw new Error(`GitHub gaf ${res.status}`)
    const release = await res.json()
    const latest = String(release.tag_name || '').replace(/^v/, '')
    const asset = (release.assets || []).find(a => a.name === 'Eva-To-do-agent.dmg')
    if (!asset || !isNewer(latest, app.getVersion())) {
      if (manual) dialog.showMessageBox({ message: `Je hebt de nieuwste versie (${app.getVersion()}).` })
      return
    }
    const dmg = await downloadDmg(asset.browser_download_url, latest)
    const { response } = await dialog.showMessageBox({
      type: 'info',
      message: `Versie ${latest} van de Eva To-do agent staat klaar.`,
      detail: 'De app sluit even af en start daarna opnieuw. Je blijft ingelogd.',
      buttons: ['Nu herstarten', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) installAndRestart(dmg)
  } catch (err) {
    if (manual) dialog.showMessageBox({ type: 'warning', message: 'Zoeken naar updates lukte niet.', detail: String(err?.message || err) })
  } finally {
    updateBusy = false
  }
}

// ── Communicatie met de pagina (preload) ────────────────────────────────────

ipcMain.on('eva:close-quick', () => {
  if (quickWindow && !quickWindow.isDestroyed()) quickWindow.hide()
  // Hoofdvenster meteen bijwerken met de nieuwe taak.
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('eva:refresh')
})

// Keuzelijsten (datum, project, personen) passen niet in het lage venster: de pagina vraagt zolang meer hoogte.
// Het venster groeit naar beneden en schuift omhoog als het anders onder het scherm uitkomt.
ipcMain.on('eva:quick-size', (_event, height) => {
  if (!quickWindow || quickWindow.isDestroyed() || typeof height !== 'number') return
  const h = Math.round(Math.min(QUICK_SIZE.max, Math.max(QUICK_SIZE.height, height)))
  const b = quickWindow.getBounds()
  if (b.height === h) return
  const area = screen.getDisplayMatching(b).workArea
  const y = Math.max(area.y, Math.min(b.y, area.y + area.height - h))
  quickWindow.setBounds({ x: b.x, y, width: b.width, height: h })
})

ipcMain.on('eva:open-browser', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url)
})

ipcMain.on('eva:info', (event) => {
  event.returnValue = { shortcut: shortcutLabel(readSettings().quickShortcut), version: app.getVersion(), frameless: IS_MAC }
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

    if (canSelfUpdate()) {
      setTimeout(() => checkForMacUpdate(), 15 * 1000)
      setInterval(() => checkForMacUpdate(), UPDATE_INTERVAL)
    }
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
