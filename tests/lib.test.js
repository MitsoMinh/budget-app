/* Run with: node tests/lib.test.js  (no dependencies) */
'use strict';
const assert = require('assert');
const L = require('../lib.js');

let n = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); n++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + '\n      ' + e.message); }
};
let idc = 0;
const uid = () => 'id' + (++idc);
const fresh = () => L.migrate({});

test('round2 and cents-safe sum', () => {
  assert.strictEqual(L.round2(1.005 + 0.0000001), 1.01);
  assert.strictEqual(L.sum([0.1, 0.2]), 0.3);
  assert.strictEqual(L.sum([19.99, 5.01, 0.1]), 25.1);
  assert.strictEqual(L.sum([]), 0);
});

test('splitShare and foreign conversion', () => {
  assert.strictEqual(L.splitShare(10, 3), 3.33);
  assert.strictEqual(L.splitShare(60, 3), 20);
  assert.strictEqual(L.splitShare(10, 0), 10);
  assert.strictEqual(L.toHome(20, 0.9231), 18.46);
});

test('evalExpr accepts arithmetic and rejects everything else', () => {
  assert.strictEqual(L.evalExpr('3+4.5'), 7.5);
  assert.strictEqual(L.evalExpr('2*(3+4)'), 14);
  assert.strictEqual(L.evalExpr('10/4'), 2.5);
  assert.strictEqual(L.evalExpr('1,5'), 1.5);
  assert.strictEqual(L.evalExpr(' 12 + 8 '), 20);
  assert.strictEqual(L.evalExpr('2--3'), 5);
  assert.ok(Number.isNaN(L.evalExpr('5/0')));
  assert.ok(Number.isNaN(L.evalExpr('(1+2')));
  assert.ok(Number.isNaN(L.evalExpr('abc')));
  assert.ok(Number.isNaN(L.evalExpr('alert(1)')));
  assert.ok(Number.isNaN(L.evalExpr('')));
  assert.ok(Number.isNaN(L.evalExpr('1+')));
});

test('migrate upgrades an old database without losing data', () => {
  const old = {months: {'2026-10': {income: [{id: 'a', name: 'Pay', amount: 100}], cats: [], tx: []}}, cur: '$'};
  const db = L.migrate(old);
  assert.strictEqual(db.v, 2);
  assert.deepStrictEqual(db.goals, []);
  assert.strictEqual(db.cur, '$');
  assert.strictEqual(db.setupDone, true);
  assert.strictEqual(db.months['2026-10'].income.length, 1);
  assert.strictEqual(L.migrate(null).setupDone, false);
});

test('new month copies categories, budgets and rollover flags', () => {
  const db = fresh();
  const a = L.ensureMonth(db, '2026-10', uid);
  assert.strictEqual(a.cats.length, 5);
  a.cats[1].budget = 300; a.cats[1].rollover = true;
  const b = L.ensureMonth(db, '2026-11', uid);
  assert.strictEqual(b.cats[1].budget, 300);
  assert.strictEqual(b.cats[1].rollover, true);
  assert.notStrictEqual(b.cats[1].id, a.cats[1].id);
});

test('recurring items are added once, respect start month and deletions', () => {
  const db = fresh();
  db.recurring.push({id: 'r1', kind: 'expense', name: 'Rent', amount: 500, cat: 'Rent', day: 31, from: '2026-02'});
  db.recurring.push({id: 'r2', kind: 'income', name: 'Salary', amount: 1500, day: 1, from: '2026-02'});
  assert.strictEqual(L.applyRecurring(db, '2026-02', '2026-11', uid), true);
  assert.strictEqual(L.applyRecurring(db, '2026-02', '2026-11', uid), false);
  const feb = db.months['2026-02'];
  assert.strictEqual(feb.tx.length, 1);
  assert.strictEqual(feb.tx[0].date, '2026-02-28');
  assert.strictEqual(feb.income.length, 1);
  L.applyRecurring(db, '2026-01', '2026-11', uid);
  assert.strictEqual(db.months['2026-01'].tx.length, 0);
  feb.tx = []; feb.skip.push('r1');
  L.applyRecurring(db, '2026-02', '2026-11', uid);
  assert.strictEqual(feb.tx.length, 0);
  assert.strictEqual(L.applyRecurring(db, '2027-01', '2026-11', uid), false);
});

test('rollover carries unspent budget forward and chains across months', () => {
  const db = fresh();
  const oct = L.ensureMonth(db, '2026-10', uid);
  const food = oct.cats.find(c => c.name === 'Food');
  food.budget = 300; food.rollover = true;
  oct.tx.push({id: 't1', cat: food.id, amount: 220, date: '2026-10-05'});
  const nov = L.ensureMonth(db, '2026-11', uid);
  const nf = nov.cats.find(c => c.name === 'Food');
  assert.deepStrictEqual(L.effectiveBudget(db, '2026-11', nf), {budget: 300, carry: 80, total: 380});
  nov.tx.push({id: 't2', cat: nf.id, amount: 100, date: '2026-11-05'});
  const dec = L.ensureMonth(db, '2026-12', uid);
  const df = dec.cats.find(c => c.name === 'Food');
  assert.strictEqual(L.effectiveBudget(db, '2026-12', df).carry, 280);
  nov.tx.push({id: 't3', cat: nf.id, amount: 500, date: '2026-11-09'});
  assert.strictEqual(L.effectiveBudget(db, '2026-12', df).carry, 0);
  const transport = dec.cats.find(c => c.name === 'Transport');
  assert.strictEqual(L.effectiveBudget(db, '2026-12', transport).carry, 0);
});

test('calcMonth totals, pace and safe-to-spend', () => {
  const db = fresh();
  const m = L.ensureMonth(db, '2026-11', uid);
  m.income.push({id: 'i', name: 'Pay', amount: 1500});
  const food = m.cats.find(c => c.name === 'Food'); food.budget = 300;
  m.tx.push({id: 'a', cat: food.id, amount: 150.5, date: '2026-11-02'}, {id: 'b', cat: food.id, amount: 49.5, date: '2026-11-09'});
  const k = L.calcMonth(db, '2026-11', '2026-11-10');
  assert.strictEqual(k.spent, 200);
  assert.strictEqual(k.left, 1300);
  assert.strictEqual(k.elapsed, 10);
  assert.strictEqual(k.remainingDays, 21);
  assert.strictEqual(k.projected, 600);
  assert.strictEqual(Math.round(k.safe), 62);
  assert.strictEqual(k.planned, 300);
  const past = L.calcMonth(db, '2026-11', '2026-12-05');
  assert.strictEqual(past.elapsed, 30);
  assert.strictEqual(past.remainingDays, 0);
  assert.strictEqual(past.projected, 200);
});

test('paceWarning only fires while still under budget', () => {
  const w = L.paceWarning(100, 300, 5, 30);
  assert.ok(w && w.projected === 600 && w.over === 300);
  assert.strictEqual(L.paceWarning(40, 300, 10, 30), null);
  assert.strictEqual(L.paceWarning(400, 300, 10, 30), null);
  assert.strictEqual(L.paceWarning(10, 0, 10, 30), null);
  assert.strictEqual(L.paceWarning(10, 100, 0, 30), null);
  assert.strictEqual(L.paceWarning(90, 100, 30, 30), null);
});

test('monthDelta compares categories by name', () => {
  const db = fresh();
  const oct = L.ensureMonth(db, '2026-10', uid), nov = L.ensureMonth(db, '2026-11', uid);
  const of = oct.cats.find(c => c.name === 'Food'), nf = nov.cats.find(c => c.name === 'Food');
  oct.tx.push({id: 'a', cat: of.id, amount: 200, date: '2026-10-03'});
  nov.tx.push({id: 'b', cat: nf.id, amount: 250, date: '2026-11-03'});
  assert.deepStrictEqual(L.monthDelta(db, '2026-11', 'food'), {cur: 250, prev: 200, diff: 50, pct: 25});
  assert.strictEqual(L.monthDelta(db, '2026-11', 'Fun'), null);
  assert.strictEqual(L.monthDelta(db, '2026-10', 'Food'), null);
});

test('weekdayPattern averages by how often each weekday occurs', () => {
  const db = fresh();
  const m = L.ensureMonth(db, '2026-11', uid);
  const c = m.cats[0];
  // 2026-11-02 and 2026-11-09 are Mondays; November 2026 has 5 Mondays (2, 9, 16, 23, 30)
  m.tx.push({id: 'a', cat: c.id, amount: 40, date: '2026-11-02'}, {id: 'b', cat: c.id, amount: 40, date: '2026-11-09'});
  const p = L.weekdayPattern(m, '2026-11');
  assert.strictEqual(p.top, 0);
  assert.strictEqual(p.avg[0], 16);
  assert.strictEqual(p.avg[3], 0);
  assert.strictEqual(L.weekdayPattern({tx: []}, '2026-11').top, -1);
});

test('goalProgress works out the monthly amount needed', () => {
  const g = {target: 600, due: '2027-01-31', contribs: [{amount: 100}, {amount: 50.5}]};
  const p = L.goalProgress(g, '2026-11');
  assert.strictEqual(p.saved, 150.5);
  assert.strictEqual(p.remaining, 449.5);
  assert.strictEqual(p.monthsLeft, 3);
  assert.strictEqual(p.perMonth, 149.83);
  assert.strictEqual(L.goalProgress({target: 100, contribs: [{amount: 100}]}, '2026-11').done, true);
  assert.strictEqual(L.goalProgress({target: 100, contribs: []}, '2026-11').perMonth, null);
  assert.strictEqual(L.goalProgress({target: 100, due: '2026-01-01', contribs: []}, '2026-11').monthsLeft, 1);
});

test('frequentQuick surfaces repeated expenses only', () => {
  const db = fresh();
  const m = L.ensureMonth(db, '2026-11', uid);
  const food = m.cats.find(c => c.name === 'Food');
  ['2026-11-01', '2026-11-03', '2026-11-04'].forEach((d, i) => m.tx.push({id: 'c' + i, cat: food.id, amount: 3, note: 'Coffee', date: d}));
  m.tx.push({id: 'x1', cat: food.id, amount: 8, note: 'Lunch', date: '2026-11-02'});
  m.tx.push({id: 'x2', cat: food.id, amount: 8, note: 'Lunch', date: '2026-11-05'});
  m.tx.push({id: 'x3', cat: food.id, amount: 55, note: 'Once', date: '2026-11-05'});
  m.tx.push({id: 'x4', cat: food.id, amount: 5, note: 'Netflix', date: '2026-11-05', rec: 'r1'});
  const q = L.frequentQuick(db, 4);
  assert.deepStrictEqual(q.map(e => e.note), ['Coffee', 'Lunch']);
  assert.strictEqual(q[0].amount, 3);
  assert.strictEqual(q[0].catName, 'Food');
});

test('backupDue needs data and a stale or missing backup', () => {
  const db = fresh();
  const now = Date.parse('2026-11-22T12:00:00Z');
  assert.strictEqual(L.backupDue(db, now), false);
  const m = L.ensureMonth(db, '2026-11', uid); m.income.push({id: 'i', name: 'Pay', amount: 1});
  assert.strictEqual(L.backupDue(db, now), true);
  db.lastBackup = '2026-11-20T12:00:00Z';
  assert.strictEqual(L.backupDue(db, now), false);
  db.lastBackup = '2026-11-10T12:00:00Z';
  assert.strictEqual(L.backupDue(db, now), true);
});

test('toCSV quotes commas and quotes', () => {
  assert.strictEqual(L.toCSV([['a', 'b,"c"'], [1, 2]]), '"a","b,""c"""\n"1","2"');
});

test('date helpers', () => {
  assert.strictEqual(L.shift('2026-12', 1), '2027-01');
  assert.strictEqual(L.shift('2026-01', -1), '2025-12');
  assert.strictEqual(L.daysIn('2028-02'), 29);
  assert.strictEqual(L.daysIn('2026-02'), 28);
  assert.strictEqual(L.monthsBetween('2026-11', '2027-01'), 2);
});

console.log('\n' + n + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
