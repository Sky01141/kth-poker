const crypto = require('crypto');
const { newDeck, best, cmp, NAMES } = require('./poker');
const SB = 10, BB = 20, START = 1000, TURN_MS = 30000;
const STYLES = ['BALANCED', 'AGGRESSIVE', 'CAUTIOUS', 'BLUFFER', 'RANDOM'];
const JP = { fold: 'フォールド', check: 'チェック', call: 'コール', raise: 'レイズ', allin: 'オールイン' };
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// 5-card draw: BET1 -> DRAW (one exchange each) -> BET2 -> showdown
class Game {
  constructor(code, onUpdate) {
    Object.assign(this, { code, onUpdate, players: [], phase: 'LOBBY', pot: 0, log: [], result: null, dealer: -1, turn: null, deadline: 0, last: null, currentBet: 0, minRaise: BB, n: 0, disc: [] });
  }
  get(id) { return this.players.find(p => p.id === id); }
  inHand() { return this.phase !== 'LOBBY' && this.phase !== 'RESULT'; }
  humans() { return this.players.filter(p => !p.bot && !p.left); }
  add(id, name, bot) {
    if (this.players.length >= 6) return false;
    this.players.push({ id, name: (name || 'PLAYER').slice(0, 12), chips: START, hand: [], bet: 0, total: 0, folded: true, allIn: false, acted: false, drawn: false, ready: !!bot, bot: bot || null, left: false });
    return true;
  }
  addBot() { const st = STYLES[Math.floor(Math.random() * STYLES.length)]; return this.add('bot' + (++this.n), 'COM ' + st.slice(0, 4), st); }
  remove(id) {
    const p = this.get(id); if (!p) return;
    if (!this.inHand()) { this.players = this.players.filter(x => x !== p); return; }
    p.left = true;
    if (this.turn === id && this.phase !== 'DRAW') return this.act(id, 'fold');
    const wasTurn = this.turn === id;
    p.folded = true; this.log.push(p.name + ' が退出');
    if (this.players.filter(x => !x.folded).length === 1) return this.payout(false);
    if (wasTurn) this.drawNext(this.players.indexOf(p));
  }
  canAct(p) { return !p.folded && !p.allIn; }
  post(p, a) { a = Math.min(a, p.chips); p.chips -= a; p.bet += a; p.total += a; this.pot += a; if (!p.chips) p.allIn = true; }

  start() {
    if (this.inHand()) return;
    clearTimeout(this.timer);
    this.players = this.players.filter(p => !p.left);
    this.players.forEach(p => { if (p.chips <= 0) p.chips = START; });
    const ps = this.players, n = ps.length;
    if (n < 2 || !this.humans().length) { this.phase = 'LOBBY'; return this.onUpdate(); }
    this.deck = newDeck(); this.disc = []; this.pot = 0; this.result = null; this.last = null;
    ps.forEach(p => Object.assign(p, { hand: [0, 1, 2, 3, 4].map(() => this.deck.pop()), bet: 0, total: 0, folded: false, allIn: false, acted: false, drawn: false, eval: null }));
    this.dealer = (this.dealer + 1) % n;
    const sb = n === 2 ? this.dealer : (this.dealer + 1) % n, bb = (sb + 1) % n;
    this.post(ps[sb], SB); this.post(ps[bb], BB);
    this.currentBet = BB; this.minRaise = BB; this.phase = 'BET1'; this.log = ['--- 新しいハンド ---'];
    this.after(bb);
  }
  after(i) {
    const ps = this.players, live = ps.filter(p => !p.folded);
    if (live.length === 1) return this.payout(false);
    const actors = live.filter(p => this.canAct(p));
    if (actors.every(p => p.acted && p.bet === this.currentBet)) return this.advance();
    for (let k = 1; k <= ps.length; k++) {
      const j = (i + k) % ps.length;
      if (this.canAct(ps[j]) && !(ps[j].acted && ps[j].bet === this.currentBet)) return this.setTurn(ps[j]);
    }
    this.advance();
  }
  setTurn(p) {
    clearTimeout(this.timer);
    this.turn = p.id; this.deadline = Date.now() + TURN_MS;
    const delay = p.bot ? 900 + Math.random() * 1000 : TURN_MS;
    this.timer = setTimeout(() => {
      if (this.phase === 'DRAW') return p.bot ? this.botDraw(p) : this.draw(p.id, []);
      if (p.bot) this.botAct(p); else this.act(p.id, this.currentBet > p.bet ? 'fold' : 'check');
    }, delay);
    this.onUpdate();
  }
  advance() {
    clearTimeout(this.timer);
    const ps = this.players;
    ps.forEach(p => { p.bet = 0; p.acted = false; });
    this.currentBet = 0; this.minRaise = BB; this.turn = null;
    if (this.phase === 'BET2') return this.showdown();
    if (this.phase === 'BET1') {
      this.phase = 'DRAW'; this.log.push('--- カード交換 ---'); ps.forEach(p => p.drawn = false);
      return this.drawNext(this.dealer);
    }
    this.phase = 'BET2'; this.log.push('--- 第2ベット ---');
    if (ps.filter(p => this.canAct(p)).length < 2) { this.onUpdate(); this.timer = setTimeout(() => this.advance(), 1400); return; }
    this.after(this.dealer);
  }
  drawNext(i) {
    const ps = this.players;
    for (let k = 1; k <= ps.length; k++) { const p = ps[(i + k) % ps.length]; if (!p.folded && !p.drawn) return this.setTurn(p); }
    this.advance();
  }
  draw(id, idx) {
    const p = this.get(id);
    if (!p || this.phase !== 'DRAW' || this.turn !== id) return '手番ではありません';
    idx = [...new Set((Array.isArray(idx) ? idx : []).map(Number))].filter(i => Number.isInteger(i) && i >= 0 && i < 5);
    clearTimeout(this.timer);
    idx.forEach(i => this.disc.push(p.hand[i]));
    idx.forEach(i => { if (!this.deck.length) { this.deck = shuffle(this.disc); this.disc = []; } p.hand[i] = this.deck.pop(); });
    p.drawn = true;
    this.last = { id, type: 'draw', k: idx.length, n: (this.last ? this.last.n : 0) + 1 };
    this.log.push(`${p.name} ${idx.length ? idx.length + '枚交換' : 'スタンド'}`);
    this.drawNext(this.players.indexOf(p));
  }
  showdown() {
    this.players.filter(p => !p.folded).forEach(p => p.eval = best(p.hand));
    this.payout(true);
  }
  payout(show) {
    clearTimeout(this.timer); this.turn = null;
    const ps = this.players, win = {}, hands = {};
    const levels = [...new Set(ps.filter(p => p.total > 0).map(p => p.total))].sort((a, b) => a - b);
    let prev = 0, carry = 0;
    for (const L of levels) {
      const part = ps.filter(p => p.total >= L), amt = (L - prev) * part.length + carry; prev = L;
      const el = part.filter(p => !p.folded);
      if (!el.length) { carry = amt; continue; } carry = 0;
      let w = el;
      if (show) { const top = el.reduce((a, b) => cmp(a.eval, b.eval) >= 0 ? a : b); w = el.filter(p => cmp(p.eval, top.eval) === 0); }
      const share = Math.floor(amt / w.length);
      w.forEach(p => { p.chips += share; win[p.id] = (win[p.id] || 0) + share; });
      const rem = amt - share * w.length; w[0].chips += rem; win[w[0].id] += rem;
    }
    if (show) ps.filter(p => !p.folded).forEach(p => hands[p.id] = p.eval.cat);
    this.result = { show, hands, winners: Object.entries(win).map(([id, amount]) => ({ id, name: this.get(id).name, amount })) };
    this.phase = 'RESULT'; this.pot = 0;
    this.log.push(this.result.winners.map(w => `${w.name} が ${w.amount} 獲得${show ? '（' + NAMES[hands[w.id]] + '）' : ''}`).join('、'));
    this.onUpdate();
    this.timer = setTimeout(() => this.start(), 8000);
  }
  act(id, type, amount) {
    const p = this.get(id);
    if (!p || !this.inHand() || this.turn !== id || this.phase === 'DRAW') return '手番ではありません';
    const toCall = this.currentBet - p.bet; amount = Math.floor(+amount) || 0;
    if (type === 'check' && toCall > 0) return 'チェックできません';
    if (type === 'call' && toCall <= 0) return 'コール不要です';
    if (type === 'raise' || type === 'bet') {
      if (amount > p.bet + p.chips) return 'チップが足りません';
      if (amount <= this.currentBet) return 'レイズ額が不正です';
      if (amount < this.currentBet + this.minRaise && amount < p.bet + p.chips) return 'レイズ額が小さすぎます';
    } else if (!['check', 'call', 'fold', 'allin'].includes(type)) return '不正な操作です';
    clearTimeout(this.timer);
    if (type === 'fold') p.folded = true;
    else if (type === 'call') this.post(p, toCall);
    else if (type !== 'check') {
      const to = type === 'allin' ? p.bet + p.chips : amount, inc = to - this.currentBet;
      if (inc > 0) { if (inc >= this.minRaise) this.minRaise = inc; this.currentBet = to; this.players.forEach(q => q.acted = false); }
      this.post(p, to - p.bet);
    }
    p.acted = true;
    const t = type === 'bet' ? 'raise' : (type !== 'fold' && p.allIn) ? 'allin' : type;
    this.last = { id, type: t, n: (this.last ? this.last.n : 0) + 1 };
    this.log.push(`${p.name} ${JP[t]}${t === 'raise' || t === 'allin' ? ' ' + p.bet : ''}`);
    this.after(this.players.indexOf(p));
  }
  botAct(p) {
    const toCall = this.currentBet - p.bet, st = p.bot;
    let s = best(p.hand).cat * .17 + .2 + Math.random() * .1 + ({ AGGRESSIVE: .12, CAUTIOUS: -.1 }[st] || 0);
    if (st === 'BLUFFER' && Math.random() < .25) s = .9;
    if (st === 'RANDOM') s = Math.random();
    const to = Math.min(p.bet + p.chips, this.currentBet + this.minRaise * (1 + Math.floor(Math.random() * 3)));
    let r;
    if (s > .72 && p.chips > toCall) r = ['raise', to];
    else if (s > .38 || (toCall <= p.chips * .1 && s > .3)) r = [toCall > 0 ? 'call' : 'check'];
    else r = [toCall > 0 ? 'fold' : 'check'];
    if (this.act(p.id, r[0], r[1])) this.act(p.id, toCall > 0 ? 'call' : 'check');
  }
  botDraw(p) {
    const cnt = {}; p.hand.forEach(c => cnt[c.r] = (cnt[c.r] || 0) + 1);
    let idx = [];
    if (best(p.hand).cat < 4) {
      let keep = p.hand.map((c, i) => cnt[c.r] > 1 ? i : -1).filter(i => i >= 0);
      if (!keep.length) keep = p.hand.map((c, i) => [c.r, i]).sort((a, b) => b[0] - a[0]).slice(0, p.bot === 'CAUTIOUS' ? 1 : 2).map(x => x[1]);
      idx = [0, 1, 2, 3, 4].filter(i => !keep.includes(i));
    }
    this.draw(p.id, idx);
  }
  view(id) {
    const reveal = this.result && this.result.show;
    const host = (this.players.find(p => !p.bot) || {}).id;
    return {
      code: this.code, phase: this.phase, pot: this.pot, currentBet: this.currentBet, minRaise: this.minRaise,
      turn: this.turn, ttl: Math.max(0, (this.deadline - Date.now()) / 1000), me: id, host, log: this.log.slice(-6), result: this.result, last: this.last,
      players: this.players.map((p, i) => ({
        id: p.id, name: p.name, chips: p.chips, bet: p.bet, folded: p.folded, allIn: p.allIn, ready: p.ready, bot: !!p.bot,
        dealer: this.phase !== 'LOBBY' && i === this.dealer,
        hand: p.id === id || (reveal && !p.folded) ? p.hand : p.hand.map(() => null)
      }))
    };
  }
}
module.exports = { Game };
