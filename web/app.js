/* Shoco Meet – static WebRTC mesh meeting app. Signaling: our own PeerJS broker + TURN on meet.shocoweb.com (SSL) */
'use strict';
const PUBLIC_URL = 'https://meet.shocoweb.com/';
// Our signaling server (PeerJS broker behind nginx with SSL) and the endpoint that hands out time-limited TURN credentials
const SIGNAL = { host: 'meet.shocoweb.com', port: 443, path: '/peerjs', secure: true };
const TURN_URL = 'https://meet.shocoweb.com/turn';
const PREFIX = 'shocomeet-';
let ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }; // fallback until /turn answers
const isDesktop = !!window.shocoDesktop;
const $ = (id) => document.getElementById(id);

let peer, room, myName, camStream, outStream, screenTrack = null, recorder = null, isHost = false;
const peers = new Map(); // id -> {data, call, name, desktop, tile, stream}
let controllerId = null; // (desktop side) who controls us
let controlling = null;  // (browser side) id we control

const qs = new URLSearchParams(location.search);
$('room').value = qs.get('room') || '';
$('name').value = localStorage.getItem('shoco-name') || qs.get('name') || '';
$('joinBtn').onclick = start;

/* ---------- Enter through the desktop app, not the browser ----------
   Browser + invite link: try to open the installed app (shocomeet://join?room=...), show the button + download.
   Desktop app opened by such a link: room (and the Windows user name) arrive as query params -> join at once. */
const APP_LINK = (r) => 'shocomeet://join?room=' + encodeURIComponent(r);
const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
if (isDesktop) {
  if ($('room').value && $('name').value) setTimeout(start, 100);
} else if ($('room').value && !isMobile) {
  const r = sanitize($('room').value);
  $('appOpen').hidden = false; $('lobby').insertBefore($('appOpen'), $('name')); // app first, browser below
  $('openApp').href = APP_LINK(r);
  $('joinBtn').textContent = 'הצטרף מהדפדפן';
  $('joinBtn').classList.remove('primary');
  if (/Mac/i.test(navigator.userAgent)) { $('lobbyDl').href = 'https://github.com/haimnet08/shoco-meet/releases/latest/download/Shoco-Meet-mac.dmg'; $('lobbyDl').textContent = 'הורד ל-Mac'; }
  setTimeout(() => { try { location.href = APP_LINK(r); } catch (e) {} }, 300); // Chrome asks "open Shoco Meet?" if installed; silent if not
}

function baseUrl() { return location.protocol.startsWith('http') ? location.origin + location.pathname : PUBLIC_URL; }
function status(t) { $('status').textContent = t; }
function sanitize(s) { return s.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40); }

async function getCam() {
  try { return await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); } catch (e) {}
  let s;
  try { s = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e) { s = new MediaStream(); }
  // placeholder video track so screen share can replaceTrack later
  const c = Object.assign(document.createElement('canvas'), { width: 640, height: 360 });
  const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, 640, 360);
  g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.textAlign = 'center'; g.fillText(myName, 320, 190);
  const ct = c.captureStream(5).getVideoTracks()[0];
  setInterval(() => { g.fillRect(0, 0, 1, 1); }, 1000);
  s.addTrack(ct);
  return s;
}

async function start() {
  myName = ($('name').value.trim() || 'אורח').slice(0, 30);
  localStorage.setItem('shoco-name', myName);
  room = sanitize($('room').value) || Math.random().toString(36).slice(2, 10);
  $('lobbyMsg').textContent = 'מתחבר...';
  const [cam] = await Promise.all([getCam(), loadIce()]);
  camStream = cam;
  outStream = new MediaStream(camStream.getTracks());
  history.replaceState(null, '', location.protocol.startsWith('http') ? '?room=' + room : location.href);
  const link = baseUrl() + '?room=' + room;
  $('roomLabel').textContent = 'חדר: ' + room;
  $('waBtn').href = 'https://wa.me/?text=' + encodeURIComponent('הצטרף לפגישה שלי ב-Shoco Meet: ' + link + '\n(אם תוכנת Shoco Meet מותקנת אצלך, הקישור יפתח אותה ישירות)');
  $('copyBtn').onclick = () => navigator.clipboard.writeText(link).then(() => status('הקישור הועתק'));
  $('lobby').hidden = true; $('meeting').hidden = false;
  addTile('me', myName + ' (אני)', outStream, true);
  connectPeer(PREFIX + room);
  if (isDesktop) setTimeout(() => toggleShare().catch(() => {}), 500);
}

// TURN credentials from our server (valid 12h); without them only direct/STUN connections work
async function loadIce() {
  try {
    const r = await fetch(TURN_URL, { cache: 'no-store' });
    const j = await r.json();
    if (j && Array.isArray(j.iceServers) && j.iceServers.length) ICE = { iceServers: j.iceServers };
  } catch (e) { console.warn('TURN credentials unavailable, STUN only', e); }
}

function connectPeer(id) {
  const opts = { ...SIGNAL, config: ICE };
  peer = id ? new Peer(id, opts) : new Peer(opts);
  peer.on('open', (myId) => {
    isHost = myId === PREFIX + room;
    status(isHost ? 'ממתין למשתתפים...' : 'מחובר');
    if (!isHost) link(PREFIX + room);
  });
  peer.on('error', (e) => {
    if (e.type === 'unavailable-id') { peer.destroy(); connectPeer(null); return; }
    if (e.type === 'peer-unavailable') { status('המשתתף לא זמין'); return; }
    if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'socket-closed') { status('אין חיבור לשרת הפגישות (meet.shocoweb.com)'); return; }
    status('שגיאה: ' + e.type);
  });
  peer.on('connection', (c) => setupData(c));
  peer.on('call', (call) => { call.answer(outStream); setupCall(call); });
}

function entry(id) { if (!peers.has(id)) peers.set(id, { name: id.slice(-4) }); return peers.get(id); }

function link(id) {
  if (id === peer.id || (peers.get(id) || {}).data) return;
  setupData(peer.connect(id, { reliable: true, metadata: { name: myName, desktop: isDesktop } }));
  setupCall(peer.call(id, outStream, { metadata: { name: myName } }));
}

function setupData(c) {
  const p = entry(c.peer); p.data = c;
  if (c.metadata) { p.name = c.metadata.name || p.name; p.desktop = !!c.metadata.desktop; }
  c.on('open', () => {
    c.send({ type: 'hello', name: myName, desktop: isDesktop });
    if (isHost) c.send({ type: 'peers', list: [...peers.keys()].filter((k) => k !== c.peer && peers.get(k).data) });
  });
  c.on('data', (m) => onData(c.peer, m));
  c.on('close', () => drop(c.peer));
}

function setupCall(call) {
  const p = entry(call.peer); p.call = call;
  call.on('stream', (s) => { p.stream = s; addTile(call.peer, p.name, s); });
  call.on('close', () => drop(call.peer));
}

function drop(id) {
  const p = peers.get(id); if (!p) return;
  peers.delete(id); p.tile && p.tile.remove(); layoutTiles();
  if (controllerId === id) controllerId = null;
  if (controlling === id) controlling = null;
  if (p.call) p.call.close(); if (p.data) p.data.close();
}

function send(id, m) { const p = peers.get(id); if (p && p.data && p.data.open) p.data.send(m); }
function broadcast(m) { for (const id of peers.keys()) send(id, m); }

async function onData(id, m) {
  const p = entry(id);
  switch (m.type) {
    case 'hello': p.name = String(m.name).slice(0, 30); p.desktop = !!m.desktop; refreshTile(id); break;
    case 'peers': m.list.forEach(link); break;
    case 'chat': addMsg(p.name, m.text); break;
    case 'ctrl-req':
      if (!isDesktop) return send(id, { type: 'ctrl-res', ok: false });
      const ok = await window.shocoDesktop.askConsent(p.name);
      if (ok) controllerId = id;
      send(id, { type: 'ctrl-res', ok });
      break;
    case 'ctrl-res':
      if (m.ok) { controlling = id; refreshTile(id); addMsg('מערכת', 'השליטה אושרה – ' + p.name); }
      else addMsg('מערכת', 'הבקשה לשליטה נדחתה');
      break;
    case 'ctrl-end': if (controllerId === id) controllerId = null; if (controlling === id) { controlling = null; refreshTile(id); } break;
    case 'in': if (isDesktop && controllerId === id) window.shocoDesktop.input(m.e); break;
  }
}

/* ---------- UI ---------- */
function addTile(id, name, stream, muted) {
  const p = id === 'me' ? null : entry(id);
  let tile = id === 'me' ? $('tile-me') : p.tile;
  if (!tile) {
    tile = document.createElement('div'); tile.className = 'tile'; tile.id = 'tile-' + id;
    tile.innerHTML = '<video autoplay playsinline></video><span class="label"></span>';
    $('videos').appendChild(tile);
    if (p) p.tile = tile;
    layoutTiles();
  }
  const v = tile.querySelector('video'); v.srcObject = stream; v.muted = !!muted;
  tile.querySelector('.label').textContent = name;
  if (p) { refreshTile(id); attachControl(id, v); }
}

// Gallery layout: pick the column count that gives every 16:9 tile the largest size inside the
// visible area, so all tiles share one height and nothing is cut off or scrolled (phones, small
// or scaled Windows windows). Re-run on every tile change and whenever the area resizes.
function layoutTiles() {
  const box = $('videos'), n = box.children.length; if (!n) return;
  const gap = 8, W = box.clientWidth - 16, H = box.clientHeight - 16;
  let best = { cols: 1, rows: n, size: -1 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const tw = (W - gap * (cols - 1)) / cols, th = (H - gap * (rows - 1)) / rows;
    const size = Math.min(tw / 16, th / 9);
    if (size > best.size) best = { cols, rows, size };
  }
  box.style.gridTemplateColumns = `repeat(${best.cols},minmax(0,1fr))`;
  box.style.gridTemplateRows = `repeat(${best.rows},minmax(0,1fr))`;
}
new ResizeObserver(() => layoutTiles()).observe($('videos'));

function refreshTile(id) {
  const p = peers.get(id); if (!p || !p.tile) return;
  p.tile.querySelector('.label').textContent = p.name + (p.desktop ? ' 🖥️' : '');
  let b = p.tile.querySelector('.ctrl');
  if (p.desktop && !isDesktop) {
    if (!b) { b = document.createElement('button'); b.className = 'ctrl'; p.tile.appendChild(b); }
    b.textContent = controlling === id ? 'הפסק שליטה' : '🖱️ בקש שליטה';
    b.onclick = () => {
      if (controlling === id) { send(id, { type: 'ctrl-end' }); controlling = null; refreshTile(id); }
      else { send(id, { type: 'ctrl-req' }); addMsg('מערכת', 'נשלחה בקשת שליטה ל-' + p.name); }
    };
  }
  p.tile.classList.toggle('controlling', controlling === id);
}

function addMsg(who, text) {
  const d = document.createElement('div'); const b = document.createElement('b');
  b.textContent = who + ': '; d.append(b);
  // plain text, with http(s) links made clickable
  String(text).split(/(https?:\/\/[^\s<>"']+)/).forEach((part, i) => {
    if (i % 2) { const a = document.createElement('a'); a.href = part; a.textContent = part; a.target = '_blank'; a.rel = 'noopener'; d.append(a); }
    else if (part) d.append(document.createTextNode(part));
  });
  $('msgs').appendChild(d); $('msgs').scrollTop = 1e9;
}
$('chatForm').onsubmit = (e) => {
  e.preventDefault(); const t = $('chatInput').value.trim(); if (!t) return;
  broadcast({ type: 'chat', text: t.slice(0, 2000) }); addMsg(myName, t); $('chatInput').value = '';
};
$('chatToggle').onclick = () => $('chat').classList.toggle('hidden');

/* ---------- Desktop app download (for remote control) ---------- */
const RELEASES = 'https://github.com/haimnet08/shoco-meet/releases/latest';
if (isDesktop) $('dlBtn').hidden = true; // already installed
$('dlBtn').onclick = () => {
  $('dlRoom').textContent = room;
  const ua = navigator.userAgent, mine = /Windows/i.test(ua) ? 'dlWin' : /Mac/i.test(ua) ? 'dlMac' : /Linux|X11/i.test(ua) ? 'dlLinux' : '';
  ['dlWin', 'dlMac', 'dlLinux'].forEach((id) => $(id).classList.toggle('mine', id === mine));
  $('dl').showModal();
  // point the buttons at the real files of the latest release (names may change between versions)
  fetch('https://api.github.com/repos/haimnet08/shoco-meet/releases/latest').then((r) => r.json()).then((rel) => {
    (rel.assets || []).forEach((a) => {
      const id = /\.exe$/i.test(a.name) ? 'dlWin' : /\.dmg$/i.test(a.name) ? 'dlMac' : /\.AppImage$/i.test(a.name) ? 'dlLinux' : null;
      if (id) $(id).href = a.browser_download_url;
    });
  }).catch(() => {});
};
$('dlClose').onclick = () => $('dl').close();
$('dlChat').onclick = () => {
  const t = 'כדי שאוכל לשלוט במחשב שלך: הורד והתקן את Shoco Meet מכאן ' + RELEASES + ' , פתח את התוכנה והצטרף לחדר ' + room + ' (או לחץ על "שליטה מרחוק" למטה להסבר).';
  broadcast({ type: 'chat', text: t }); addMsg(myName, t); $('chat').classList.remove('hidden'); $('dl').close();
};

$('micBtn').onclick = () => {
  const t = camStream.getAudioTracks(); if (!t.length) return status('אין מיקרופון');
  t.forEach((x) => (x.enabled = !x.enabled));
  $('micBtn').textContent = t[0].enabled ? '🎤 השתק' : '🔇 בטל השתקה'; $('micBtn').classList.toggle('on', !t[0].enabled);
};
$('camBtn').onclick = () => {
  const t = camStream.getVideoTracks()[0]; t.enabled = !t.enabled;
  $('camBtn').textContent = t.enabled ? '📷 כבה מצלמה' : '📷 הדלק מצלמה'; $('camBtn').classList.toggle('on', !t.enabled);
};

function replaceVideo(track) {
  outStream.getVideoTracks().forEach((t) => outStream.removeTrack(t)); outStream.addTrack(track);
  for (const p of peers.values()) {
    const pc = p.call && p.call.peerConnection; if (!pc) continue;
    pc.getSenders().filter((s) => s.track && s.track.kind === 'video').forEach((s) => s.replaceTrack(track));
  }
  $('tile-me').querySelector('video').srcObject = outStream;
}
async function toggleShare() {
  if (screenTrack) { screenTrack.stop(); return; }
  const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
  screenTrack = s.getVideoTracks()[0];
  replaceVideo(screenTrack); $('shareBtn').classList.add('on'); $('shareBtn').textContent = '🖥️ הפסק שיתוף';
  screenTrack.onended = () => {
    screenTrack = null; replaceVideo(camStream.getVideoTracks()[0]);
    $('shareBtn').classList.remove('on'); $('shareBtn').textContent = '🖥️ שיתוף מסך';
  };
}
$('shareBtn').onclick = () => toggleShare().catch((e) => status('שיתוף מסך בוטל: ' + e.name));

/* ---------- Recording (local, webm) ---------- */
$('recBtn').onclick = async () => {
  if (recorder) { recorder.stop(); return; }
  let disp;
  try { disp = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true }); }
  catch (e) { return status('הקלטה בוטלה'); }
  const ac = new AudioContext(); const dest = ac.createMediaStreamDestination();
  const srcs = [disp, camStream, ...[...peers.values()].map((p) => p.stream).filter(Boolean)];
  srcs.forEach((s) => { if (s.getAudioTracks().length) ac.createMediaStreamSource(s).connect(dest); });
  const mix = new MediaStream([...disp.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const chunks = []; recorder = new MediaRecorder(mix, mime ? { mimeType: mime } : {});
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    disp.getTracks().forEach((t) => t.stop()); ac.close(); recorder = null;
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    a.download = 'shoco-meet-' + room + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.webm'; a.click();
    $('recBtn').classList.remove('on'); $('recBtn').textContent = '⏺️ הקלטה';
  };
  disp.getVideoTracks()[0].onended = () => recorder && recorder.stop();
  recorder.start(1000); $('recBtn').classList.add('on'); $('recBtn').textContent = '⏹️ עצור הקלטה';
};

$('leaveBtn').onclick = () => { if (recorder) recorder.stop(); peer && peer.destroy(); setTimeout(() => location.reload(), 300); };

/* ---------- Remote control (controller side) ---------- */
function norm(v, ev) {
  const r = v.getBoundingClientRect(), vw = v.videoWidth || 16, vh = v.videoHeight || 9;
  const sc = Math.min(r.width / vw, r.height / vh), w = vw * sc, h = vh * sc;
  const x = (ev.clientX - r.left - (r.width - w) / 2) / w, y = (ev.clientY - r.top - (r.height - h) / 2) / h;
  return x < 0 || y < 0 || x > 1 || y > 1 ? null : { x, y };
}
function attachControl(id, v) {
  if (v.dataset.ctrl) return; v.dataset.ctrl = 1;
  let last = 0;
  const on = () => controlling === id;
  v.addEventListener('mousemove', (ev) => {
    if (!on() || Date.now() - last < 30) return; last = Date.now();
    const p = norm(v, ev); p && send(id, { type: 'in', e: { t: 'move', ...p } });
  });
  ['mousedown', 'mouseup'].forEach((n) => v.addEventListener(n, (ev) => {
    if (!on()) return; ev.preventDefault(); const p = norm(v, ev);
    p && send(id, { type: 'in', e: { t: n === 'mousedown' ? 'down' : 'up', b: ev.button, ...p } });
  }));
  v.addEventListener('contextmenu', (ev) => on() && ev.preventDefault());
  v.addEventListener('wheel', (ev) => { if (!on()) return; ev.preventDefault(); send(id, { type: 'in', e: { t: 'wheel', dy: Math.sign(ev.deltaY), dx: Math.sign(ev.deltaX) } }); }, { passive: false });
}
['keydown', 'keyup'].forEach((n) => window.addEventListener(n, (ev) => {
  if (!controlling || document.activeElement === $('chatInput')) return;
  ev.preventDefault();
  send(controlling, { type: 'in', e: { t: n === 'keydown' ? 'kdown' : 'kup', key: ev.key, code: ev.code } });
}));
