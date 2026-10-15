// ─────────────────────────────────────────────────────────────
// The ledger and its tools. ALL arithmetic lives here.
// The language model never computes a number: it picks a tool,
// the tool computes, and every figure carries the ids of the
// transactions it was computed from (so the UI can show them).
// ─────────────────────────────────────────────────────────────
import { TODAY, START, DAYS, addDays, dow, dom, daysBetween, dateAr, DOW_AR, MONTH_AR, PRODUCTS, productBySku, CUSTOMERS, customerById,
  SUPPLIERS, EXPENSES, PAYABLES, OPENING_STOCK, cashEffect, walletEffect, groupBy, r250, fmt } from './data.js';

// ── periods ──
export function period(key, arg) {
  const T = TODAY;
  const satStart = (d) => addDays(d, -((dow(d) + 1) % 7)); // week starts Saturday
  switch (key) {
    case 'today': return { from: T, to: T, label: 'اليوم' };
    case 'yesterday': return { from: addDays(T, -1), to: addDays(T, -1), label: 'البارحة' };
    case 'this_week': return { from: satStart(T), to: T, label: 'هالأسبوع' };
    case 'last_week': { const s = addDays(satStart(T), -7); return { from: s, to: addDays(s, 6), label: 'الأسبوع الماضي' }; }
    case 'last7': return { from: addDays(T, -6), to: T, label: 'آخر 7 أيام' };
    case 'prev7': return { from: addDays(T, -13), to: addDays(T, -7), label: 'الـ7 أيام اللي قبلها' };
    case 'this_month': return { from: T.slice(0, 8) + '01', to: T, label: 'هالشهر' };
    case 'last_month': { const d = new Date(T.slice(0, 8) + '01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); const f = d.toISOString().slice(0, 10); const e = addDays(T.slice(0, 8) + '01', -1); return { from: f, to: e, label: 'الشهر الماضي' }; }
    case 'last30': return { from: addDays(T, -29), to: T, label: 'آخر 30 يوم' };
    case 'month': { const m = String(arg).padStart(2, '0'); const y = +m > +T.slice(5, 7) ? String(+T.slice(0, 4) - 1) : T.slice(0, 4); const f = `${y}-${m}-01`; const d = new Date(f + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); const e = addDays(d.toISOString().slice(0, 10), -1); return { from: f, to: e < T ? e : T, label: `شهر ${MONTH_AR[+m - 1]}` }; }
    case 'day': return { from: arg, to: arg, label: dateAr(arg) };
    case 'all': default: return { from: START, to: T, label: 'كل الفترة' };
  }
}
export const inP = (t, p) => t.date >= p.from && t.date <= p.to;
export const coversData = (p) => p.to >= START && p.from <= TODAY;

// ── Arabic name normalisation for fuzzy matching ──
export const norm = (s) => (s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/گ/g, 'ك').replace(/چ/g, 'ج')
  .replace(/[ًٌٍَُِّْـ]/g, '').replace(/\s+/g, ' ').trim();
export function findCustomer(q) {
  const n = norm(q);
  if (!n) return null;
  let best = null, score = 0;
  for (const c of CUSTOMERS) {
    for (const cand of [c.name, c.full, c.name.replace(/^(ابو|أبو|ام|أم|حجي|سيد|ست)\s*/, '')]) {
      const cn = norm(cand);
      let s = 0;
      if (n.includes(cn)) s = cn.length + 5;
      else if (cn.includes(n) && n.length >= 3) s = n.length;
      if (s > score) { score = s; best = c; }
    }
  }
  return best;
}
export function findProduct(q) {
  const n = norm(q);
  for (const p of PRODUCTS) if ([p.name, ...p.alias].some((a) => n.includes(norm(a)))) return p;
  return null;
}

const fig = (key, label, value, ids = []) => ({ key, label, value: Math.round(value), ids });
const sum = (arr, f = (t) => t.amount) => arr.reduce((a, t) => a + f(t), 0);
const cogsOf = (t) => (t.items || []).reduce((a, i) => a + (i.qty || 0) * (i.cost || 0), 0);

export class Ledger {
  constructor(gen) {
    this.tx = gen.tx.map((t) => ({ ...t }));
    this.closings = gen.closings.map((c) => ({ ...c }));
    this.fx = gen.fx;
    this.openingWallet = gen.openingWallet;
    this.seq = this.tx.length;
    this.payables = PAYABLES.map((p) => ({ ...p }));
  }
  byId(id) { return this.tx.find((t) => t.id === id); }
  add(o) {
    const t = { id: 'T' + String(++this.seq).padStart(4, '0'), date: TODAY, ...o };
    this.tx.push(t);
    if (t.channel === 'cash' || t.type === 'transfer') { const c = this.closings.at(-1); c.expected += cashEffect(t); }
    return t;
  }
  // undo: take a transaction back out (used by the audit log's «تراجع» within 5 minutes)
  remove(id) {
    const i = this.tx.findIndex((t) => t.id === id); if (i < 0) return null;
    const [t] = this.tx.splice(i, 1);
    if (t.channel === 'cash' || t.type === 'transfer') { const c = this.closings.at(-1); c.expected -= cashEffect(t); }
    return t;
  }
  rateOn(date) { const d = Math.max(0, Math.min(this.fx.length - 1, daysBetween(START, date))); return this.fx[d]; }
  currentCost(sku) {
    const p = productBySku(sku);
    const buys = this.tx.filter((t) => t.type === 'purchase' && t.items?.some((i) => i.sku === sku));
    const last = buys.at(-1);
    return last ? last.items.find((i) => i.sku === sku).cost : (p.costIQD || r250(p.costUSD * this.rateOn(TODAY)));
  }

  // ── TOOLS ──
  sales({ period: pk = 'today', arg, channel = 'all' } = {}) {
    const p = period(pk, arg);
    if (!coversData(p)) return { tool: 'sales', period: p, empty: true, figures: [] };
    const all = this.tx.filter((t) => inP(t, p) && (t.type === 'sale' || t.type === 'credit_sale'));
    const cash = all.filter((t) => t.channel === 'cash'), wal = all.filter((t) => t.channel === 'wallet'), cr = all.filter((t) => t.channel === 'credit');
    const days = daysBetween(p.from < START ? START : p.from, p.to) + 1;
    const chosen = channel === 'cash' ? cash : channel === 'wallet' ? wal : channel === 'credit' ? cr : all;
    return { tool: 'sales', period: p, channel, figures: [
      fig('total', 'مجموع المبيعات', sum(chosen), chosen.map((t) => t.id)),
      fig('cash', 'كاش', sum(cash), cash.map((t) => t.id)),
      fig('wallet', 'محفظة', sum(wal), wal.map((t) => t.id)),
      fig('credit', 'بالدين', sum(cr), cr.map((t) => t.id)),
      fig('perday', 'معدل اليوم', sum(chosen) / days, chosen.map((t) => t.id)),
    ] };
  }

  profit({ period: pk = 'this_week', arg } = {}) {
    const p = period(pk, arg);
    if (!coversData(p)) return { tool: 'profit', period: p, empty: true, figures: [] };
    const s = this.tx.filter((t) => inP(t, p) && (t.type === 'sale' || t.type === 'credit_sale'));
    const refunds = this.tx.filter((t) => inP(t, p) && t.type === 'refund');
    const ex = this.tx.filter((t) => inP(t, p) && t.type === 'expense' && !t.owner && !t.capital);
    const revenue = sum(s) - sum(refunds), cogs = sum(s, cogsOf), gross = revenue - cogs, exp = sum(ex), net = gross - exp;
    const ids = s.map((t) => t.id);
    return { tool: 'profit', period: p, figures: [
      fig('revenue', 'المبيعات', revenue, [...ids, ...refunds.map((t) => t.id)]),
      fig('cogs', 'كلفة البضاعة المباعة', cogs, ids),
      fig('gross', 'الربح من البضاعة', gross, ids),
      fig('expenses', 'المصاريف', exp, ex.map((t) => t.id)),
      fig('net', 'صافي الربح', net, [...ids, ...ex.map((t) => t.id), ...refunds.map((t) => t.id)]),
    ], marginPct: revenue ? Math.round((gross / revenue) * 1000) / 10 : 0 };
  }

  // FIFO allocation of payments to debts
  debtBook() {
    const out = {};
    for (const c of CUSTOMERS) {
      const debts = this.tx.filter((t) => t.type === 'credit_sale' && t.customer === c.id && !t.voided).map((t) => ({ t, left: t.amount, settled: null }));
      const pays = this.tx.filter((t) => t.type === 'payment_in' && t.customer === c.id);
      for (const pay of pays) {
        let amt = pay.amount;
        // a payment with a debt reference settles that debt first
        const ordered = pay.debtRef ? [...debts.filter((d) => d.t.id === pay.debtRef), ...debts.filter((d) => d.t.id !== pay.debtRef)] : debts;
        for (const d of ordered) {
          if (amt <= 0) break;
          if (d.left <= 0 || d.t.date > pay.date) continue;
          const x = Math.min(d.left, amt); d.left -= x; amt -= x;
          if (d.left === 0) d.settled = pay.date;
        }
      }
      const settled = debts.filter((d) => d.settled);
      const usual = settled.length ? Math.round(sum(settled, (d) => daysBetween(d.t.date, d.settled)) / settled.length) : null;
      const open = debts.filter((d) => d.left > 0).map((d) => ({ id: d.t.id, date: d.t.date, amount: d.t.amount, left: d.left, age: daysBetween(d.t.date, TODAY),
        confirmed: d.t.confirmed, disputed: d.t.disputed }));
      out[c.id] = { customer: c, open, balance: sum(open, (d) => d.left), usual, lastPay: pays.at(-1)?.date || null, payIds: pays.map((p) => p.id) };
    }
    return out;
  }
  debts() {
    const book = Object.values(this.debtBook()).filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance);
    const allIds = book.flatMap((b) => b.open.map((d) => d.id));
    return { tool: 'debts', figures: [fig('total', 'مجموع الديون المفتوحة', sum(book, (b) => b.balance), allIds),
      ...book.map((b) => fig('cust:' + b.customer.id, b.customer.name, b.balance, b.open.map((d) => d.id)))],
      rows: book.map((b) => ({ id: b.customer.id, name: b.customer.name, balance: b.balance, oldest: Math.max(...b.open.map((d) => d.age)), usual: b.usual,
        overdue: Math.max(...b.open.map((d) => d.age)) > Math.max((b.usual ?? b.customer.delay) + 14, 30), unconfirmed: b.open.filter((d) => !d.confirmed).length })) };
  }
  customer({ name } = {}) {
    const c = findCustomer(name);
    if (!c) return { tool: 'customer', empty: true, query: name, figures: [] };
    const b = this.debtBook()[c.id];
    return { tool: 'customer', customer: c, figures: [fig('balance', `المطلوب من ${c.name}`, b.balance, b.open.map((d) => d.id))],
      open: b.open, usual: b.usual, lastPay: b.lastPay };
  }

  topItems({ period: pk = 'this_month', arg } = {}) {
    const p = period(pk, arg);
    if (!coversData(p)) return { tool: 'topItems', period: p, empty: true, figures: [] };
    const s = this.tx.filter((t) => inP(t, p) && (t.type === 'sale' || t.type === 'credit_sale'));
    const agg = {};
    for (const t of s) for (const i of t.items || []) {
      const a = (agg[i.sku] ||= { sku: i.sku, qty: 0, revenue: 0, profit: 0, ids: new Set() });
      a.qty += i.qty; a.revenue += i.qty * i.price; a.profit += i.qty * (i.price - i.cost); a.ids.add(t.id);
    }
    const rows = Object.values(agg).sort((a, b) => b.profit - a.profit).map((a) => ({ ...a, name: productBySku(a.sku).name, ids: [...a.ids] }));
    return { tool: 'topItems', period: p, rows, figures: rows.flatMap((r) => [fig('profit:' + r.sku, `ربح ${r.name}`, r.profit, r.ids), fig('qty:' + r.sku, `كمية ${r.name}`, r.qty, r.ids)]) };
  }

  expenses({ period: pk = 'this_month', arg, category } = {}) {
    const p = period(pk, arg);
    if (!coversData(p)) return { tool: 'expenses', period: p, empty: true, figures: [] };
    const ex = this.tx.filter((t) => inP(t, p) && t.type === 'expense' && (!category || t.category === category));
    const by = groupBy(ex, (t) => t.category);
    return { tool: 'expenses', period: p, category, figures: [fig('total', 'مجموع المصاريف', sum(ex), ex.map((t) => t.id)),
      ...Object.entries(by).map(([k, arr]) => fig('cat:' + k, arr[0].note, sum(arr), arr.map((t) => t.id)))] };
  }

  fxImpact({ period: pk = 'last30', arg } = {}) {
    const p = period(pk, arg);
    const buys = this.tx.filter((t) => inP(t, p) && t.type === 'purchase' && SUPPLIERS[t.supplier]?.currency === 'USD');
    const r0 = this.rateOn(p.from < START ? START : p.from), r1 = this.rateOn(p.to);
    const extra = sum(buys, (t) => t.amount * (1 - r0 / (t.fx || r1)));
    const oilNow = this.currentCost('oil'), oilSell = productBySku('oil').sell;
    return { tool: 'fxImpact', period: p, figures: [fig('rate_from', 'سعر الدولار ببداية الفترة', r0), fig('rate_to', 'سعر الدولار هسه', r1),
      fig('extra', 'كلفة إضافية بسبب الدولار', extra, buys.map((t) => t.id)), fig('usd_buys', 'مشتريات بالدولار', sum(buys), buys.map((t) => t.id))],
      oil: { cost: oilNow, sell: oilSell } };
  }

  position() {
    const cashC = this.closings.at(-1);
    const wallet = this.openingWallet + sum(this.tx, walletEffect);
    const d = this.debts();
    return { tool: 'position', figures: [fig('cash', 'الكاش بالجرار (متوقع)', cashC.expected), fig('wallet', 'رصيد المحفظة', wallet, this.tx.filter((t) => walletEffect(t) !== 0).map((t) => t.id)),
      fig('total', 'المجموع', cashC.expected + wallet), fig('debts', 'ديون عند الناس', d.figures[0].value, d.figures[0].ids)] };
  }

  // ── anomalies (plain rules, each with a reason) ──
  anomalies() {
    const out = [];
    const push = (kind, sev, date, title, reason, ids = [], extra = {}) => out.push({ kind, sev, date, title, reason, ids, ...extra });
    const buys = this.tx.filter((t) => t.type === 'purchase');
    for (let i = 0; i < buys.length; i++) for (let j = i + 1; j < buys.length; j++) {
      const a = buys[i], b = buys[j];
      if (a.supplier === b.supplier && a.amount === b.amount && Math.abs(daysBetween(a.date, b.date)) <= 2)
        push('duplicate_payment', 'high', b.date, `دفعة مكررة لـ${SUPPLIERS[a.supplier].short}`, `نفس المبلغ ${fmt(a.amount)} انرسل مرتين خلال ${Math.abs(daysBetween(a.date, b.date))} يوم`, [a.id, b.id]);
    }
    for (const t of this.tx.filter((t) => t.type === 'payment_in' && t.channel === 'wallet' && !t.customer))
      push('unmatched_in', 'mid', t.date, 'تحويل وارد ما يطابق أي دين', `${fmt(t.amount)} من رقم ${t.fromPhone || 'غير معروف'} وما مسجل على أي زبون`, [t.id]);
    for (const p of PRODUCTS) {
      const bs = buys.filter((t) => t.items?.some((i) => i.sku === p.sku));
      for (let i = 1; i < bs.length; i++) {
        const c0 = bs[i - 1].items.find((x) => x.sku === p.sku).cost, c1 = bs[i].items.find((x) => x.sku === p.sku).cost;
        const r0 = bs[i - 1].fx || 1, r1 = bs[i].fx || 1;
        const usd0 = SUPPLIERS[p.supplier].currency === 'USD' ? c0 / r0 : c0, usd1 = SUPPLIERS[p.supplier].currency === 'USD' ? c1 / r1 : c1;
        if (usd1 > usd0 * 1.08) push('price_jump', 'mid', bs[i].date, `${SUPPLIERS[p.supplier].short} رفع سعر ${p.name}`, `من ${fmt(c0)} إلى ${fmt(c1)} دينار للوحدة (+${Math.round((c1 / c0 - 1) * 100)}%)`, [bs[i - 1].id, bs[i].id], { sku: p.sku });
      }
      const cost = this.currentCost(p.sku);
      if (cost > p.sell) push('below_cost', 'high', TODAY, `${p.name} ينباع بخسارة`, `الكلفة هسه ${fmt(cost)} والبيع ${fmt(p.sell)}، يعني تخسر ${fmt(cost - p.sell)} بكل وحدة`, bs.slice(-1).map((t) => t.id), { sku: p.sku });
    }
    for (const c of this.closings) if (c.counted - c.expected < -5000)
      push('cash_short', 'high', c.date, 'نقص بالكاش عند التسكيرة', `المتوقع ${fmt(c.expected)} والمحسوب ${fmt(c.counted)}، الفرق ${fmt(c.expected - c.counted)}`, this.tx.filter((t) => t.date === c.date && t.channel === 'cash').map((t) => t.id));
    const salesBy = groupBy(this.tx.filter((t) => t.type === 'sale'), (t) => t.date);
    const dayTotal = (d) => sum(salesBy[d] || []);
    for (let k = 28; k < DAYS; k++) {
      const d = addDays(START, k);
      const prev = [7, 14, 21, 28].map((w) => dayTotal(addDays(d, -w)));
      const avg = prev.reduce((a, b) => a + b, 0) / 4;
      if (dayTotal(d) < avg * 0.55) push('low_day', 'low', d, `مبيعات ${DOW_AR[dow(d)]} ${dateAr(d)} نازلة كثير`, `${fmt(dayTotal(d))} مقابل معدل ${fmt(avg)} لنفس اليوم بالأسابيع اللي قبل`, (salesBy[d] || []).map((t) => t.id));
    }
    for (const t of this.tx.filter((t) => t.type === 'refund' && t.amount >= 20000))
      push('odd_refund', 'mid', t.date, 'إرجاع كبير', `إرجاع ${fmt(t.amount)} كاش بدون بيع مسجل يقابله`, [t.id]);
    for (const r of this.debts().rows) if (r.overdue)
      push('overdue', 'mid', TODAY, `دين ${r.name} متأخر`, `أقدم دين عمره ${r.oldest} يوم، وعادته يسدد خلال ${r.usual} يوم`, this.debtBook()[r.id].open.map((d) => d.id), { customer: r.id });
    for (const t of this.tx.filter((t) => t.type === 'adjust' && t.amount >= 20000 && t.shrink))
      push('shrinkage', 'high', t.date, 'نقص بالمخزون عند الجرد', `${t.note}: الناقص قيمته ${fmt(t.amount)} دينار بالكلفة`, [t.id]);
    for (const t of this.tx.filter((t) => t.disputed))
      push('disputed', 'high', t.date, `${customerById(t.customer).name} اعترض على دين`, `دين ${fmt(t.amount)} بتاريخ ${dateAr(t.date)} ما وافق عليه الزبون`, [t.id]);
    return { tool: 'anomalies', items: out.sort((a, b) => (a.sev === b.sev ? (a.date < b.date ? 1 : -1) : ['high', 'mid', 'low'].indexOf(a.sev) - ['high', 'mid', 'low'].indexOf(b.sev))),
      figures: [fig('count', 'عدد التنبيهات', out.length)] };
  }

  // ── 30-day cash forecast: arithmetic on the ledger ──
  forecastModel(asOf = TODAY, lookbackWeeks = 8) {
    const salesBy = groupBy(this.tx.filter((t) => t.type === 'sale' && t.date <= asOf), (t) => t.date);
    const from = addDays(asOf, -7 * lookbackWeeks + 1);
    const byWd = [0, 0, 0, 0, 0, 0, 0].map(() => []);
    const early = [], rest = [];
    for (let d = from; d <= asOf; d = addDays(d, 1)) {
      const v = sum(salesBy[d] || []);
      if (!salesBy[d]) continue;
      (dom(d) <= 6 ? early : rest).push(v);
    }
    const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const salaryFactor = mean(early) / (mean(rest) || 1);
    for (let d = from; d <= asOf; d = addDays(d, 1)) if (salesBy[d]) byWd[dow(d)].push(sum(salesBy[d]) / (dom(d) <= 6 ? salaryFactor : 1));
    const wdAvg = byWd.map(mean);
    const buys = this.tx.filter((t) => t.type === 'purchase' && t.date > addDays(asOf, -28) && t.date <= asOf);
    const weeklyBuy = {}; for (const s of Object.values(SUPPLIERS)) weeklyBuy[s.id] = sum(buys.filter((t) => t.supplier === s.id)) / 4;
    const credit = this.tx.filter((t) => t.type === 'credit_sale' && t.date > addDays(asOf, -28) && t.date <= asOf);
    const newCreditDaily = sum(credit) / 28;
    const net = []; for (let d = from; d <= asOf; d = addDays(d, 1)) net.push(sum(salesBy[d] || []));
    const sd = Math.sqrt(mean(net.map((v) => (v - mean(net)) ** 2)));
    return { wdAvg, salaryFactor, weeklyBuy, sd, newCreditDaily };
  }
  predictSales(date, m, sc = {}) {
    const md = dom(date);
    const salaryDays = sc.salaryDelay ? md >= 8 && md <= 13 : md <= 6;
    return m.wdAvg[dow(date)] * (salaryDays ? m.salaryFactor : 1);
  }
  forecast({ days = 30, scenario = {} } = {}) {
    const m = this.forecastModel();
    const pos = this.position();
    let bal = pos.figures.find((f) => f.key === 'total').value;
    const start = bal;
    const book = this.debtBook();
    const collections = {};
    for (const b of Object.values(book)) for (const d of b.open) {
      const c = b.customer;
      let when;
      if (scenario.collect?.includes(c.id)) when = addDays(TODAY, 1);
      else if (c.paysAfterSalary) { let s = addDays(TODAY, 1); while (dom(s) !== 3) s = addDays(s, 1); when = s; }
      else { const usual = b.usual ?? c.delay; when = addDays(d.date, usual); if (when <= TODAY) when = addDays(TODAY, Math.min(10, 2 + Math.round((daysBetween(d.date, TODAY) - usual) / 3))); }
      const prob = scenario.collect?.includes(c.id) ? 1 : c.partial ? 0.5 : 0.9;
      (collections[when] ||= []).push({ customer: c.name, cid: c.id, amount: r250(d.left * prob), debtId: d.id });
    }
    const series = [];
    let lowest = null;
    for (let i = 1; i <= days; i++) {
      const date = addDays(TODAY, i);
      const ev = [];
      const sales = r250(this.predictSales(date, m, scenario));
      ev.push({ kind: 'in', label: 'مبيعات متوقعة', amount: sales });
      for (const s of Object.values(SUPPLIERS)) if (dow(date) === s.day) {
        ev.push({ kind: 'out', label: `بضاعة ${s.short}`, amount: r250(m.weeklyBuy[s.id]) });
      }
      for (const e of EXPENSES) if ((e.rule === 'monthly' && dom(date) === e.day) || (e.rule === 'weekly' && dow(date) === e.dow)) ev.push({ kind: 'out', label: e.name, amount: e.amount, fixed: true });
      for (const p of this.payables) {
        const pd = scenario.delaySupplier && p.movable ? addDays(p.date, 7) : p.date;
        if (pd === date) ev.push({ kind: 'out', label: p.name, amount: p.amount, fixed: true });
      }
      if (i >= 12) ev.push({ kind: 'in', label: 'تسديد ديون جديدة (حسب المعدل)', amount: r250(m.newCreditDaily * 0.9) });
      for (const c of collections[date] || []) ev.push({ kind: 'in', label: `تحصيل من ${c.customer}`, amount: c.amount, debtId: c.debtId });
      const inflow = ev.filter((e) => e.kind === 'in').reduce((a, e) => a + e.amount, 0);
      const outflow = ev.filter((e) => e.kind === 'out').reduce((a, e) => a + e.amount, 0);
      bal += inflow - outflow;
      const band = Math.round(m.sd * Math.sqrt(i) * 0.8);
      const row = { date, inflow, outflow, balance: bal, low: bal - band, high: bal + band, events: ev };
      series.push(row);
      if (!lowest || bal < lowest.balance) lowest = row;
    }
    // drivers: what pulls the balance down between now and the lowest point, grouped
    const upto = series.filter((r) => r.date <= lowest.date);
    const agg = {};
    for (const r of upto) for (const e of r.events.filter((e) => e.kind === 'out')) {
      const k = e.label.startsWith('بضاعة ') && !e.fixed ? 'بضاعة الموردين الأسبوعية' : e.label;
      (agg[k] ||= { label: k, amount: 0, dates: [] }); agg[k].amount += e.amount; agg[k].dates.push(r.date);
    }
    const drivers = Object.values(agg).sort((a, b) => b.amount - a.amount).slice(0, 4).map((d) => ({ ...d, date: d.dates[0], times: d.dates.length }));
    const salesUpto = upto.reduce((a, r) => a + r.events.filter((e) => e.label === 'مبيعات متوقعة').reduce((x, e) => x + e.amount, 0), 0);
    const pending = Object.values(book).filter((b) => b.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 3)
      .map((b) => ({ customer: b.customer.name, cid: b.customer.id, amount: b.balance }));
    return { tool: 'forecast', days, scenario, series, lowest, drivers, pending, model: { salaryFactor: Math.round(m.salaryFactor * 100) / 100, wdAvg: m.wdAvg.map(Math.round) },
      salesUpto, figures: [fig('start', 'الرصيد هسه (كاش + محفظة)', start), fig('lowest', 'أوطأ رصيد متوقع', lowest.balance), fig('end', `الرصيد المتوقع بعد ${days} يوم`, series.at(-1).balance),
        fig('lowest_low', 'أوطأ حد بالمدى المتوقع', lowest.low)], lowestDate: lowest.date };
  }

  // backtest: forecast daily sales for the last 30 days from data before them, versus a naive baseline
  backtest() {
    const cut = addDays(TODAY, -30);
    const m = this.forecastModel(cut);
    const salesBy = groupBy(this.tx.filter((t) => t.type === 'sale'), (t) => t.date);
    const prev30 = []; for (let i = 0; i < 30; i++) prev30.push(sum(salesBy[addDays(cut, -i)] || []));
    const naive = prev30.reduce((a, b) => a + b, 0) / 30;
    let errM = 0, errN = 0, totA = 0, totM = 0;
    const rows = [];
    for (let i = 1; i <= 30; i++) {
      const d = addDays(cut, i); const actual = sum(salesBy[d] || []); const pred = this.predictSales(d, m);
      errM += Math.abs(pred - actual); errN += Math.abs(naive - actual); totA += actual; totM += pred;
      rows.push({ date: d, actual, pred: Math.round(pred), naive: Math.round(naive) });
    }
    return { maeModel: Math.round(errM / 30), maeNaive: Math.round(errN / 30), totalActual: totA, totalModel: Math.round(totM), totalNaive: Math.round(naive * 30),
      improvement: Math.round((1 - errM / errN) * 1000) / 10, rows };
  }

  // evening closing: three sources
  reconcile({ counted }) {
    const c = this.closings.at(-1);
    const diff = counted - c.expected;
    const wIns = this.tx.filter((t) => t.date >= addDays(TODAY, -7) && t.type === 'payment_in' && t.channel === 'wallet');
    const unmatched = this.tx.filter((t) => t.type === 'payment_in' && t.channel === 'wallet' && !t.customer);
    const unconfirmed = this.tx.filter((t) => t.type === 'credit_sale' && !t.confirmed && !t.disputed && daysBetween(t.date, TODAY) <= 14);
    const reasons = [];
    if (diff < -5000) { reasons.push('مصروف دفعته من الجرار وما سجلته'); reasons.push('فكة أو باقي زبون'); reasons.push('بيع بالدين انحسب كاش'); }
    if (diff > 5000) reasons.push('تسديد دين كاش ما مسجل');
    return { tool: 'reconcile', expected: c.expected, counted, diff, unmatched, unconfirmed, walletMatched: wIns.filter((t) => t.debtRef).length, walletIns: wIns.length, reasons,
      figures: [fig('expected', 'الكاش المتوقع', c.expected, this.tx.filter((t) => t.date === TODAY && cashEffect(t) !== 0).map((t) => t.id)), fig('counted', 'الكاش المحسوب', counted), fig('diff', 'الفرق', diff)] };
  }

  // ── inventory: opening + deliveries − sold ± stock counts ──
  stockOf(sku) {
    let q = OPENING_STOCK[sku] || 0;
    for (const t of this.tx) {
      if (!t.items) continue;
      const sign = t.type === 'purchase' || t.type === 'adjust' ? 1 : (t.type === 'sale' || t.type === 'credit_sale') ? -1 : 0;
      if (sign) for (const i of t.items) if (i.sku === sku) q += sign * (i.qty || 0);
    }
    return q;
  }
  salesRate(sku, days = 7) {
    const from = addDays(TODAY, -(days - 1));
    let q = 0; for (const t of this.tx) if (t.date >= from && (t.type === 'sale' || t.type === 'credit_sale')) for (const i of t.items || []) if (i.sku === sku) q += i.qty;
    return q / days;
  }
  inventory({ sku, incoming = {} } = {}) {
    const rows = PRODUCTS.filter((p) => !sku || p.sku === sku).map((p) => {
      const stock = this.stockOf(p.sku), perDay = Math.round(this.salesRate(p.sku) * 10) / 10;
      const cover = perDay ? Math.round((stock / perDay) * 10) / 10 : 99;
      const lead = SUPPLIERS[p.supplier].lead;
      const status = stock <= 0 ? 'out' : cover < lead + 2 ? 'low' : cover < 5 ? 'watch' : 'ok';
      const ids = this.tx.filter((t) => t.items?.some((i) => i.sku === p.sku) && ['purchase', 'adjust', 'sale', 'credit_sale'].includes(t.type)).map((t) => t.id);
      return { sku: p.sku, name: p.name, supplier: p.supplier, stock, perDay, cover, status, incoming: incoming[p.sku] || 0, value: stock * this.currentCost(p.sku), ids };
    });
    return { tool: 'inventory', rows, figures: [
      ...rows.map((r) => fig('stock:' + r.sku, `مخزون ${r.name}`, r.stock, r.ids)),
      fig('value', 'قيمة المخزون بالكلفة', rows.reduce((a, r) => a + r.value, 0)),
      fig('low', 'مواد قربت تخلص', rows.filter((r) => r.status === 'out' || r.status === 'low').length),
    ] };
  }
  // what to order: bring every item up to ~10 days of cover, counting what is already on the way
  reorder({ incoming = {}, coverDays = 10 } = {}) {
    const inv = this.inventory({ incoming });
    const bySup = {};
    for (const r of inv.rows) {
      const need = Math.max(0, Math.ceil(r.perDay * coverDays - r.stock - r.incoming));
      (bySup[r.supplier] ||= []).push({ sku: r.sku, name: r.name, perDay: r.perDay, stock: r.stock, cover: r.cover, status: r.status, order: need, cost: this.currentCost(r.sku) });
    }
    const urgent = Object.fromEntries(Object.entries(bySup).map(([k, items]) => [k, items.some((i) => (i.status === 'low' || i.status === 'out') && !incoming[i.sku])]));
    return { tool: 'reorder', bySup, urgent };
  }

  // numbers a model is allowed to mention, from a tool result
  static allowedNumbers(res) {
    const set = new Set();
    const walk = (v) => {
      if (typeof v === 'number') { set.add(Math.round(v)); set.add(Math.abs(Math.round(v))); }
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'ids') walk(x);
      else if (typeof v === 'string') (v.match(/\d[\d,]*/g) || []).forEach((n) => set.add(+n.replace(/,/g, '')));
    };
    walk(res);
    return set;
  }
}
