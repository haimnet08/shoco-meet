// Shoco Meet signaling server: PeerJS broker on 127.0.0.1:9000 (behind nginx at https://meet.shocoweb.com/peerjs)
// plus /turn, which hands out time-limited coturn credentials (TURN REST API, HMAC-SHA1 with the shared secret).
'use strict';
const express = require('express');
const crypto = require('crypto');
const { ExpressPeerServer } = require('peer');

const PORT = Number(process.env.PORT || 9000);
const HOST = process.env.TURN_HOST || 'meet.shocoweb.com';
const SECRET = process.env.TURN_SECRET || '';
const TTL = 12 * 3600; // seconds a credential stays valid

const app = express();
app.set('trust proxy', 'loopback');

app.get('/turn', (req, res) => {
  const iceServers = [{ urls: ['stun:' + HOST + ':3478', 'stun:stun.l.google.com:19302'] }];
  if (SECRET) {
    const username = (Math.floor(Date.now() / 1000) + TTL) + ':shoco';
    const credential = crypto.createHmac('sha1', SECRET).update(username).digest('base64');
    iceServers.push({
      urls: ['turn:' + HOST + ':3478?transport=udp', 'turn:' + HOST + ':3478?transport=tcp', 'turns:' + HOST + ':5349?transport=tcp'],
      username, credential,
    });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ iceServers, ttl: TTL });
});
app.get('/healthz', (_req, res) => res.json({ ok: true, peers: peerServer ? peerServer._clientsCount : null }));

const server = app.listen(PORT, '127.0.0.1', () => console.log('shoco-meet signaling on 127.0.0.1:' + PORT));
const peerServer = ExpressPeerServer(server, { path: '/', proxied: true, allow_discovery: false, alive_timeout: 60000 });
peerServer.on('connection', (c) => console.log('peer open', c.getId()));
peerServer.on('disconnect', (c) => console.log('peer closed', c.getId()));
app.use('/peerjs', peerServer);
