const crypto = require('crypto');
const NAMES = ['HIGH CARD','PAIR','TWO PAIR','THREE OF A KIND','STRAIGHT','FLUSH','FULL HOUSE','FOUR OF A KIND','STRAIGHT FLUSH','ROYAL FLUSH'];
function newDeck() {
  const d = [];
  for (const s of 'shdc') for (let r = 2; r <= 14; r++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function eval5(c) {
  const rs = c.map(x => x.r).sort((a, b) => b - a);
  const flush = c.every(x => x.s === c[0].s);
  let high = 0;
  if (new Set(rs).size === 5) { if (rs[0] - rs[4] === 4) high = rs[0]; else if (rs[0] === 14 && rs[1] === 5) high = 5; }
  const cnt = {}; rs.forEach(r => cnt[r] = (cnt[r] || 0) + 1);
  const g = Object.entries(cnt).map(([r, n]) => [+r, n]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  let cat;
  if (high && flush) cat = high === 14 ? 9 : 8;
  else if (g[0][1] === 4) cat = 7;
  else if (g[0][1] === 3 && g[1][1] === 2) cat = 6;
  else if (flush) cat = 5;
  else if (high) cat = 4;
  else if (g[0][1] === 3) cat = 3;
  else if (g[0][1] === 2 && g[1][1] === 2) cat = 2;
  else if (g[0][1] === 2) cat = 1;
  else cat = 0;
  return { cat, key: (cat === 4 || cat >= 8) ? [high] : g.map(x => x[0]) };
}
function cmp(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) { const d = (a.key[i] || 0) - (b.key[i] || 0); if (d) return d; }
  return 0;
}
function best(cards) {
  if (cards.length === 5) return eval5(cards);
  let b = null; const n = cards.length;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const e = eval5(cards.filter((_, k) => k !== i && k !== j));
    if (!b || cmp(e, b) > 0) b = e;
  }
  return b;
}
module.exports = { newDeck, best, cmp, NAMES };
