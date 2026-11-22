/* Budget app: pure logic (no DOM). Loaded in the browser as window.BudgetLib and in tests via require(). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BudgetLib = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_VERSION = 2;
  const DEFAULT_CATS = [['Rent', 0], ['Food', 0], ['Transport', 0], ['Fun', 0], ['Savings', 0]];

  /* ---------- money ---------- */
  const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const toCents = n => Math.round(n * 100);
  const sum = list => list.reduce((s, n) => s + toCents(n), 0) / 100;
  const splitShare = (total, people) => round2(total / Math.max(1, Math.floor(people) || 1));
  const toHome = (foreignAmount, rate) => round2(foreignAmount * rate);

  /* Safe calculator for the amount field: digits, + - * / ( ) and decimals. Returns NaN when invalid. */
  function evalExpr(input) {
    const s = String(input).replace(/,/g, '.').replace(/\s+/g, '').replace(/[×x]/g, '*').replace(/÷/g, '/');
    if (!s || !/^[0-9+\-*/().]+$/.test(s)) return NaN;
    let i = 0;
    const peek = () => s[i];
    function number() {
      const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
      if (!m) throw new Error('num');
      i += m[0].length; return parseFloat(m[0]);
    }
    function factor() {
      if (peek() === '-') { i++; return -factor(); }
      if (peek() === '+') { i++; return factor(); }
      if (peek() === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error('paren'); i++; return v; }
      return number();
    }
    function term() {
      let v = factor();
      while (peek() === '*' || peek() === '/') {
        const op = s[i++]; const r = factor();
        if (op === '/' && r === 0) throw new Error('div0');
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      let v = term();
      while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    try { const v = expr(); return i === s.length && isFinite(v) ? round2(v) : NaN; } catch (e) { return NaN; }
  }

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, '0');
  const dateStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const shift = (ym, d) => { const [y, m] = ym.split('-').map(Number); const dt = new Date(y, m - 1 + d, 1); return dt.getFullYear() + '-' + pad(dt.getMonth() + 1); };
  const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
  const monthsBetween = (fromYM, toYM) => { const [a, b] = fromYM.split('-').map(Number), [c, d] = toYM.split('-').map(Number); return (c - a) * 12 + (d - b); };

  /* ---------- database ---------- */
  function migrate(db) {
    db = db && typeof db === 'object' ? db : {};
    db.months = db.months || {};
    db.recurring = db.recurring || [];
    db.colors = db.colors || {};
    db.goals = db.goals || [];
    db.rates = db.rates || {};
    db.cur = db.cur || '€';
    db.theme = db.theme || 'auto';
    db.lastBackup = db.lastBackup || null;
    if (db.setupDone === undefined) db.setupDone = hasData(db);
    Object.values(db.months).forEach(m => {
      m.income = m.income || []; m.cats = m.cats || []; m.tx = m.tx || []; m.skip = m.skip || [];
    });
    db.v = DB_VERSION;
    return db;
  }
  const hasData = db => Object.values(db.months || {}).some(m => (m.tx && m.tx.length) || (m.income && m.income.length));

  function slotFor(db, name) {
    const k = name.trim().toLowerCase();
    if (db.colors[k] !== undefined) return db.colors[k];
    const used = new Set(Object.values(db.colors));
    let s = 0; while (used.has(s) && s < 8) s++;
    return (db.colors[k] = s > 7 ? 8 : s);
  }

  function ensureMonth(db, ym, uid) {
    if (!db.months[ym]) {
      const prev = db.months[shift(ym, -1)];
      const src = prev ? prev.cats.map(c => [c.name, c.budget, !!c.rollover]) : DEFAULT_CATS.map(c => [c[0], c[1], false]);
      db.months[ym] = {income: [], cats: src.map(([name, budget, rollover]) => ({id: uid(), name, budget, rollover})), tx: [], skip: []};
    }
    const m = db.months[ym];
    m.skip = m.skip || [];
    m.cats.forEach(c => slotFor(db, c.name));
    return m;
  }

  function ensureCat(m, name, uid) {
    let c = m.cats.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!c) { c = {id: uid(), name, budget: 0}; m.cats.push(c); }
    return c;
  }

  /* Adds recurring items to month `ym` (never future months). Skips ones the user deleted from that month. */
  function applyRecurring(db, ym, realYM, uid) {
    if (ym > realYM) return false;
    const m = ensureMonth(db, ym, uid);
    let changed = false;
    db.recurring.forEach(r => {
      if (ym < r.from || m.skip.includes(r.id)) return;
      const date = ym + '-' + pad(Math.min(r.day, daysIn(ym)));
      if (r.kind === 'income') {
        if (!m.income.some(i => i.rec === r.id)) { m.income.push({id: uid(), name: r.name, amount: r.amount, rec: r.id}); changed = true; }
      } else if (!m.tx.some(t => t.rec === r.id)) {
        const c = ensureCat(m, r.cat, uid);
        m.tx.push({id: uid(), cat: c.id, amount: r.amount, note: r.name, date, rec: r.id}); changed = true;
      }
    });
    return changed;
  }

  /* ---------- budgets, rollover ---------- */
  const spentIn = (m, catId) => sum(m.tx.filter(t => t.cat === catId).map(t => t.amount));

  /* Budget for a category in month ym including unspent money carried over from last month (only when the category has rollover on). */
  function effectiveBudget(db, ym, cat, depth) {
    depth = depth || 0;
    if (!cat.rollover || depth > 24) return {budget: cat.budget, carry: 0, total: cat.budget};
    const pm = db.months[shift(ym, -1)];
    const prev = pm && pm.cats.find(c => c.name.toLowerCase() === cat.name.toLowerCase());
    if (!prev) return {budget: cat.budget, carry: 0, total: cat.budget};
    const pe = effectiveBudget(db, shift(ym, -1), prev, depth + 1);
    const carry = Math.max(0, round2(pe.total - spentIn(pm, prev.id)));
    return {budget: cat.budget, carry, total: round2(cat.budget + carry)};
  }

  /* ---------- month statistics ---------- */
  function calcMonth(db, ym, today /* YYYY-MM-DD */) {
    const m = db.months[ym];
    const days = daysIn(ym), real = today.slice(0, 7);
    const inc = sum(m.income.map(i => i.amount));
    const spent = sum(m.tx.map(t => t.amount));
    const byCat = m.cats.map(c => {
      const eb = effectiveBudget(db, ym, c);
      return {c, spent: spentIn(m, c.id), budget: eb.total, carry: eb.carry};
    });
    const planned = sum(byCat.map(x => x.budget));
    const elapsed = ym === real ? Number(today.slice(8)) : ym < real ? days : 0;
    const remainingDays = ym === real ? days - elapsed + 1 : ym > real ? days : 0;
    const left = round2(inc - spent);
    const avg = elapsed ? spent / elapsed : 0;
    const projected = ym === real && elapsed ? avg * days : spent;
    const safe = remainingDays > 0 ? Math.max(0, left) / remainingDays : 0;
    const rate = inc > 0 ? left / inc : 0;
    const biggest = m.tx.length ? m.tx.reduce((a, b) => b.amount > a.amount ? b : a) : null;
    return {m, days, inc, spent, planned, byCat, elapsed, remainingDays, left, avg, projected, safe, rate, biggest};
  }

  /* Warns before a category goes over: it is still under budget but the current pace would exceed it. */
  function paceWarning(spent, budget, elapsed, days, fixed) {
    fixed = fixed || 0;
    if (!(budget > 0) || elapsed <= 0 || elapsed >= days || spent >= budget) return null;
    const projected = fixed + (spent - fixed) / elapsed * days;
    return projected > budget ? {projected: round2(projected), over: round2(projected - budget)} : null;
  }

  /* Change versus the previous month for one category (matched by name). null when there is nothing to compare. */
  function monthDelta(db, ym, catName) {
    const pm = db.months[shift(ym, -1)], cm = db.months[ym];
    if (!pm || !cm) return null;
    const a = cm.cats.find(c => c.name.toLowerCase() === catName.toLowerCase());
    const b = pm.cats.find(c => c.name.toLowerCase() === catName.toLowerCase());
    if (!a || !b) return null;
    const cur = spentIn(cm, a.id), prev = spentIn(pm, b.id);
    if (prev === 0 && cur === 0) return null;
    return {cur, prev, diff: round2(cur - prev), pct: prev > 0 ? Math.round((cur - prev) / prev * 100) : null};
  }

  /* Average spend per weekday (Mon..Sun) so months with five Fridays do not skew the picture. */
  function weekdayPattern(m, ym) {
    const tot = Array(7).fill(0), occ = Array(7).fill(0);
    const [y, mo] = ym.split('-').map(Number);
    for (let d = 1; d <= daysIn(ym); d++) occ[(new Date(y, mo - 1, d).getDay() + 6) % 7]++;
    m.tx.forEach(t => { const [yy, mm, dd] = t.date.split('-').map(Number); tot[(new Date(yy, mm - 1, dd).getDay() + 6) % 7] += t.amount; });
    const avg = tot.map((v, i) => occ[i] ? round2(v / occ[i]) : 0);
    const max = Math.max(...avg);
    return {avg, top: max > 0 ? avg.indexOf(max) : -1};
  }

  /* ---------- goals ---------- */
  function goalProgress(goal, todayYM) {
    const saved = sum((goal.contribs || []).map(c => c.amount));
    const pct = goal.target > 0 ? Math.min(1, saved / goal.target) : 0;
    const remaining = Math.max(0, round2(goal.target - saved));
    let perMonth = null, monthsLeft = null;
    if (goal.due && remaining > 0) {
      monthsLeft = Math.max(1, monthsBetween(todayYM, goal.due.slice(0, 7)) + 1);
      perMonth = round2(remaining / monthsLeft);
    }
    return {saved, pct, remaining, monthsLeft, perMonth, done: remaining === 0 && goal.target > 0};
  }

  /* ---------- quick add ---------- */
  /* Expenses you repeat (same note and amount at least twice) become one-tap chips. */
  function frequentQuick(db, limit) {
    const map = new Map();
    Object.keys(db.months).sort().forEach(ym => {
      const m = db.months[ym];
      m.tx.forEach(t => {
        if (!t.note || t.rec) return;
        const cat = m.cats.find(c => c.id === t.cat);
        if (!cat) return;
        const key = t.note.trim().toLowerCase() + '|' + (t.total || t.amount) + '|' + cat.name.toLowerCase();
        const e = map.get(key) || {note: t.note.trim(), amount: t.amount, catName: cat.name, count: 0, last: ''};
        e.count++; e.last = t.date > e.last ? t.date : e.last; map.set(key, e);
      });
    });
    return [...map.values()].filter(e => e.count >= 2).sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, limit || 4);
  }

  /* ---------- backup ---------- */
  function backupDue(db, nowMs, days) {
    days = days || 7;
    if (!hasData(db)) return false;
    const last = db.lastBackup ? new Date(db.lastBackup).getTime() : 0;
    if (!last) return true;
    return nowMs - last > days * 86400000;
  }

  function toCSV(rows) {
    return rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  }

  return {DB_VERSION, DEFAULT_CATS, round2, toCents, sum, splitShare, toHome, evalExpr, pad, dateStr, shift, daysIn, monthsBetween,
    migrate, hasData, slotFor, ensureMonth, ensureCat, applyRecurring, spentIn, effectiveBudget, calcMonth, paceWarning, monthDelta,
    weekdayPattern, goalProgress, frequentQuick, backupDue, toCSV};
});
