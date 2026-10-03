const socket = io(), $ = s => document.querySelector(s), app = $('#app');
const cfg = Object.assign({ se: true, vol: .5, anim: true, name: '', w: 0, l: 0 }, JSON.parse(localStorage.pk || '{}'));
const save = () => localStorage.pk = JSON.stringify(cfg);
let S = null, screen = 'title', seen = new Set(), lobbySeen = new Set(), lastPhase = '', lastN = 0, counted = false;
// audio: WebAudio synth placeholder (swap for files in assets/sounds)
let ac;
function beep(f, d = .08, t = 'sine') {
  if (!cfg.se || !cfg.vol) return; ac = ac || new AudioContext();
  const o = ac.createOscillator(), g = ac.createGain(); o.type = t; o.frequency.value = f;
  g.gain.value = .18 * cfg.vol; g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d);
  o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
}
const SE = { click: () => beep(700, .03), deal: () => beep(900, .05, 'square'), chip: () => beep(1400, .06, 'triangle'), fold: () => beep(200, .15, 'sawtooth'),
  raise: () => { beep(600); setTimeout(() => beep(900, .1), 80); }, win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, .2), i * 120)), lose: () => beep(150, .4, 'triangle') };
function toast(t) { const e = $('#toast'); e.textContent = t; e.className = 'on'; setTimeout(() => e.className = '', 2000); }
const go = n => { screen = n; render(); SE.click(); };
function render() { document.body.classList.toggle('noanim', !cfg.anim); ({ title, home, join, settings, game })[screen](); }
const scr = h => app.innerHTML = `<div class="scr">${h}</div>`;
function title() {
  scr(`<h1>NEON <b>DRAW</b></h1><input id="nm" maxlength="12" placeholder="PLAYER NAME" value="${cfg.name}"><button class="main" id="go">ENTER</button>`);
  $('#go').onclick = () => { cfg.name = $('#nm').value.trim() || 'PLAYER'; save(); go('home'); };
}
function home() {
  const t = cfg.w + cfg.l;
  scr(`<h1>NEON <b>DRAW</b></h1><p class="mut">${cfg.name} · WIN ${cfg.w} / LOSE ${cfg.l} · ${t ? Math.round(cfg.w / t * 100) : 0}%</p>
  <button class="main" id="q">QUICK MATCH</button><button id="c">CREATE ROOM</button><button id="j">JOIN ROOM</button><button id="v" class="pu">VS COM</button><button id="s">SETTINGS</button>`);
  $('#q').onclick = () => socket.emit('quick', { name: cfg.name }); $('#c').onclick = () => socket.emit('create', { name: cfg.name });
  $('#v').onclick = () => socket.emit('create', { name: cfg.name, vs: true }); $('#j').onclick = () => go('join'); $('#s').onclick = () => go('settings');
}
function join() {
  scr(`<h2>JOIN ROOM</h2><input id="cd" maxlength="5" placeholder="DG846" style="text-align:center;text-transform:uppercase"><button class="main" id="ok">JOIN</button><button id="bk">BACK</button>`);
  $('#ok').onclick = () => socket.emit('join', { name: cfg.name, code: $('#cd').value }); $('#bk').onclick = () => go('home');
}
function settings() {
  scr(`<h2>SETTINGS</h2><label class="pl">SE <input type="checkbox" id="se" ${cfg.se ? 'checked' : ''}></label>
  <label class="pl">SE VOLUME <input type="range" id="vo" min="0" max="1" step=".05" value="${cfg.vol}"></label>
  <label class="pl">ANIMATION <input type="checkbox" id="an" ${cfg.anim ? 'checked' : ''}></label><button id="bk">BACK</button>`);
  $('#se').onchange = e => { cfg.se = e.target.checked; save(); }; $('#vo').oninput = e => { cfg.vol = +e.target.value; save(); beep(800); };
  $('#an').onchange = e => { cfg.anim = e.target.checked; save(); render(); }; $('#bk').onclick = () => go('home');
}
function lobby() {
  const s = S;
  scr(`<h2>ROOM <b class="code" id="cp">${s.code}</b></h2><p class="mut">${s.players.length} / 6 PLAYERS · TAP CODE TO COPY</p>
  ${s.players.map(p => { const c = lobbySeen.has(p.id) ? '' : 'in'; lobbySeen.add(p.id); return `<div class="pl ${p.ready ? 'rdy' : ''} ${c}">${p.name}${p.id === s.me ? ' (YOU)' : ''}<span>${p.bot ? 'COM' : p.ready ? 'READY' : '...'}</span></div>`; }).join('')}
  <button class="main" id="rd">READY</button><div class="row"><button id="ab">ADD COM</button>${s.host === s.me ? '<button id="st" class="pu">START</button>' : ''}</div><button id="lv">LEAVE</button>`);
  $('#cp').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(s.code); toast('COPIED ' + s.code); };
  $('#rd').onclick = () => socket.emit('ready'); $('#ab').onclick = () => socket.emit('addbot');
  if ($('#st')) $('#st').onclick = () => socket.emit('start');
  $('#lv').onclick = leave;
}
function leave() { socket.emit('leave'); S = null; lobbySeen.clear(); go('home'); }
const R = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }, SU = { s: '♠', h: '♥', d: '♦', c: '♣' };
function card(c, cls = '') {
  if (!c) return `<div class="card back ${cls}"></div>`;
  return `<div class="card ${c.s === 'h' || c.s === 'd' ? 'red' : ''} ${cls}">${R[c.r] || c.r}<i>${SU[c.s]}</i></div>`;
}
const PJ = { BET1: '第1ベット', DRAW: 'カード交換', BET2: '第2ベット', RESULT: '結果' };
const HJ = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ', 'ロイヤルフラッシュ'];
const HE = ['HIGH CARD', 'PAIR', 'TWO PAIR', 'THREE OF A KIND', 'STRAIGHT', 'FLUSH', 'FULL HOUSE', 'FOUR OF A KIND', 'STRAIGHT FLUSH', 'ROYAL FLUSH'];
let sel = new Set();
function game() {
  const s = S; if (!s) return home();
  if (s.phase === 'LOBBY') return lobby();
  if (s.phase === 'BET1' && lastPhase !== 'BET1') seen.clear(); lastPhase = s.phase;
  const myDraw = s.phase === 'DRAW' && s.turn === s.me; if (!myDraw) sel.clear();
  let fresh = 0;
  const cd = (c, k, cls = '') => { const f = !seen.has(k); seen.add(k); if (f) fresh++; return card(c, cls + (f ? ' deal' : '')); };
  const n = s.players.length, mi = s.players.findIndex(p => p.id === s.me), me = s.players[mi];
  const r = s.result, H = (r && r.hands) || {};
  const win = new Set(((r || {}).winners || []).map(w => w.id));
  const seats = s.players.map((p, i) => {
    const a = Math.PI / 2 + (i - mi) * 2 * Math.PI / n, x = 50 + 44 * Math.cos(a), y = 50 + 42 * Math.sin(a);
    const cs = p.id === s.me ? '' : p.hand.map((c, j) => cd(c, p.id + j + (c ? 'f' + c.r + c.s : 'b'), 'sm')).join('');
    const l = s.last && s.last.id === p.id ? `<em class="act ${s.last.type}">${s.last.type === 'draw' ? (s.last.k ? 'DRAW ' + s.last.k : 'STAND') : s.last.type.toUpperCase()}</em>` : '';
    const ht = H[p.id] != null ? `<div class="htag" style="--h:${180 + H[p.id] * 22}">${HJ[H[p.id]]}</div>` : '';
    return `<div class="seat ${p.id === s.turn ? 'turn' : ''} ${p.folded ? 'fold' : ''} ${win.has(p.id) ? 'win' : ''}" data-id="${p.id}" style="left:${x}%;top:${y}%">
      ${p.dealer ? '<span class="dl">D</span>' : ''}${p.bet ? `<span class="bt">${p.bet}</span>` : ''}<div>${p.name}${p.id === s.me ? ' ★' : ''}</div><div class="ch">${p.chips}${p.allIn ? ' · ALL-IN' : ''}</div>
      <div class="cs">${cs}</div>${ht}${p.id === s.turn ? `<b class="tm" style="animation-duration:30s;animation-delay:-${(30 - s.ttl).toFixed(1)}s"></b>` : ''}${l}</div>`;
  }).join('');
  let act = '';
  if (myDraw) act = `<button id="dr" class="main">STAND（交換なし）</button>`;
  else if (s.turn === s.me && me && s.phase !== 'DRAW') {
    const tc = s.currentBet - me.bet, mx = me.bet + me.chips, mn = Math.min(mx, s.currentBet + s.minRaise);
    act = `<button data-a="fold">FOLD</button>${tc > 0 ? `<button data-a="call" class="main">CALL ${Math.min(tc, me.chips)}</button>` : '<button data-a="check" class="main">CHECK</button>'}
      ${me.chips > tc ? `<div class="rz"><input type="range" id="rs" min="${mn}" max="${mx}" value="${mn}"><button data-a="raise">RAISE <span id="rv">${mn}</span></button></div>` : ''}<button data-a="allin" class="pu">ALL-IN</button>`;
  }
  let ov = '';
  if (r) {
    const iw = win.has(s.me), w = r.winners[0], cat = iw ? H[s.me] : H[w.id], mine = r.winners.find(x => x.id === s.me);
    ov = `<div class="res ${iw ? 'w' : 'l'} ${cat >= 6 ? 'big' : ''}" style="--h:${iw ? 150 : 345}"><div class="wl">${iw ? 'WIN' : 'LOSE'}</div>
      ${cat != null ? `<div class="hn" style="--h:${180 + cat * 22}">${HJ[cat]}</div><small>${HE[cat]}</small>` : '<div class="hn" style="--h:200">全員フォールド</div>'}
      <div class="amt">${iw ? '+' + mine.amount : w.name + ' +' + w.amount}</div></div>`;
  }
  const mc = me ? me.hand.map((c, j) => cd(c, 'me' + j + (c ? c.r + c.s : ''), sel.has(j) ? 'sel' : '').replace('<div class="card', `<div data-i="${j}" class="card`)).join('') : '';
  app.innerHTML = `<div class="game"><div class="top"><span>ROOM ${s.code} · ${PJ[s.phase] || s.phase}</span><span>${['👍', '😂', '😮', '🔥'].map(e => `<button class="em">${e}</button>`).join(' ')} <button id="lv">LEAVE</button></span></div>
    <div class="table"><div class="felt"></div><div class="mid"><div class="pot">POT ${s.pot}</div></div>${seats}${ov}
    <div class="log">${s.log.slice(-5).map((t, i, a) => `<div style="opacity:${.35 + .65 * (i + 1) / a.length}">${t}</div>`).join('')}</div></div>
    <div class="mine ${myDraw ? 'pick' : ''}">${mc}</div><div class="acts">${act}</div>${myDraw ? '<p class="mut">捨てるカードをタップ</p>' : ''}</div>`;
  document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => socket.emit('action', { type: b.dataset.a, amount: b.dataset.a === 'raise' ? +$('#rs').value : 0 }));
  if ($('#rs')) $('#rs').oninput = e => $('#rv').textContent = e.target.value;
  if (myDraw) {
    document.querySelectorAll('.mine .card').forEach(c => c.onclick = () => {
      const i = +c.dataset.i; sel.has(i) ? sel.delete(i) : sel.add(i); c.classList.toggle('sel'); SE.click();
      $('#dr').textContent = sel.size ? `DRAW（${sel.size}枚交換）` : 'STAND（交換なし）';
    });
    $('#dr').onclick = () => socket.emit('draw', { idx: [...sel] });
  }
  document.querySelectorAll('.em').forEach(b => b.onclick = () => socket.emit('emote', b.textContent));
  $('#lv').onclick = leave;
  if (fresh) SE.deal();
  if (s.last && s.last.n !== lastN) { lastN = s.last.n; ({ fold: SE.fold, raise: SE.raise, allin: SE.raise, draw: SE.deal }[s.last.type] || SE.chip)(); }
  if (r) { if (!counted) { counted = true; if (win.has(s.me)) { cfg.w++; SE.win(); } else { cfg.l++; SE.lose(); } save(); } } else counted = false;
}
socket.on('state', s => { S = s; screen = 'game'; render(); });
socket.on('err', toast);
socket.on('emote', ({ id, e }) => { const el = document.querySelector(`[data-id="${id}"]`); if (el) { const m = document.createElement('span'); m.className = 'emo'; m.textContent = e; el.appendChild(m); setTimeout(() => m.remove(), 1700); } });
render();
