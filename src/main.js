// Holdbay desktop (Windows & macOS).
// The app window shows the live Holdbay web app, so every website update reaches desktop users the next
// time they open it. The app itself (window, menus, icon) updates automatically from GitHub Releases.
const { app, BrowserWindow, Menu, shell, session, dialog, ipcMain, nativeTheme, net, systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');

// www.holdbay.com is the home of Holdbay. Until that domain is connected, the app uses the Netlify address.
const APP_URLS = ['https://www.holdbay.com/', 'https://stockpilot-btdesign.netlify.app/'];
let APP_URL = APP_URLS[0];
// Sites the window itself may show (sign-in redirects stay in the app; everything else opens in the browser).
const ALLOWED_ORIGINS = new Set(APP_URLS.map((u) => new URL(u).origin));

// Picks the first address that answers with the Holdbay app (checked once at start-up, 6 seconds max each).
async function pickAppUrl() {
  for (const url of APP_URLS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await net.fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (res.ok && /Know Your Stock[\s\S]*js\/main\.js/.test(await res.text())) return url; // the real app, not a parked-domain page
    } catch { /* try the next address */ }
  }
  return APP_URLS[0];
}
const isMac = process.platform === 'darwin';

let win = null;
let updater = null;

// ---------------------------------------------------------------- one window only
if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// ---------------------------------------------------------------- remember window size
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return { width: 1360, height: 860 }; }
}
function saveState() {
  if (!win) return;
  try { fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() })); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- links: inside the app or in the browser
function isAllowed(url) {
  try { return ALLOWED_ORIGINS.has(new URL(url).origin); } catch { return false; }
}
function openExternal(url) {
  try {
    const u = new URL(url);
    if (['https:', 'mailto:'].includes(u.protocol)) shell.openExternal(u.toString());
  } catch { /* ignore bad links */ }
}

function createWindow() {
  const s = loadState();
  win = new BrowserWindow({
    width: s.width, height: s.height, x: s.x, y: s.y, minWidth: 900, minHeight: 600,
    title: 'Holdbay', show: false, backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f4f5f7',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false, spellcheck: true,
    },
  });
  if (s.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  ['resize', 'move', 'close'].forEach((e) => win.on(e, saveState));

  // Links that open a new window (target=_blank, mailto, privacy page…) go to the user's browser / mail app.
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  // Never navigate the app window away from Holdbay.
  win.webContents.on('will-navigate', (e, url) => { if (!isAllowed(url)) { e.preventDefault(); openExternal(url); } });
  win.webContents.on('will-redirect', (e, url) => { if (!isAllowed(url)) { e.preventDefault(); openExternal(url); } });

  // No connection (or the site is down): show a friendly page with a Try again button.
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 = aborted (normal during redirects)
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { url: url || APP_URL } });
  });

  win.loadURL(APP_URL);
}

// ---------------------------------------------------------------- permissions
function setupPermissions() {
  const ses = session.defaultSession;
  // Camera for barcode scanning and notifications, only for Holdbay itself. Everything else is refused.
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const origin = (() => { try { return new URL(details.requestingUrl || wc.getURL()).origin; } catch { return ''; } })();
    const ok = ALLOWED_ORIGINS.has(origin) && ['media', 'notifications', 'clipboard-sanitized-write', 'fullscreen'].includes(permission)
      && (permission !== 'media' || !(details.mediaTypes || []).includes('audio'));
    // macOS also asks the user once ("Holdbay would like to access the camera").
    if (ok && permission === 'media' && isMac && systemPreferences.getMediaAccessStatus('camera') !== 'granted') {
      systemPreferences.askForMediaAccess('camera').then(callback, () => callback(false));
      return;
    }
    callback(ok);
  });
  ses.setPermissionCheckHandler((_wc, permission, origin) => ALLOWED_ORIGINS.has(origin) && ['media', 'notifications', 'clipboard-sanitized-write'].includes(permission));
  // Excel / PDF / CSV downloads: always ask where to save, starting in Downloads.
  ses.on('will-download', (_e, item) => {
    item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()) });
  });
}

// ---------------------------------------------------------------- updates
function setupUpdates() {
  if (!app.isPackaged) return;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch { return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('update-downloaded', (info) => {
    dialog.showMessageBox(win, {
      type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1,
      title: 'Update ready', message: `Holdbay ${info.version} is ready to install.`,
      detail: 'Restart Holdbay to finish updating. If you choose Later, it installs the next time you close the app.',
    }).then(({ response }) => { if (response === 0) updater.quitAndInstall(); });
  });
  updater.on('error', () => { /* offline or no release yet: try again next launch */ });
  updater.checkForUpdates().catch(() => {});
  setInterval(() => updater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

async function checkForUpdatesNow() {
  if (!updater) {
    dialog.showMessageBox(win, { type: 'info', message: 'Updates are checked automatically in the installed app.' });
    return;
  }
  try {
    const r = await updater.checkForUpdates();
    if (!r || !r.updateInfo || r.updateInfo.version === app.getVersion()) {
      dialog.showMessageBox(win, { type: 'info', message: `You have the latest version of Holdbay (${app.getVersion()}).` });
    } else {
      dialog.showMessageBox(win, { type: 'info', message: `Downloading Holdbay ${r.updateInfo.version}…`, detail: 'You’ll be asked to restart when it’s ready.' });
    }
  } catch {
    dialog.showMessageBox(win, { type: 'warning', message: 'Couldn’t check for updates. Check your internet connection and try again.' });
  }
}

// ---------------------------------------------------------------- menu
function setupMenu() {
  const help = {
    role: 'help',
    submenu: [
      { label: 'Holdbay help & support', click: () => openExternal('mailto:info@btdesign.co.za?subject=Holdbay%20support') },
      { label: 'BT Design website', click: () => openExternal('https://btdesign.co.za') },
      { label: 'Privacy policy', click: () => openExternal(new URL('privacy.html', APP_URL).toString()) },
      { type: 'separator' },
      { label: 'Check for updates…', click: checkForUpdatesNow },
      { label: `Version ${app.getVersion()}`, enabled: false },
    ],
  };
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' }, { label: 'Check for updates…', click: checkForUpdatesNow }, { type: 'separator' },
      { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'File', submenu: [
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.print() },
      { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => win && win.loadURL(`${APP_URL}#/`) },
      { label: 'Products', accelerator: 'CmdOrCtrl+2', click: () => win && win.loadURL(`${APP_URL}#/products`) },
      { label: 'Scan', accelerator: 'CmdOrCtrl+3', click: () => win && win.loadURL(`${APP_URL}#/scan`) },
      { label: 'Invoices', accelerator: 'CmdOrCtrl+4', click: () => win && win.loadURL(`${APP_URL}#/invoices`) },
      { type: 'separator' },
      { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])] },
    { role: 'windowMenu' },
    help,
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- start
ipcMain.handle('sp:retry', (_e, url) => { if (win) win.loadURL(isAllowed(url) ? url : APP_URL); });

app.setAboutPanelOptions({ applicationName: 'Holdbay', applicationVersion: app.getVersion(), copyright: 'Holdbay by BT Design', website: 'https://btdesign.co.za' });
app.whenReady().then(async () => {
  setupPermissions();
  setupMenu();
  APP_URL = await pickAppUrl();
  createWindow();
  setupUpdates();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
// Block any webview / extra contents from being created.
app.on('web-contents-created', (_e, contents) => { contents.on('will-attach-webview', (ev) => ev.preventDefault()); });
