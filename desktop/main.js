const { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer, screen, shell } = require('electron');
const path = require('path');
const os = require('os');
let autoUpdater = null;
try { ({ autoUpdater } = require('electron-updater')); } catch (e) { console.error('electron-updater unavailable:', e.message); }

let nut = null;
try { nut = require('@nut-tree-fork/nut-js'); nut.mouse.config.autoDelayMs = 0; nut.keyboard.config.autoDelayMs = 0; }
catch (e) { console.error('nut-js unavailable, remote control disabled:', e.message); }

let win, controlAllowed = false;

function webDir() { return app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web'); }

/* ---------- shocomeet://join?room=<code> links (sent by the web page / WhatsApp) ---------- */
const PROTO = 'shocomeet';
function roomFromUrl(u) {
  try { const x = new URL(u); if (x.protocol !== PROTO + ':') return null; return (x.searchParams.get('room') || x.hostname || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || null; }
  catch (e) { return null; }
}
function roomFromArgv(argv) { for (const a of argv) { const r = roomFromUrl(a); if (r) return r; } return null; }
let pendingRoom = roomFromArgv(process.argv);
function userName() { try { return os.userInfo().username; } catch (e) { return ''; } }
function openRoom(room) {
  const q = { name: userName() }; if (room) q.room = room;
  win && win.loadFile(path.join(webDir(), 'index.html'), { query: q });
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', (_e, argv) => {
  const r = roomFromArgv(argv);
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); if (r) openRoom(r); }
});
app.on('open-url', (e, url) => { e.preventDefault(); const r = roomFromUrl(url); if (!r) return; if (win) openRoom(r); else pendingRoom = r; }); // macOS

/* ---------- Auto-update from GitHub Releases ----------
   Windows/Linux: download in the background, install on the next quit (or now, from the in-app banner).
   macOS: unsigned builds cannot self-install, so only announce the new version with a download link. */
const RELEASES_URL = 'https://github.com/haimnet08/shoco-meet/releases/latest';
function setupUpdates() {
  if (!autoUpdater || !app.isPackaged || process.windowsStore) return; // Store builds are updated by the Microsoft Store
  autoUpdater.logger = null;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoDownload = process.platform !== 'darwin';
  autoUpdater.on('error', (e) => console.error('update error:', e && e.message));
  autoUpdater.on('update-downloaded', (info) => win && win.webContents.send('update-ready', info.version));
  if (process.platform === 'darwin') {
    autoUpdater.on('update-available', async (info) => {
      const r = await dialog.showMessageBox(win, { type: 'info', buttons: ['הורד / Download', 'אחר כך / Later'], defaultId: 0, cancelId: 1,
        title: 'Shoco Meet', message: `גרסה ${info.version} זמינה / Version ${info.version} is available`, detail: 'הורד והתקן מהאתר. / Download and install from the releases page.' });
      if (r.response === 0) shell.openExternal(RELEASES_URL);
    });
  }
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 5000);
  setInterval(check, 6 * 3600 * 1000);
}
ipcMain.handle('version', () => app.getVersion());
ipcMain.on('install-update', () => { if (autoUpdater) { try { autoUpdater.quitAndInstall(false, true); } catch (e) { console.error(e.message); } } });

app.whenReady().then(() => {
  if (app.isPackaged) { try { app.setAsDefaultProtocolClient(PROTO); } catch (e) {} }
  setupUpdates();
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const primary = String(screen.getPrimaryDisplay().id);
    cb({ video: sources.find((s) => String(s.display_id) === primary) || sources[0] }); // remote-control coordinates map to the primary display
  });
  win = new BrowserWindow({ width: 1200, height: 800, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  win.setMenuBarVisibility(false);
  openRoom(pendingRoom); pendingRoom = null;
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('consent', async (_e, name) => {
  if (!nut) { dialog.showErrorBox('Shoco Meet', 'רכיב השליטה מרחוק לא נטען במחשב זה'); return false; }
  const r = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['אשר שליטה / Allow', 'דחה / Deny'], defaultId: 1, cancelId: 1,
    title: 'בקשת שליטה מרחוק',
    message: `${name} מבקש לשלוט בעכבר ובמקלדת שלך.\n${name} requests control of your mouse & keyboard.`,
    detail: 'אשר רק אם אתה סומך על האדם הזה. ניתן לעצור בכל רגע ע"י סגירת האפליקציה.',
  });
  controlAllowed = r.response === 0;
  if (controlAllowed && win) win.minimize(); // get out of the way: the shared screen should show the desktop, not this window
  return controlAllowed;
});
ipcMain.on('control-ended', () => { controlAllowed = false; if (win && win.isMinimized()) { win.restore(); win.focus(); } });

const BTN = () => [nut.Button.LEFT, nut.Button.MIDDLE, nut.Button.RIGHT];
function mapKey(code, key) {
  const K = nut.Key;
  if (/^Key[A-Z]$/.test(code)) return K[code.slice(3)];
  if (/^Digit\d$/.test(code)) return K['Num' + code.slice(5)];
  if (/^F\d+$/.test(code)) return K[code];
  const m = { Enter: 'Enter', Backspace: 'Backspace', Tab: 'Tab', Escape: 'Escape', Space: 'Space', Delete: 'Delete',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Home: 'Home', End: 'End',
    PageUp: 'PageUp', PageDown: 'PageDown', ShiftLeft: 'LeftShift', ShiftRight: 'RightShift',
    ControlLeft: 'LeftControl', ControlRight: 'RightControl', AltLeft: 'LeftAlt', AltRight: 'RightAlt',
    MetaLeft: 'LeftSuper', MetaRight: 'RightSuper', CapsLock: 'CapsLock', Minus: 'Minus', Equal: 'Equal',
    BracketLeft: 'LeftBracket', BracketRight: 'RightBracket', Semicolon: 'Semicolon', Quote: 'Quote',
    Comma: 'Comma', Period: 'Period', Slash: 'Slash', Backslash: 'Backslash', Backquote: 'Grave' };
  return m[code] !== undefined ? K[m[code]] : undefined;
}

let queue = Promise.resolve();
ipcMain.on('input', (_e, ev) => {
  if (!nut || !controlAllowed || !ev) return;
  queue = queue.then(() => handle(ev)).catch((err) => console.error(err.message));
});
async function handle(ev) {
  const { bounds, scaleFactor } = screen.getPrimaryDisplay();
  const f = process.platform === 'win32' ? scaleFactor : 1; // nut-js uses physical pixels on Windows
  const pt = () => new nut.Point(Math.round((bounds.x + ev.x * bounds.width) * f), Math.round((bounds.y + ev.y * bounds.height) * f));
  switch (ev.t) {
    case 'move': return nut.mouse.setPosition(pt());
    case 'down': await nut.mouse.setPosition(pt()); return nut.mouse.pressButton(BTN()[ev.b] ?? nut.Button.LEFT);
    case 'up': await nut.mouse.setPosition(pt()); return nut.mouse.releaseButton(BTN()[ev.b] ?? nut.Button.LEFT);
    case 'wheel': return ev.dy > 0 ? nut.mouse.scrollDown(3) : ev.dy < 0 ? nut.mouse.scrollUp(3) : null;
    case 'kdown': case 'kup': {
      const k = mapKey(String(ev.code), String(ev.key)); if (k === undefined) return;
      return ev.t === 'kdown' ? nut.keyboard.pressKey(k) : nut.keyboard.releaseKey(k);
    }
  }
}
