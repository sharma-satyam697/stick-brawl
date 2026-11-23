#!/usr/bin/env node
// Stick Brawl server.
// 1. Serves the game files (index.html, game.js, characters.js, photos/).
// 2. Runs a WebSocket endpoint at /ws that puts two players with the same room name together
//    and passes their messages to each other.
// No packages are needed. Run:  npm start   (or: node server.js)
// Set the PORT environment variable to use a port other than 3000.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const MAX_MSG = 1 << 20;              // drop clients that send a message bigger than 1 MB
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SERVER_TYPES = new Set(['joined', 'ready', 'left', 'full', 'error']);   // players may not send these

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const PUBLIC_FILES = new Set(['/index.html', '/game.js', '/characters.js']);

// ---------- static files ----------
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  if (p === '/') p = '/index.html';
  const ext = path.extname(p).toLowerCase();
  const isPhoto = p.startsWith('/photos/') && TYPES[ext] && !p.includes('..') && !p.includes('\0');
  if (!PUBLIC_FILES.has(p) && !isPhoto) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(404).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- WebSocket (RFC 6455, text messages only) ----------
const clients = new Set();

class Client {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.parts = null; this.partsLen = 0;
    this.room = null; this.alive = true; this.closed = false;
    clients.add(this);
    socket.setNoDelay(true);
    socket.on('data', d => this.onData(d));
    socket.on('close', () => this.onClose());
    socket.on('error', () => socket.destroy());
  }
  onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        const big = b.readBigUInt64BE(2);
        if (big > BigInt(MAX_MSG)) return this.kill();
        len = Number(big); off = 10;
      }
      if (len > MAX_MSG || !masked) return this.kill();   // browsers always mask what they send
      if (b.length < off + 4 + len) return;               // wait for the rest of the frame
      const mask = b.subarray(off, off + 4);
      const data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);

      if (op === 0x8) { this.sendFrame(0x8, Buffer.alloc(0)); return this.kill(); }   // close
      if (op === 0x9) { this.sendFrame(0xA, data); continue; }                          // ping -> pong
      if (op === 0xA) { this.alive = true; continue; }                                  // pong
      if (op === 0x1 || op === 0x2) { this.parts = [data]; this.partsLen = data.length; }
      else if (op === 0x0 && this.parts) { this.parts.push(data); this.partsLen += data.length; }
      else continue;
      if (this.partsLen > MAX_MSG) return this.kill();
      if (fin) {
        const msg = Buffer.concat(this.parts).toString('utf8');
        this.parts = null; this.partsLen = 0;
        this.onMessage(msg);
        if (this.closed) return;
      }
    }
  }
  sendFrame(op, payload) {
    if (this.closed) return;
    const n = payload.length; let head;
    if (n < 126) { head = Buffer.alloc(2); head[1] = n; }
    else if (n < 65536) { head = Buffer.alloc(4); head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    head[0] = 0x80 | op;
    this.socket.write(Buffer.concat([head, payload]));
  }
  sendText(s) { this.sendFrame(0x1, Buffer.from(s, 'utf8')); }
  sendJSON(o) { this.sendText(JSON.stringify(o)); }
  onMessage(text) {
    let m;
    try { m = JSON.parse(text); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!this.room) { if (m.t === 'join') join(this, m.room); return; }
    if (SERVER_TYPES.has(m.t)) return;
    const peer = peerOf(this);
    if (peer) peer.sendText(text);   // pass the message to the other player unchanged
  }
  kill() { this.socket.destroy(); this.onClose(); }
  onClose() {
    if (this.closed) return;
    this.closed = true; clients.delete(this); leave(this);
  }
}

server.on('upgrade', (req, socket) => {
  let pathname = '';
  try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { /* bad url */ }
  const key = req.headers['sec-websocket-key'];
  if (pathname !== '/ws' || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  new Client(socket);
});

// Ping every client every 25 s. Close the ones that did not answer the last ping.
// This also keeps the connection open on hosts that close quiet connections.
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) { c.kill(); continue; }
    c.alive = false; c.sendFrame(0x9, Buffer.alloc(0));
  }
}, 25000).unref();

// ---------- rooms ----------
// rooms: name -> list of clients. The client at index 0 is the host.
const rooms = new Map();

function cleanRoom(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
}
function join(c, raw) {
  const name = cleanRoom(raw);
  if (!name) { c.sendJSON({ t: 'error', msg: 'Room name is empty.' }); return; }
  let list = rooms.get(name);
  if (!list) { list = []; rooms.set(name, list); }
  if (list.length >= 2) { c.sendJSON({ t: 'full' }); return; }
  c.room = name; list.push(c);
  c.sendJSON({ t: 'joined', role: list.length - 1, room: name });
  log(`room "${name}": ${list.length}/2 players`);
  if (list.length === 2) for (const x of list) x.sendJSON({ t: 'ready' });
}
function leave(c) {
  if (!c.room) return;
  const name = c.room, list = rooms.get(name);
  c.room = null;
  if (!list) return;
  const i = list.indexOf(c);
  if (i >= 0) list.splice(i, 1);
  if (!list.length) { rooms.delete(name); log(`room "${name}" closed`); return; }
  // the player who stays becomes the host and waits for a new opponent
  list[0].sendJSON({ t: 'left' });
  log(`room "${name}": 1/2 players`);
}
function peerOf(c) {
  const list = rooms.get(c.room);
  return list ? list.find(x => x !== c) : null;
}

function log(s) { console.log(`[${new Date().toLocaleTimeString()}] ${s}`); }

// ---------- start ----------
server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use. Try: PORT=3001 npm start`);
  else console.error(err);
  process.exit(1);
});
server.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => `http://${a.address}:${PORT}`);
  console.log('\n  STICK BRAWL is running\n');
  console.log(`  On this computer:      http://localhost:${PORT}`);
  for (const u of lan) console.log(`  Same Wi-Fi / network:  ${u}`);
  console.log('\n  Click "Online", type a room name, and ask your friend to type the same name.');
  console.log('  Press Ctrl+C to stop.\n');
});
