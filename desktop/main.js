const { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer, screen } = require('electron');
const path = require('path');

let nut = null;
try { nut = require('@nut-tree-fork/nut-js'); nut.mouse.config.autoDelayMs = 0; nut.keyboard.config.autoDelayMs = 0; }
catch (e) { console.error('nut-js unavailable, remote control disabled:', e.message); }

let win, controlAllowed = false;

function webDir() { return app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web'); }

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    cb({ video: sources[0] }); // primary screen (coordinates map to primary display)
  });
  win = new BrowserWindow({ width: 1200, height: 800, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(webDir(), 'index.html'));
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
  return controlAllowed;
});

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
