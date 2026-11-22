'use strict';
/* Budget app UI. Pure money logic lives in lib.js (tested in tests/lib.test.js). */
const L = BudgetLib;
const KEY = 'budget-v1';
const $ = id => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- state & storage ---------- */
let db;
try { db = L.migrate(JSON.parse(localStorage.getItem(KEY))); } catch (e) { db = L.migrate({}); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };

const todayStr = () => L.dateStr(new Date());
const realYM = () => todayStr().slice(0, 7);
let cur = realYM();
const S = {tab: 'overview', cat: null, day: null, mode: 'daily', q: ''};

const shift = L.shift, daysIn = L.daysIn;
const monthName = (ym, long = true) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, long ? {month: 'long', year: 'numeric'} : {month: 'short'}); };
const fmt = (n, dec = 2) => db.cur + Number(Math.round(n * 100) / 100).toLocaleString(undefined, {minimumFractionDigits: dec, maximumFractionDigits: dec});
const fmt0 = n => db.cur + Math.round(n).toLocaleString();

const slotFor = name => L.slotFor(db, name);
const colorOf = c => `var(--c${slotFor(c.name)})`;
const M = ym => L.ensureMonth(db, ym || cur, uid);
const applyRecurring = () => { if (L.applyRecurring(db, cur, realYM(), uid)) save(); };
const calc = () => { M(); return L.calcMonth(db, cur, todayStr()); };

/* ---------- chart helpers ---------- */
const chartW = max => Math.max(300, Math.min(max, ($('view').clientWidth || max) - 44));
const nice = max => { if (max <= 0) return 10; const p = Math.pow(10, Math.floor(Math.log10(max))), f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
const barPath = (x, y, w, h, r) => { if (h <= 0) return ''; r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; };
const tip = (title, rows) => esc(`<b>${title}</b>` + rows.map(r => `<div>${r}</div>`).join(''));
const sw = col => `<i style="background:${col}"></i>`;

function ringSVG(pct, color) {
  const r = 86, C = 2 * Math.PI * r, p = clamp(pct, 0, 1);
  return `<svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="16"/>
  <circle id="ringArc" cx="100" cy="100" r="${r}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-to="${C * (1 - p)}" style="transition:stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)"/></svg>`;
}
function miniRing(pct, color, label) {
  const r = 34, C = 2 * Math.PI * r;
  return `<svg viewBox="0 0 84 84" width="84" height="84" role="img" aria-label="${esc(label)}"><circle cx="42" cy="42" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="8"/>
  <circle cx="42" cy="42" r="${r}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C * clamp(pct, 0, 1)} ${C}" transform="rotate(-90 42 42)"/>
  <text x="42" y="47" text-anchor="middle" style="fill:var(--txt);font-size:15px;font-weight:700">${Math.round(pct * 100)}%</text></svg>`;
}

function donutHTML(k) {
  const items = k.byCat.filter(x => x.spent > 0).sort((a, b) => b.spent - a.spent);
  const total = items.reduce((s, x) => s + x.spent, 0);
  const r = 78, C = 2 * Math.PI * r;
  let off = 0, segs = '';
  items.forEach(x => {
    const len = x.spent / total * C, gap = items.length > 1 ? 2.5 : 0;
    const dim = S.cat && S.cat !== x.c.id;
    segs += `<circle class="seg" cx="100" cy="100" r="${r}" stroke="${colorOf(x.c)}" stroke-dasharray="${Math.max(0.5, len - gap)} ${C}" stroke-dashoffset="${-off}" opacity="${dim ? .3 : 1}"
      data-act="cat" data-id="${x.c.id}" data-tip="${tip(esc(x.c.name), [sw(colorOf(x.c)) + fmt(x.spent), Math.round(x.spent / total * 100) + '% of spending'])}"/>`;
    off += len;
  });
  const sel = S.cat && items.find(x => x.c.id === S.cat);
  const center = !items.length ? `<span class="sub">No spending</span>`
    : sel ? `<span class="sub">${esc(sel.c.name)}</span><b style="font-size:1.4rem">${fmt0(sel.spent)}</b><span class="sub">${Math.round(sel.spent / total * 100)}%</span>`
    : `<span class="sub">Spent</span><b style="font-size:1.5rem">${fmt0(total)}</b><span class="sub">${items.length} categor${items.length === 1 ? 'y' : 'ies'}</span>`;
  const legend = items.map(x => `<button class="lg ${S.cat === x.c.id ? 'on' : ''} ${S.cat && S.cat !== x.c.id ? 'dim' : ''}" data-act="cat" data-id="${x.c.id}"><i style="background:${colorOf(x.c)}"></i><span>${esc(x.c.name)}</span><em>${Math.round(x.spent / total * 100)}%</em><b>${fmt0(x.spent)}</b></button>`).join('');
  return `<div class="donut-wrap"><div class="donut"><svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="${r}" fill="none" stroke="var(--panel2)" stroke-width="22"/>${segs}</svg><div class="c">${center}</div></div>
  <div class="legend">${legend || '<div class="empty">Add an expense to see where your money goes.</div>'}</div></div>`;
}

function dailyHTML(k) {
  const {m, days} = k;
  const per = Array(days + 1).fill(0);
  m.tx.filter(t => !S.cat || t.cat === S.cat).forEach(t => per[Math.min(days, Math.max(1, Number(t.date.slice(8))))] += t.amount);
  const cum = []; per.reduce((a, v, i) => (cum[i] = a + (i ? v : 0), a + (i ? v : 0)), 0);
  const cumulative = S.mode === 'cum';
  const selCat = S.cat && k.byCat.find(x => x.c.id === S.cat);
  const target = selCat ? selCat.budget : (k.planned || k.inc);
  const maxV = cumulative ? Math.max(cum[days], target) : Math.max(...per);
  const top = nice(maxV * 1.05);
  const W = chartW(640), H = 230, Lm = 44, R = 8, T = 10, B = 26, iw = W - Lm - R, ih = H - T - B, cw = iw / days;
  const y = v => T + ih - v / top * ih;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily spending">`;
  [0, .5, 1].forEach(f => { const v = top * f; s += `<line class="grid-l" x1="${Lm}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${Lm - 8}" y="${y(v) + 4}" text-anchor="end">${fmt0(v)}</text>`; });
  for (let d = 1; d <= days; d++) if (d === 1 || d % 5 === 0) s += `<text x="${Lm + (d - .5) * cw}" y="${H - 6}" text-anchor="middle">${d}</text>`;
  const col = selCat ? colorOf(selCat.c) : 'var(--c0)';
  const real = realYM(), tdy = Number(todayStr().slice(8));
  if (cur === real) s += `<line x1="${Lm + (tdy - .5) * cw}" x2="${Lm + (tdy - .5) * cw}" y1="${T}" y2="${T + ih}" stroke="var(--dim)" stroke-dasharray="3 4"/>`;
  if (cumulative) {
    if (target > 0) s += `<line x1="${Lm}" y1="${y(0)}" x2="${Lm + iw}" y2="${y(target)}" stroke="var(--dim)" stroke-width="1.5" stroke-dasharray="5 5"/><text x="${W - R}" y="${y(target) - 6}" text-anchor="end">Pace to ${fmt0(target)}</text>`;
    const last = cur === real ? tdy : cur < real ? days : 0;
    let pts = []; for (let d = 1; d <= Math.max(1, last); d++) pts.push([Lm + (d - .5) * cw, y(cum[d])]);
    s += `<path d="M${pts.map(p => p.join(',')).join('L')}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  for (let d = 1; d <= days; d++) {
    const x = Lm + (d - 1) * cw, v = cumulative ? cum[d] : per[d];
    const tp = tip(new Date(cur + '-' + String(d).padStart(2, '0') + 'T12:00').toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short'}),
      [sw(col) + 'Spent ' + fmt(per[d]), 'Total so far ' + fmt(cum[d]), 'Click to see transactions']);
    s += `<g class="col" data-act="day" data-day="${d}" data-tip="${tp}"><rect x="${x}" y="${T}" width="${cw}" height="${ih + 4}" fill="transparent"/>`;
    if (!cumulative) s += `<path class="b" d="${barPath(x + cw * .18, y(per[d]), cw * .64, T + ih - y(per[d]), 4)}" fill="${col}" ${S.day && Number(S.day) !== d ? 'opacity=".35"' : ''}/>`;
    else s += `<g class="xh"><line x1="${x + cw / 2}" x2="${x + cw / 2}" y1="${T}" y2="${T + ih}" stroke="var(--dim)"/><circle cx="${x + cw / 2}" cy="${y(v)}" r="5" fill="${col}" stroke="var(--panel)" stroke-width="2"/></g>`;
    s += `</g>`;
  }
  return s + '</svg>';
}

function trendHTML() {
  const months = []; for (let i = 5; i >= 0; i--) months.push(shift(cur, -i));
  const data = months.map(ym => { const m = db.months[ym]; return {ym, inc: m ? L.sum(m.income.map(i => i.amount)) : 0, sp: m ? L.sum(m.tx.map(t => t.amount)) : 0}; });
  const top = nice(Math.max(1, ...data.flatMap(d => [d.inc, d.sp])) * 1.05);
  const W = chartW(520), H = 220, Lm = 44, R = 6, T = 10, B = 26, iw = W - Lm - R, ih = H - T - B, cw = iw / 6;
  const y = v => T + ih - v / top * ih;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and spending, last six months">`;
  [0, .5, 1].forEach(f => { const v = top * f; s += `<line class="grid-l" x1="${Lm}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${Lm - 8}" y="${y(v) + 4}" text-anchor="end">${fmt0(v)}</text>`; });
  data.forEach((d, i) => {
    const x = Lm + i * cw, bw = cw * .3, on = d.ym === cur;
    const tp = tip(monthName(d.ym), [sw('var(--c0)') + 'Income ' + fmt(d.inc), sw('var(--c1)') + 'Spent ' + fmt(d.sp), 'Saved ' + fmt(d.inc - d.sp), 'Click to open']);
    s += `<g class="col" data-act="month" data-ym="${d.ym}" data-tip="${tp}"><rect x="${x}" y="${T}" width="${cw}" height="${ih + B}" fill="${on ? 'var(--panel2)' : 'transparent'}" rx="8"/>
      <path class="b" d="${barPath(x + cw * .17, y(d.inc), bw, T + ih - y(d.inc), 4)}" fill="var(--c0)"/>
      <path class="b" d="${barPath(x + cw * .17 + bw + 3, y(d.sp), bw, T + ih - y(d.sp), 4)}" fill="var(--c1)"/>
      <text x="${x + cw / 2}" y="${H - 6}" text-anchor="middle" ${on ? 'style="fill:var(--txt);font-weight:700"' : ''}>${monthName(d.ym, false)}</text></g>`;
  });
  return s + '</svg>';
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function weekdayHTML(k) {
  const p = L.weekdayPattern(k.m, cur);
  if (p.top < 0) return '<div class="empty">Log a few expenses to see which days you spend most.</div>';
  const W = chartW(420), H = 130, T = 8, B = 22, cw = W / 7, ih = H - T - B, max = Math.max(...p.avg) * 1.05;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Average spending by weekday">`;
  p.avg.forEach((v, i) => {
    const h = v / max * ih, x = i * cw, top = i === p.top;
    s += `<g class="col" data-tip="${tip(DAY_NAMES[i], [sw(top ? 'var(--c1)' : 'var(--c0)') + 'Average ' + fmt(v)])}"><rect x="${x}" y="0" width="${cw}" height="${H}" fill="transparent"/>
      <path class="b" d="${barPath(x + cw * .2, T + ih - h, cw * .6, h, 4)}" fill="${top ? 'var(--c1)' : 'var(--c0)'}"/>
      <text x="${x + cw / 2}" y="${H - 6}" text-anchor="middle" ${top ? 'style="fill:var(--txt);font-weight:700"' : ''}>${DAY_NAMES[i][0]}</text></g>`;
  });
  return `<div class="sub" style="margin-bottom:6px">You spend most on <b style="color:var(--txt)">${DAY_NAMES[p.top]}s</b>, about ${fmt0(p.avg[p.top])} on average.</div>` + s + '</svg>';
}

function catBarsHTML(k) {
  const warnable = cur === realYM();
  const rows = k.byCat.map(({c, spent, budget, carry}) => {
    const p = budget > 0 ? spent / budget : 0;
    const st = budget <= 0 ? ['var(--dim)', '', ''] : p > 1 ? ['var(--crit)', '✕', `Over by ${fmt(spent - budget)}`] : p > .85 ? ['var(--warn)', '!', `${fmt(budget - spent)} left`] : ['var(--good)', '✓', budget > 0 ? `${fmt(budget - spent)} left` : ''];
    const pw = warnable ? L.paceWarning(spent, budget, k.elapsed, k.days) : null;
    const d = L.monthDelta(db, cur, c.name);
    const delta = d && d.diff !== 0 ? `<span class="dl">${d.diff > 0 ? '▲' : '▼'} ${d.pct !== null ? Math.abs(d.pct) + '%' : fmt0(Math.abs(d.diff))} vs last month</span>` : '';
    return `<div class="prow ${S.cat === c.id ? 'on' : ''}" data-act="cat" data-id="${c.id}"><div class="t"><i style="background:${colorOf(c)}"></i><span>${esc(c.name)}</span><em>${fmt0(spent)} / ${budget ? fmt0(budget) : 'no limit'}</em></div>
      <div class="pb"><u style="width:${clamp(p, 0, 1) * 100}%;background:${st[0]}"></u></div>
      ${st[2] ? `<div class="note" style="color:var(--mute)"><b style="color:${st[0]}">${st[1]}</b>${st[2]}${carry > 0 ? ` · incl. ${fmt0(carry)} carried over` : ''}${delta}</div>` : (delta ? `<div class="note" style="color:var(--mute)">${delta}</div>` : '')}
      ${pw ? `<div class="note" style="color:var(--warn)"><b>!</b>On pace to go over by ${fmt0(pw.over)}</div>` : ''}</div>`;
  }).join('');
  return rows || '<div class="empty">No categories yet. Add some in the Budget tab.</div>';
}

/* ---------- views ---------- */
const TABS = [['overview', 'Overview'], ['tx', 'Transactions'], ['budget', 'Budget'], ['goals', 'Goals'], ['recurring', 'Recurring']];

function goalsMini() {
  if (!db.goals.length) return '<div class="empty">Saving for something? Set a goal in the Goals tab and track it here.</div>';
  return db.goals.slice(0, 3).map(g => {
    const p = L.goalProgress(g, realYM());
    return `<div class="prow" data-act="tab" data-t="goals"><div class="t"><i style="background:var(--c2)"></i><span>${esc(g.name)}</span><em>${fmt0(p.saved)} / ${fmt0(g.target)}</em></div><div class="pb"><u style="width:${p.pct * 100}%;background:${p.done ? 'var(--good)' : 'var(--c2)'}"></u></div></div>`;
  }).join('');
}

function viewOverview() {
  const k = calc();
  const pct = k.inc > 0 ? k.spent / k.inc : (k.spent > 0 ? 1 : 0);
  const projPct = k.inc > 0 ? k.projected / k.inc : 0;
  const st = k.inc === 0 && k.spent === 0 ? ['var(--dim)', '–', 'Add income to get started']
    : k.left < 0 ? ['var(--crit)', '✕', 'Over budget']
    : projPct > 1 ? ['var(--bad)', '!', 'On pace to overspend']
    : projPct > .85 ? ['var(--warn)', '!', 'Watch your pace'] : ['var(--good)', '✓', 'On track'];
  const ringCol = pct > 1 ? 'var(--crit)' : pct > .85 ? 'var(--warn)' : 'var(--c0)';
  const filterChip = S.cat ? `<div class="chips"><span class="chip">${esc((k.m.cats.find(c => c.id === S.cat) || {name: '?'}).name)}<button data-act="clearcat" aria-label="Clear category">✕</button></span></div>` : '';
  const banner = L.backupDue(db, Date.now()) ? `<section class="card s12 banner"><div><b>Back up your data</b><div class="sub">${db.lastBackup ? 'Your last backup was on ' + new Date(db.lastBackup).toLocaleDateString() + '.' : 'You have not saved a backup yet.'} Your budget only lives on this device.</div></div><button class="btn" data-act="backup">Save backup</button></section>` : '';
  return `<div class="grid">${banner}
  <section class="card s12"><div class="hero">
    <div class="ring" data-tip="${tip('Spent so far', [fmt(k.spent) + ' of ' + fmt(k.inc) + ' income', Math.round(pct * 100) + '% used'])}">${ringSVG(pct, ringCol)}<div class="c"><span class="sub">Left this month</span><span class="big" id="heroLeft" data-v="${k.left}">${fmt0(k.left)}</span></div></div>
    <div class="hero-r"><span class="status"><b style="background:${st[0]}">${st[1]}</b>${st[2]}</span>
      <div class="big" style="font-size:1.7rem;margin-top:12px">${k.remainingDays > 0 && k.left > 0 ? `${fmt0(k.safe)} <span class="sub" style="font-size:.95rem;font-weight:500">safe to spend per day · ${k.remainingDays} days left</span>` : `<span style="font-size:1.1rem;font-weight:550;color:var(--mute)">${k.elapsed >= k.days ? 'Month complete' : k.left <= 0 && k.inc ? 'No budget left this month' : monthName(cur)}</span>`}</div>
      <div class="kpis"><div class="kpi"><small>Income</small><b>${fmt0(k.inc)}</b></div><div class="kpi"><small>Spent</small><b>${fmt0(k.spent)}</b></div><div class="kpi"><small>Planned</small><b>${fmt0(k.planned)}</b></div></div></div>
  </div></section>

  <section class="card s6"><h2>Where it went <small>Tap a slice to filter</small></h2>${donutHTML(k)}</section>

  <section class="card s6"><h2>Insights</h2><div class="ins">
    <div><small>Saved</small><b style="color:${k.left < 0 ? 'var(--crit)' : 'var(--txt)'}">${fmt0(k.left)}</b><span>${k.inc ? Math.round(k.rate * 100) + '% of income' : 'No income yet'}</span></div>
    <div><small>Daily average</small><b>${fmt0(k.avg)}</b><span>${k.elapsed} day${k.elapsed === 1 ? '' : 's'} counted</span></div>
    <div><small>Projected month-end</small><b>${fmt0(k.projected)}</b><span>${k.inc ? (k.projected > k.inc ? 'Above income by ' + fmt0(k.projected - k.inc) : fmt0(k.inc - k.projected) + ' under income') : 'Needs income'}</span></div>
    <div><small>Biggest expense</small><b>${k.biggest ? fmt0(k.biggest.amount) : '–'}</b><span>${k.biggest ? esc(k.biggest.note || (k.m.cats.find(c => c.id === k.biggest.cat) || {name: ''}).name) : 'Nothing logged'}</span></div>
  </div></section>

  <section class="card s12"><h2><span>Daily spending</span><span class="seg-ctl"><button data-act="mode" data-m="daily" aria-pressed="${S.mode === 'daily'}">Per day</button><button data-act="mode" data-m="cum" aria-pressed="${S.mode === 'cum'}">Running total</button></span></h2>
    ${filterChip}${dailyHTML(k)}</section>

  <section class="card s7"><h2>Last 6 months <small>Tap a month to open it</small></h2><div class="key"><span><i style="background:var(--c0)"></i>Income</span><span><i style="background:var(--c1)"></i>Spent</span></div>${trendHTML()}</section>

  <section class="card s5"><h2>Budget by category</h2>${catBarsHTML(k)}</section>

  <section class="card s7"><h2>When you spend</h2>${weekdayHTML(k)}</section>

  <section class="card s5"><h2>Savings goals <small>${db.goals.length ? 'Open Goals tab' : ''}</small></h2>${goalsMini()}</section>
  </div>`;
}

function viewTx() {
  const k = calc(), m = k.m;
  let list = m.tx.slice();
  if (S.cat) list = list.filter(t => t.cat === S.cat);
  if (S.day) list = list.filter(t => Number(t.date.slice(8)) === Number(S.day));
  const q = S.q.trim().toLowerCase();
  const nameOf = id => (m.cats.find(c => c.id === id) || {name: 'Uncategorised'}).name;
  if (q) list = list.filter(t => (t.note + ' ' + nameOf(t.cat) + ' ' + t.amount).toLowerCase().includes(q));
  list.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
  const groups = {}; list.forEach(t => (groups[t.date] = groups[t.date] || []).push(t));
  const total = L.sum(list.map(t => t.amount));
  const chips = `<div class="chips"><button class="chip" style="cursor:pointer;padding:6px 12px;${!S.cat ? 'border-color:var(--txt)' : ''}" data-act="clearcat">All</button>` +
    m.cats.map(c => `<button class="chip" style="cursor:pointer;padding:6px 12px;${S.cat === c.id ? 'border-color:var(--txt)' : ''}" data-act="cat" data-id="${c.id}"><span style="width:9px;height:9px;border-radius:3px;display:inline-block;background:${colorOf(c)}"></span>${esc(c.name)}</button>`).join('') +
    (S.day ? `<span class="chip">Day ${Number(S.day)}<button data-act="clearday" aria-label="Clear day">✕</button></span>` : '') + `</div>`;
  const rows = Object.keys(groups).map(d => {
    const dt = new Date(d + 'T12:00').toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long'});
    const sum = L.sum(groups[d].map(t => t.amount));
    return `<div class="dayh"><span>${dt}</span><span>${fmt(sum)}</span></div>` + groups[d].map(t => {
      const c = m.cats.find(c => c.id === t.cat) || {name: '?'};
      const extra = (t.rec ? ' · recurring' : '') + (t.fc ? ` · ${t.fc.amt} ${esc(t.fc.code)}` : '') + (t.people > 1 ? ` · your share of ${fmt(t.total)} ÷ ${t.people}` : '');
      return `<div class="swipe"><div class="swipe-bg">Delete</div><div class="tx" data-act="edit" data-id="${t.id}"><i style="background:${colorOf(c)}">${esc(c.name.slice(0, 1).toUpperCase())}</i><div class="d"><b>${esc(t.note || c.name)}</b><small>${esc(c.name)}${extra}</small></div><div class="a">−${fmt(t.amount)}</div></div></div>`;
    }).join('');
  }).join('');
  return `<div class="grid"><section class="card s12"><h2><span>Transactions <small>${list.length} · ${fmt(total)}</small></span><button class="btn ghost" data-act="csv">Export CSV</button></h2>
    <input id="q" type="search" placeholder="Search notes, categories or amounts" value="${esc(S.q)}" style="margin-bottom:12px">${chips}
    ${rows || '<div class="empty">Nothing here yet. Tap + Add (or press N) to log an expense.</div>'}
    ${rows ? '<p class="sub" style="margin:12px 0 0">Tip: on your phone, swipe an expense left to delete it.</p>' : ''}</section></div>`;
}

function allocHTML(k) {
  const base = Math.max(k.inc, k.planned, 1);
  const segs = k.byCat.filter(x => x.budget > 0).map(x => `<u style="width:${x.budget / base * 100}%;background:${colorOf(x.c)}" data-tip="${tip(esc(x.c.name), [fmt(x.budget) + ' planned'])}"></u>`).join('');
  const free = k.inc - k.planned;
  return `<div class="alloc">${segs}${free > 0 ? `<u style="width:${free / base * 100}%;background:var(--panel2);border:1px dashed var(--dim)" data-tip="${tip('Unplanned', [fmt(free)])}"></u>` : ''}</div>
  <div class="sub" style="color:${free < 0 ? 'var(--crit)' : 'var(--dim)'}">${free < 0 ? '✕ Planned ' + fmt(-free) + ' more than your income' : fmt(Math.max(0, free)) + ' of income not planned yet'}</div>`;
}

function viewBudget() {
  const k = calc(), m = k.m;
  const sMax = nice(Math.max(k.inc, k.planned, 500));
  const cats = k.byCat.map(({c, carry}) => `<div class="brow" data-cid="${c.id}"><i style="background:${colorOf(c)}"></i><input class="nm" value="${esc(c.name)}" data-act="rename" data-id="${c.id}" aria-label="Category name"><input type="number" inputmode="decimal" min="0" step="1" value="${c.budget}" data-act="budnum" data-id="${c.id}" aria-label="Budget"><button class="x" data-act="delcat" data-id="${c.id}" aria-label="Delete category">✕</button>
    <div class="sl"><input type="range" min="0" max="${sMax}" step="5" value="${Math.min(c.budget, sMax)}" data-act="budrange" data-id="${c.id}" aria-label="Budget slider">
    <label class="roll"><input type="checkbox" data-act="roll" data-id="${c.id}" ${c.rollover ? 'checked' : ''}> Roll over unspent money${carry > 0 ? ` <b>(+${fmt0(carry)} this month)</b>` : ''}</label></div></div>`).join('');
  const inc = m.income.map(i => `<div class="tx" data-act="editinc" data-id="${i.id}"><i style="background:var(--good)">+</i><div class="d"><b>${esc(i.name)}</b><small>${i.rec ? 'recurring' : 'one-off'}</small></div><div class="a" style="color:var(--good)">+${fmt(i.amount)}</div></div>`).join('');
  return `<div class="grid">
  <section class="card s7"><h2>Plan your month <small>Drag a slider or type</small></h2><div id="alloc">${allocHTML(k)}</div><div style="margin-top:12px">${cats || '<div class="empty">No categories yet.</div>'}</div>
    <div class="frow" style="margin-top:14px"><input id="newCat" placeholder="New category (e.g. Gym)"><button class="btn" data-act="addcat" style="flex:0 0 auto">Add category</button></div></section>
  <section class="card s5"><h2>Income <small>${fmt(k.inc)}</small></h2>${inc || '<div class="empty">No income yet.</div>'}
    <div class="frow" style="margin-top:12px"><button class="btn" data-act="addinc">Add income</button><button class="btn ghost" data-act="copyinc">Copy from last month</button></div></section>
  <section class="card s12"><h2>Data <small>${db.lastBackup ? 'Last backup ' + new Date(db.lastBackup).toLocaleDateString() : 'No backup yet'}</small></h2><div class="frow" style="align-items:end">
    <div style="flex:0 0 110px"><label class="lbl2" style="margin-top:0">Currency</label><input id="cur" value="${esc(db.cur)}" maxlength="4"></div>
    <button class="btn" data-act="backup">Save backup</button><button class="btn ghost" data-act="imp">Import backup</button><button class="btn danger" data-act="reset">Erase everything</button><input type="file" id="impf" accept=".json,application/json" hidden></div>
    <p class="sub" style="margin:12px 0 0">Everything stays on this device. On iPhone, <b>Save backup</b> opens the share sheet: choose <b>Save to Files</b> to keep a copy in iCloud Drive.</p></section></div>`;
}

function viewGoals() {
  const ym = realYM();
  const cards = db.goals.map(g => {
    const p = L.goalProgress(g, ym);
    const need = p.done ? '<b style="color:var(--good)">✓ Goal reached</b>' : p.perMonth !== null ? `Save <b>${fmt0(p.perMonth)}</b> a month for ${p.monthsLeft} month${p.monthsLeft === 1 ? '' : 's'}` : `${fmt0(p.remaining)} to go`;
    return `<div class="goal"><div>${miniRing(p.pct, p.done ? 'var(--good)' : 'var(--c2)', g.name + ' progress')}</div>
      <div class="gi"><b>${esc(g.name)}</b><div class="sub">${fmt0(p.saved)} of ${fmt0(g.target)}${g.due ? ' · by ' + monthName(g.due.slice(0, 7)) : ''}</div><div class="sub" style="margin-top:2px">${need}</div>
      <div class="frow" style="margin-top:10px;flex-wrap:nowrap"><button class="btn" data-act="gadd" data-id="${g.id}" style="flex:1">Add money</button><button class="x" data-act="gdel" data-id="${g.id}" aria-label="Delete goal">✕</button></div></div></div>`;
  }).join('');
  return `<div class="grid"><section class="card s7"><h2>Your goals</h2>${cards || '<div class="empty">No goals yet. Add one on the right, for example a trip or a new laptop.</div>'}</section>
  <section class="card s5"><h2>New goal</h2>
    <label class="lbl2">What are you saving for?</label><input id="gName" placeholder="Amsterdam trip">
    <div class="frow"><div><label class="lbl2">Target</label><input id="gTarget" inputmode="decimal" placeholder="600"></div><div><label class="lbl2">By (optional)</label><input id="gDue" type="month"></div></div>
    <button class="btn" data-act="gnew" style="width:100%;margin-top:16px">Add goal</button></section></div>`;
}

function viewRecurring() {
  const cats = M().cats;
  const exp = L.sum(db.recurring.filter(r => r.kind === 'expense').map(r => r.amount));
  const inc = L.sum(db.recurring.filter(r => r.kind === 'income').map(r => r.amount));
  const rows = db.recurring.map(r => `<div class="tx" style="cursor:default"><i style="background:${r.kind === 'income' ? 'var(--good)' : colorOf({name: r.cat})}">${r.kind === 'income' ? '+' : esc(r.cat.slice(0, 1).toUpperCase())}</i><div class="d"><b>${esc(r.name)}</b><small>${r.kind === 'income' ? 'Income' : esc(r.cat)} · day ${r.day} each month</small></div><div class="a">${r.kind === 'income' ? '+' : '−'}${fmt(r.amount)}</div><button class="x" data-act="delrec" data-id="${r.id}" aria-label="Delete">✕</button></div>`).join('');
  return `<div class="grid"><section class="card s7"><h2>Repeats every month <small>${fmt(exp)} out · ${fmt(inc)} in</small></h2>${rows || '<div class="empty">Add rent, subscriptions or your salary once and they appear in every month automatically.</div>'}</section>
  <section class="card s5"><h2>New recurring item</h2>
    <div class="kind" id="rk"><button data-act="rkind" data-k="expense" aria-pressed="true">Expense</button><button data-act="rkind" data-k="income" aria-pressed="false">Income</button></div>
    <label class="lbl2">Name</label><input id="rName" placeholder="Rent, Netflix, Salary…">
    <div class="frow"><div><label class="lbl2">Amount</label><input id="rAmt" inputmode="decimal" placeholder="0.00"></div><div><label class="lbl2">Day of month</label><input id="rDay" type="number" min="1" max="31" value="1"></div></div>
    <div id="rCatWrap"><label class="lbl2">Category</label><select id="rCat">${cats.map(c => `<option>${esc(c.name)}</option>`).join('')}</select></div>
    <button class="btn" data-act="addrec" style="width:100%;margin-top:16px">Save recurring item</button></section></div>`;
}

/* ---------- render ---------- */
let lastLeft = null;
function render(keepScroll = true) {
  applyRecurring();
  $('monthLabel').textContent = monthName(cur);
  $('tabs').innerHTML = TABS.map(([id, label]) => `<button role="tab" aria-selected="${S.tab === id}" data-act="tab" data-t="${id}">${label}</button>`).join('');
  const html = S.tab === 'overview' ? viewOverview() : S.tab === 'tx' ? viewTx() : S.tab === 'budget' ? viewBudget() : S.tab === 'goals' ? viewGoals() : viewRecurring();
  const y = scrollY; $('view').innerHTML = html; if (keepScroll) scrollTo(0, y);
  const arc = $('ringArc');
  if (arc) requestAnimationFrame(() => requestAnimationFrame(() => arc.setAttribute('stroke-dashoffset', arc.dataset.to)));
  const hl = $('heroLeft');
  if (hl) { const to = Number(hl.dataset.v); countUp(hl, lastLeft === null ? 0 : lastLeft, to); lastLeft = to; }
  const q = $('q'); if (q && S.focusQ) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); S.focusQ = false; }
  save();
}
function countUp(el, from, to) {
  if (reduceMotion || from === to) { el.textContent = fmt0(to); return; }
  const t0 = performance.now();
  const step = t => { const p = Math.min(1, (t - t0) / 600), e = 1 - Math.pow(1 - p, 3); el.textContent = fmt0(from + (to - from) * e); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ---------- toast / tooltip ---------- */
let toastT, undoFn;
function toast(msg, undo) {
  $('toastMsg').textContent = msg; undoFn = undo || null;
  $('toastUndo').style.display = undo ? '' : 'none';
  $('toast').classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => $('toast').classList.remove('on'), 5000);
}
$('toastUndo').onclick = () => { if (undoFn) undoFn(); $('toast').classList.remove('on'); };

const tipEl = $('tip');
document.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { tipEl.style.opacity = 0; return; }
  tipEl.innerHTML = t.dataset.tip; tipEl.style.opacity = 1;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = clamp(e.clientX + 14, 8, innerWidth - w - 8) + 'px';
  tipEl.style.top = (e.clientY + h + 24 > innerHeight ? e.clientY - h - 14 : e.clientY + 16) + 'px';
});
document.addEventListener('pointerleave', () => tipEl.style.opacity = 0);
addEventListener('scroll', () => tipEl.style.opacity = 0, {passive: true});

/* ---------- add / edit dialog ---------- */
const dlg = $('dlg');
const defaultDate = () => cur === realYM() ? todayStr() : cur + '-01';

function quickLog(e) {
  const m = M(), c = L.ensureCat(m, e.catName, uid);
  const t = {id: uid(), cat: c.id, amount: e.amount, note: e.note, date: defaultDate()};
  m.tx.push(t); db.lastCat = c.name; render();
  toast(`${e.note} ${fmt(e.amount)} added`, () => { m.tx = m.tx.filter(x => x.id !== t.id); render(); });
}

function openDlg(opt = {}) {
  const m = M();
  const edit = opt.id ? (opt.kind === 'income' ? m.income.find(i => i.id === opt.id) : m.tx.find(t => t.id === opt.id)) : null;
  let kind = opt.kind || 'expense';
  let catId = (edit && edit.cat) || opt.cat || ((m.cats.find(c => c.name === db.lastCat) || {}).id) || (m.cats[0] && m.cats[0].id);
  const defDate = (edit && edit.date) || defaultDate();
  const chips = !edit ? L.frequentQuick(db, 4) : [];
  const amtInit = edit ? (edit.fc ? edit.fc.amt : (edit.total !== undefined ? edit.total : edit.amount)) : '';
  const peopleInit = edit && edit.people > 1 ? edit.people : 1;
  const fcInit = edit && edit.fc ? edit.fc : null;

  const draw = () => {
    dlg.innerHTML = `<form method="dialog" id="df"><h3>${edit ? 'Edit' : 'Add'} ${kind}</h3>
    ${edit ? '' : `<div class="kind"><button type="button" data-k="expense" aria-pressed="${kind === 'expense'}">Expense</button><button type="button" data-k="income" aria-pressed="${kind === 'income'}">Income</button></div>`}
    ${kind === 'expense' && chips.length ? `<label class="lbl2">Quick add <span class="sub">(one tap logs it)</span></label><div class="quick">${chips.map((c, i) => `<button type="button" data-q="${i}">${esc(c.note)} <b>${fmt(c.amount)}</b></button>`).join('')}</div>` : ''}
    <label class="lbl2">Amount (${esc(db.cur)}) <span class="sub">· you can type 3.5+2.2</span></label>
    <input class="amt" id="dAmt" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${amtInit}" required>
    <div class="ops">${['+', '−', '×', '÷'].map(o => `<button type="button" data-op="${o}">${o}</button>`).join('')}<span id="dPrev" class="sub"></span></div>
    ${kind === 'expense' ? `<label class="lbl2">Category</label><div class="catpick" id="dCats">${m.cats.map(c => `<button type="button" data-c="${c.id}" aria-pressed="${c.id === catId}"><i style="background:${colorOf(c)}"></i>${esc(c.name)}</button>`).join('')}</div>` : ''}
    <label class="lbl2">${kind === 'expense' ? 'Note' : 'Source'}</label><input id="dNote" placeholder="${kind === 'expense' ? 'Optional' : 'Salary, freelance…'}" value="${esc(edit ? (edit.note !== undefined ? edit.note : edit.name || '') : '')}">
    ${kind === 'expense' ? `<label class="lbl2">Date</label><input id="dDate" type="date" min="${cur}-01" max="${cur}-${daysIn(cur)}" value="${defDate}">
    <details ${peopleInit > 1 || fcInit ? 'open' : ''}><summary>Split or other currency</summary>
      <div class="frow"><div><label class="lbl2">Split between (people)</label><input id="dPeople" type="number" min="1" max="50" step="1" value="${peopleInit}"></div></div>
      <div class="frow"><div><label class="lbl2">Paid in (code)</label><input id="dFc" maxlength="3" placeholder="USD" value="${fcInit ? esc(fcInit.code) : ''}" autocapitalize="characters"></div>
      <div><label class="lbl2">1 unit = ${esc(db.cur)}</label><input id="dRate" inputmode="decimal" placeholder="0.92" value="${fcInit ? fcInit.rate : ''}"></div></div>
      <p class="sub" style="margin:8px 0 0">Your budget counts only your share, converted to ${esc(db.cur)}.</p></details>` : ''}
    <div class="frow" style="margin-top:20px"><button class="btn" type="submit" id="dSave" style="flex:2">${edit ? 'Save changes' : 'Add ' + kind}</button>${edit ? '<button class="btn danger" type="button" id="dDel">Delete</button>' : ''}<button class="btn ghost" type="button" id="dCancel">Cancel</button></div></form>`;

    const compute = () => {
      const a = L.evalExpr($('dAmt').value);
      if (!(a > 0)) return null;
      const code = ($('dFc') && $('dFc').value.trim().toUpperCase()) || '', rate = $('dRate') ? num($('dRate').value) : 0;
      const fc = code && rate > 0 ? {code, amt: a, rate} : null;
      const home = fc ? L.toHome(a, rate) : a;
      const people = $('dPeople') ? Math.max(1, Math.floor(num($('dPeople').value)) || 1) : 1;
      return {a, fc, home, people, share: L.splitShare(home, people)};
    };
    const preview = () => {
      const c = compute(), p = $('dPrev');
      if (!c) { p.textContent = ''; return; }
      const bits = [];
      if (/[+\-−×÷*/]/.test($('dAmt').value.replace(/^-/, ''))) bits.push('= ' + fmt(c.a));
      if (c.fc) bits.push(`${fmt(c.home)} in ${db.cur}`);
      if (c.people > 1) bits.push(`your share ${fmt(c.share)}`);
      p.textContent = bits.join(' · ');
    };
    dlg.querySelectorAll('.kind [data-k]').forEach(b => b.onclick = () => { kind = b.dataset.k; draw(); $('dAmt').focus(); });
    dlg.querySelectorAll('#dCats [data-c]').forEach(b => b.onclick = () => { catId = b.dataset.c; dlg.querySelectorAll('#dCats [data-c]').forEach(x => x.setAttribute('aria-pressed', x === b)); });
    dlg.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { dlg.close(); quickLog(chips[Number(b.dataset.q)]); });
    dlg.querySelectorAll('[data-op]').forEach(b => b.onclick = () => { const i = $('dAmt'); i.value += b.dataset.op; i.focus(); preview(); });
    ['dAmt', 'dPeople', 'dFc', 'dRate'].forEach(id => { if ($(id)) $(id).addEventListener('input', () => {
      if (id === 'dFc' && $('dFc').value.length === 3 && !$('dRate').value && db.rates[$('dFc').value.toUpperCase()]) $('dRate').value = db.rates[$('dFc').value.toUpperCase()];
      preview();
    }); });
    preview();
    $('dCancel').onclick = () => dlg.close();
    if ($('dDel')) $('dDel').onclick = () => { dlg.close(); removeItem(kind, edit.id); };
    $('df').onsubmit = e => {
      e.preventDefault();
      const c = compute(); if (!c) { $('dAmt').focus(); toast('Enter an amount like 12.50 or 3+4.5'); return; }
      const note = $('dNote').value.trim();
      if (kind === 'income') {
        if (edit) { edit.amount = c.a; edit.name = note || 'Income'; } else m.income.push({id: uid(), name: note || 'Income', amount: c.a});
      } else {
        if (!catId) { toast('Add a category first (Budget tab)'); return; }
        const date = $('dDate').value || defDate;
        if (c.fc) db.rates[c.fc.code] = c.fc.rate;
        const t = {id: edit ? edit.id : uid(), cat: catId, amount: c.share, note, date};
        if (c.fc) t.fc = c.fc;
        if (c.people > 1) { t.people = c.people; t.total = c.home; }
        if (edit && edit.rec) t.rec = edit.rec;
        if (edit && edit.goal) t.goal = edit.goal;
        if (edit) m.tx[m.tx.findIndex(x => x.id === edit.id)] = t; else m.tx.push(t);
        db.lastCat = (m.cats.find(x => x.id === catId) || {}).name || db.lastCat;
      }
      dlg.close(); render();
      toast(edit ? 'Saved' : (kind === 'income' ? 'Income added' : 'Expense added'));
    };
  };
  dlg.dataset.setup = '';
  draw(); dlg.showModal(); setTimeout(() => $('dAmt') && $('dAmt').focus(), 30);
}
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

function openGoalDlg(id) {
  const g = db.goals.find(g => g.id === id); if (!g) return;
  dlg.dataset.setup = '';
  dlg.innerHTML = `<form method="dialog" id="gf"><h3>Add money to “${esc(g.name)}”</h3>
    <label class="lbl2">Amount (${esc(db.cur)})</label><input class="amt" id="gAmt" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" required>
    <label class="roll" style="margin-top:14px"><input type="checkbox" id="gCount" checked> Also count it as spending this month (in Savings)</label>
    <div class="frow" style="margin-top:20px"><button class="btn" type="submit" style="flex:2">Add money</button><button class="btn ghost" type="button" id="gCancel">Cancel</button></div></form>`;
  $('gCancel').onclick = () => dlg.close();
  $('gf').onsubmit = e => {
    e.preventDefault();
    const a = L.evalExpr($('gAmt').value); if (!(a > 0)) { $('gAmt').focus(); return; }
    const contrib = {id: uid(), date: todayStr(), amount: a};
    if ($('gCount').checked) {
      const m = L.ensureMonth(db, realYM(), uid), c = L.ensureCat(m, 'Savings', uid);
      const t = {id: uid(), cat: c.id, amount: a, note: 'Goal: ' + g.name, date: todayStr(), goal: g.id};
      m.tx.push(t); contrib.tx = t.id;
    }
    g.contribs = g.contribs || []; g.contribs.push(contrib);
    dlg.close(); render();
    const p = L.goalProgress(g, realYM());
    toast(p.done ? `🎉 “${g.name}” reached!` : `Added ${fmt(a)} to ${g.name}`);
  };
  dlg.showModal(); setTimeout(() => $('gAmt').focus(), 30);
}

function openSetup() {
  dlg.dataset.setup = '1';
  dlg.innerHTML = `<form method="dialog" id="sf"><h3>Welcome</h3><p class="sub" style="margin:0 0 4px">Set up your first month in 30 seconds. You can change everything later.</p>
    <div class="frow"><div style="flex:0 0 100px"><label class="lbl2">Currency</label><input id="sCur" value="${esc(db.cur)}" maxlength="4"></div><div><label class="lbl2">Monthly income (optional)</label><input id="sInc" inputmode="decimal" placeholder="e.g. 1500"></div></div>
    <label class="roll" style="margin-top:10px"><input type="checkbox" id="sRep" checked> Repeat this income every month</label>
    <label class="lbl2">Monthly limits <span class="sub">(0 means no limit)</span></label>
    ${L.DEFAULT_CATS.map(([n]) => `<div class="sc"><span><i style="background:var(--c${slotFor(n)})"></i>${esc(n)}</span><input data-sc="${esc(n)}" inputmode="decimal" value="0" aria-label="${esc(n)} limit"></div>`).join('')}
    <div class="frow" style="margin-top:20px"><button class="btn" type="submit" style="flex:2">Start budgeting</button><button class="btn ghost" type="button" id="sSkip">Skip</button></div></form>`;
  $('sSkip').onclick = () => dlg.close();
  $('sf').onsubmit = e => {
    e.preventDefault();
    db.cur = $('sCur').value.trim() || '€';
    const m = M();
    dlg.querySelectorAll('[data-sc]').forEach(i => { const c = m.cats.find(c => c.name === i.dataset.sc); if (c) c.budget = Math.max(0, L.evalExpr(i.value) || 0); });
    const inc = L.evalExpr($('sInc').value);
    if (inc > 0) {
      if ($('sRep').checked) { db.recurring.push({id: uid(), kind: 'income', name: 'Salary', amount: inc, day: 1, from: cur}); applyRecurring(); }
      else m.income.push({id: uid(), name: 'Salary', amount: inc});
    }
    db.setupDone = true; dlg.close(); render();
  };
  dlg.showModal();
}
dlg.addEventListener('close', () => { if (dlg.dataset.setup === '1') { db.setupDone = true; dlg.dataset.setup = ''; render(); } });

function removeItem(kind, id) {
  const m = M();
  const list = kind === 'income' ? m.income : m.tx, i = list.findIndex(x => x.id === id);
  if (i < 0) return;
  const [item] = list.splice(i, 1);
  if (item.rec) m.skip.push(item.rec);
  render();
  toast(kind === 'income' ? 'Income deleted' : 'Expense deleted', () => { list.splice(i, 0, item); if (item.rec) m.skip = m.skip.filter(x => x !== item.rec); render(); });
}

/* ---------- backup ---------- */
function download(name, text, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click();
}
function markBackup() { db.lastBackup = new Date().toISOString(); render(); toast('Backup saved'); }
async function backup() {
  const txt = JSON.stringify(db, null, 2), name = 'budget-backup-' + todayStr() + '.json';
  try {
    const file = new File([txt], name, {type: 'application/json'});
    if (navigator.canShare && navigator.canShare({files: [file]})) { await navigator.share({files: [file], title: 'Budget backup'}); markBackup(); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  download(name, txt, 'application/json'); markBackup();
}

/* ---------- events ---------- */
let swiped = false;
document.addEventListener('click', async e => {
  if (swiped) return;
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, id = t.dataset.id, m = M();
  switch (a) {
    case 'tab': S.tab = t.dataset.t; render(false); scrollTo(0, 0); break;
    case 'mode': S.mode = t.dataset.m; render(); break;
    case 'cat': S.cat = S.cat === id ? null : id; render(); break;
    case 'clearcat': S.cat = null; render(); break;
    case 'clearday': S.day = null; render(); break;
    case 'day': S.day = t.dataset.day; S.tab = 'tx'; render(false); scrollTo(0, 0); break;
    case 'month': cur = t.dataset.ym; S.day = null; render(); break;
    case 'edit': openDlg({id, kind: 'expense'}); break;
    case 'editinc': openDlg({id, kind: 'income'}); break;
    case 'addinc': openDlg({kind: 'income'}); break;
    case 'backup': backup(); break;
    case 'delcat': {
      const c = m.cats.find(c => c.id === id), n = m.tx.filter(x => x.cat === id).length;
      if (n && !confirm(`Delete "${c.name}" and its ${n} expense${n > 1 ? 's' : ''} this month?`)) break;
      const snapC = m.cats.slice(), snapT = m.tx.slice();
      m.cats = m.cats.filter(c => c.id !== id); m.tx = m.tx.filter(x => x.cat !== id); render();
      toast('Category deleted', () => { m.cats = snapC; m.tx = snapT; render(); }); break;
    }
    case 'addcat': { const el = $('newCat'), n = el.value.trim(); if (!n) { el.focus(); break; } if (m.cats.some(c => c.name.toLowerCase() === n.toLowerCase())) { toast('That category already exists'); break; } m.cats.push({id: uid(), name: n, budget: 0}); render(); break; }
    case 'copyinc': {
      const prev = db.months[shift(cur, -1)]; if (!prev || !prev.income.length) { toast('No income last month'); break; }
      prev.income.forEach(i => { if (!m.income.some(x => x.name === i.name && x.amount === i.amount)) m.income.push({id: uid(), name: i.name, amount: i.amount}); }); render(); toast('Copied income from last month'); break;
    }
    case 'csv': {
      const nm = cid => (m.cats.find(c => c.id === cid) || {}).name || '';
      const rows = [['Date', 'Category', 'Note', 'Your amount', 'Total', 'People', 'Original amount', 'Currency']].concat([...m.tx].sort((a, b) => a.date.localeCompare(b.date)).map(x => [x.date, nm(x.cat), x.note, x.amount, x.total !== undefined ? x.total : x.amount, x.people || 1, x.fc ? x.fc.amt : '', x.fc ? x.fc.code : '']));
      download(`spending-${cur}.csv`, L.toCSV(rows), 'text/csv'); break;
    }
    case 'imp': $('impf').click(); break;
    case 'reset': if (confirm('Erase ALL budget data on this device? Save a backup first if unsure.')) { db = L.migrate({cur: db.cur, theme: db.theme}); db.setupDone = false; render(); openSetup(); } break;
    case 'rkind': document.querySelectorAll('#rk button').forEach(b => b.setAttribute('aria-pressed', b === t)); $('rCatWrap').style.display = t.dataset.k === 'income' ? 'none' : ''; $('rk').dataset.k = t.dataset.k; break;
    case 'addrec': {
      const kind = ($('rk').dataset.k) || 'expense', name = $('rName').value.trim(), amt = L.evalExpr($('rAmt').value), day = clamp(Math.round(num($('rDay').value)) || 1, 1, 31);
      if (!name || !(amt > 0)) { toast('Enter a name and an amount'); break; }
      const cat = kind === 'expense' ? $('rCat').value : '';
      if (kind === 'expense' && !cat) { toast('Add a category first'); break; }
      db.recurring.push({id: uid(), kind, name, amount: amt, cat, day, from: cur}); render(); toast('Saved. It now appears every month'); break;
    }
    case 'delrec': { const r = db.recurring.find(r => r.id === id); if (!r) break; db.recurring = db.recurring.filter(r => r.id !== id); Object.values(db.months).forEach(mm => { mm.tx = mm.tx.filter(x => x.rec !== id); mm.income = mm.income.filter(x => x.rec !== id); }); render(); toast('Recurring item removed from all months'); break; }
    case 'gnew': {
      const name = $('gName').value.trim(), target = L.evalExpr($('gTarget').value), due = $('gDue').value;
      if (!name || !(target > 0)) { toast('Give the goal a name and a target amount'); break; }
      db.goals.push({id: uid(), name, target, due: due || '', contribs: [], created: todayStr()}); render(); toast('Goal added'); break;
    }
    case 'gadd': openGoalDlg(id); break;
    case 'gdel': {
      const g = db.goals.find(g => g.id === id); if (!g) break;
      if (!confirm(`Delete the goal "${g.name}"? Any spending entries it created stay in your transactions.`)) break;
      const i = db.goals.indexOf(g); db.goals.splice(i, 1); render();
      toast('Goal deleted', () => { db.goals.splice(i, 0, g); render(); }); break;
    }
  }
});

document.addEventListener('input', e => {
  const t = e.target, a = t.dataset.act, m = M();
  if (t.id === 'q') { S.q = t.value; S.focusQ = true; render(); return; }
  if (a === 'budrange' || a === 'budnum') {
    const c = m.cats.find(c => c.id === t.dataset.id); c.budget = Math.max(0, num(t.value));
    const row = t.closest('.brow'); if (a === 'budrange') row.querySelector('[data-act=budnum]').value = c.budget; else row.querySelector('[data-act=budrange]').value = Math.min(c.budget, Number(row.querySelector('[data-act=budrange]').max));
    $('alloc').innerHTML = allocHTML(calc()); save();
  }
});
document.addEventListener('change', e => {
  const t = e.target, m = M();
  if (t.dataset.act === 'rename') { const n = t.value.trim(), c = m.cats.find(c => c.id === t.dataset.id); if (n && !m.cats.some(x => x !== c && x.name.toLowerCase() === n.toLowerCase())) { c.name = n; slotFor(n); } render(); }
  if (t.dataset.act === 'budrange' || t.dataset.act === 'budnum') render();
  if (t.dataset.act === 'roll') { m.cats.find(c => c.id === t.dataset.id).rollover = t.checked; render(); }
  if (t.id === 'cur') { db.cur = t.value.trim() || '€'; render(); }
  if (t.id === 'impf') {
    t.files[0].text().then(txt => { try { const d = JSON.parse(txt); if (!d.months) throw 0; if (!confirm('Replace all current data with this backup?')) return; db = L.migrate(d); db.setupDone = true; render(); toast('Backup restored'); } catch (_) { toast('That is not a valid backup file'); } });
  }
});

$('fab').onclick = () => openDlg({cat: S.cat});
$('prev').onclick = () => { cur = shift(cur, -1); S.day = null; render(); };
$('next').onclick = () => { cur = shift(cur, 1); S.day = null; render(); };
$('monthLabel').onclick = () => { cur = realYM(); S.day = null; render(); };
$('themeBtn').onclick = () => { const order = ['auto', 'dark', 'light']; db.theme = order[(order.indexOf(db.theme) + 1) % 3]; applyTheme(); save(); toast('Theme: ' + db.theme); };
function applyTheme() {
  const r = document.documentElement;
  if (db.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', db.theme);
}
document.addEventListener('keydown', e => {
  const typing = /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (typing || dlg.open || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'n') { e.preventDefault(); openDlg({cat: S.cat}); }
  if (e.key === 'ArrowLeft') $('prev').click();
  if (e.key === 'ArrowRight') $('next').click();
  if (e.key === 't') $('monthLabel').click();
  if (e.key >= '1' && e.key <= String(TABS.length)) { S.tab = TABS[e.key - 1][0]; render(false); }
});

/* ---------- touch: swipe to delete, pull to refresh ---------- */
let sw0 = null;
document.addEventListener('touchstart', e => {
  const row = e.target.closest && e.target.closest('.swipe .tx');
  if (!row || e.touches.length !== 1) return;
  sw0 = {row, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, lock: null};
}, {passive: true});
document.addEventListener('touchmove', e => {
  if (!sw0) return;
  const dx = e.touches[0].clientX - sw0.x, dy = e.touches[0].clientY - sw0.y;
  if (sw0.lock === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) sw0.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  if (sw0.lock !== 'x') return;
  sw0.dx = Math.min(0, dx); sw0.row.style.transition = 'none'; sw0.row.style.transform = `translateX(${sw0.dx}px)`;
}, {passive: true});
document.addEventListener('touchend', () => {
  if (!sw0) return;
  const {row, dx, lock} = sw0; sw0 = null;
  row.style.transition = '';
  if (lock === 'x') { swiped = true; setTimeout(() => swiped = false, 350); }
  if (lock === 'x' && dx < -90) { row.style.transform = 'translateX(-110%)'; setTimeout(() => removeItem('expense', row.dataset.id), 160); }
  else row.style.transform = '';
});

const ptr = $('ptr');
let pull = null;
async function refreshApp() {
  toast('Checking for updates…');
  try { const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (r) await r.update(); } catch (e) {}
  setTimeout(() => location.reload(), 400);
}
document.addEventListener('touchstart', e => {
  if (scrollY <= 0 && !dlg.open && e.touches.length === 1 && !(e.target.closest && e.target.closest('.swipe, input, .chart'))) pull = {y: e.touches[0].clientY, d: 0};
}, {passive: true});
document.addEventListener('touchmove', e => {
  if (!pull) return;
  pull.d = e.touches[0].clientY - pull.y;
  if (pull.d > 8 && scrollY <= 0) { ptr.style.transform = `translateY(${Math.min(pull.d, 110) - 50}px)`; ptr.textContent = pull.d > 80 ? 'Release to refresh' : 'Pull to refresh'; }
}, {passive: true});
document.addEventListener('touchend', () => {
  if (!pull) return;
  const d = pull.d; pull = null; ptr.style.transform = '';
  if (d > 80 && scrollY <= 0) refreshApp();
});

applyTheme();
render();
if (!db.setupDone) openSetup();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
