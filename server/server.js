const express = require('express'), http = require('http'), path = require('path');
const { Server } = require('socket.io');
const { Game } = require('./game');
const app = express();
const fs = require('fs');
const CLIENT = [path.join(__dirname, '../client'), path.join(process.cwd(), 'client')].find(d => fs.existsSync(path.join(d, 'index.html')));
if (!CLIENT) console.error('client/index.html not found', { dirname: __dirname, cwd: process.cwd(), parent: fs.readdirSync(path.join(__dirname, '..')) });
else app.use(express.static(CLIENT));
app.get('/', (req, res) => CLIENT ? res.sendFile(path.join(CLIENT, 'index.html')) : res.status(500).send('client/index.html が見つかりません。リポジトリ直下に client/ と server/ と package.json が並んでいるか確認してください。'));
const srv = http.createServer(app), io = new Server(srv);
const rooms = new Map();
const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function newCode() { let c; do { c = A[Math.random() * 24 | 0] + A[Math.random() * 24 | 0] + String(Math.random() * 1000 | 0).padStart(3, '0'); } while (rooms.has(c)); return c; }
function mk(pub) {
  const c = newCode(); let g;
  g = new Game(c, () => g.players.forEach(p => !p.bot && io.to(p.id).emit('state', g.view(p.id))));
  g.public = pub; rooms.set(c, g); return g;
}
io.on('connection', s => {
  let room = null;
  const leave = () => {
    if (!room) return; const g = room; room = null; g.remove(s.id);
    if (!g.humans().length) { clearTimeout(g.timer); rooms.delete(g.code); } else g.onUpdate();
  };
  const enter = (g, name) => {
    if (!g || g.players.length >= 6) return s.emit('err', 'ルームが見つからないか満員です');
    leave(); if (!g.add(s.id, name)) return; room = g; g.onUpdate();
  };
  const tryStart = () => { if (!room.inHand() && room.players.length >= 2 && room.humans().every(p => p.ready)) { room.players.forEach(p => p.ready = !!p.bot); room.start(); } };
  s.on('create', ({ name, vs }) => { const g = mk(false); enter(g, name); if (vs) { for (let i = 0; i < 3; i++) g.addBot(); g.get(s.id).ready = true; tryStart(); } });
  s.on('quick', ({ name }) => enter([...rooms.values()].find(g => g.public && g.players.length < 6 && !g.inHand()) || mk(true), name));
  s.on('join', ({ name, code }) => enter(rooms.get(String(code || '').toUpperCase().trim()), name));
  s.on('ready', () => { const p = room && room.get(s.id); if (!p || room.inHand()) return; p.ready = !p.ready; room.onUpdate(); tryStart(); });
  s.on('addbot', () => { if (room && !room.inHand() && room.addBot()) room.onUpdate(); });
  s.on('start', () => { if (room && room.view(s.id).host === s.id && room.players.length >= 2) room.start(); });
  s.on('action', ({ type, amount }) => { if (!room) return; const e = room.act(s.id, type, amount); if (e) s.emit('err', e); });
  s.on('draw', ({ idx }) => { if (!room) return; const e = room.draw(s.id, idx); if (e) s.emit('err', e); });
  s.on('emote', e => { if (room && ['👍', '😂', '😮', '🔥'].includes(e)) room.humans().forEach(p => io.to(p.id).emit('emote', { id: s.id, e })); });
  s.on('leave', leave); s.on('disconnect', leave);
});
srv.listen(process.env.PORT || 3000, () => console.log('listening'));
