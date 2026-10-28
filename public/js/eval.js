// ─────────────────────────────────────────────────────────────
// Evaluation. Ground truth is computed by SEPARATE, simple code
// straight from the raw transactions (not by the ledger tools),
// so a bug in a tool shows up as a wrong answer.
//  1. Questions with known answers (exact number)
//  2. Paraphrase consistency (5 ways to ask the same thing)
//  3. Refusals (questions the data cannot answer)
//  4. Entry parsing from free text
//  5. Anomalies: precision / recall over 20 generated shops
//  6. Forecast backtest vs a naive baseline over 20 shops
//  7. The agent on open questions (right tools + every key number)
// Runs in the browser and in Node (eval/run_eval.mjs).
// ─────────────────────────────────────────────────────────────
import { generate, PLANTED, CUSTOMERS, fmt, walletEffect, OPENING_STOCK } from './data.js';
import { Ledger, period } from './ledger.js';
import { routeOffline, parseEntryOffline } from './nlu.js';
import { runTool, mainFigure, route as routeAgent, ask } from './agent.js';

// ── independent truth ──
const S = (a) => a.reduce((x, t) => x + t.amount, 0);
const within = (t, p) => t.date >= p.from && t.date <= p.to;
const T = {
  sales: (tx, pk, arg, ch = 'all') => { const p = period(pk, arg); return S(tx.filter((t) => within(t, p) && ['sale', 'credit_sale'].includes(t.type) && (ch === 'all' || t.channel === ch))); },
  net: (tx, pk, arg) => {
    const p = period(pk, arg);
    const s = tx.filter((t) => within(t, p) && ['sale', 'credit_sale'].includes(t.type));
    let cogs = 0; for (const t of s) for (const i of t.items) cogs += i.qty * i.cost;
    return S(s) - S(tx.filter((t) => within(t, p) && t.type === 'refund')) - cogs - S(tx.filter((t) => within(t, p) && t.type === 'expense' && !t.owner && !t.capital));
  },
  cust: (tx, cid) => Math.max(0, S(tx.filter((t) => t.type === 'credit_sale' && t.customer === cid)) - S(tx.filter((t) => t.type === 'payment_in' && t.customer === cid))),
  debts: (tx) => CUSTOMERS.reduce((a, c) => a + T.cust(tx, c.id), 0),
  exp: (tx, pk, arg, cat) => { const p = period(pk, arg); return S(tx.filter((t) => within(t, p) && t.type === 'expense' && (!cat || t.category === cat))); },
  stock: (tx, sku) => { let q = OPENING_STOCK[sku]; for (const t of tx) for (const i of t.items || []) if (i.sku === sku) { if (t.type === 'purchase' || t.type === 'adjust') q += i.qty || 0; else if (t.type === 'sale' || t.type === 'credit_sale') q -= i.qty; } return q; },
  wallet: (L) => L.openingWallet + L.tx.reduce((a, t) => a + walletEffect(t), 0),
};
const cid = (name) => CUSTOMERS.find((c) => c.name === name).id;

export function questionSet(L) {
  const tx = L.tx;
  const Q = (q, tool, truth, extra = {}) => ({ q, tool, truth, ...extra });
  const base = [
    Q('شكد بعت اليوم؟', 'sales', T.sales(tx, 'today')),
    Q('شكد بعت البارحة؟', 'sales', T.sales(tx, 'yesterday')),
    Q('شكد بعت هالأسبوع؟', 'sales', T.sales(tx, 'this_week')),
    Q('كم كانت المبيعات الأسبوع الماضي؟', 'sales', T.sales(tx, 'last_week')),
    Q('شكد بعت هالشهر كاش؟', 'sales', T.sales(tx, 'this_month', null, 'cash')),
    Q('شكد دخل عالمحفظة هالشهر؟', 'sales', T.sales(tx, 'this_month', null, 'wallet')),
    Q('شكد بعت بالدين هالأسبوع؟', 'sales', T.sales(tx, 'this_week', null, 'credit')),
    Q('شكد بعت آخر 7 أيام؟', 'sales', T.sales(tx, 'last7')),
    Q('شكد اشتغلت الشهر الماضي؟', 'sales', T.sales(tx, 'last_month')),
    Q('شكد ربحت هالأسبوع؟', 'profit', T.net(tx, 'this_week')),
    Q('شكد صافي ربحي الشهر الماضي؟', 'profit', T.net(tx, 'last_month')),
    Q('شنو ربحي بشهر آب؟', 'profit', T.net(tx, 'month', 8)),
    Q('منو بعده مطلوب إلي؟', 'debts', T.debts(tx)),
    Q('شكد مطلوب من حجي كاظم؟', 'customer', T.cust(tx, cid('حجي كاظم'))),
    Q('أبو حسين شكد عليه؟', 'customer', T.cust(tx, cid('أبو حسين'))),
    Q('ام زينب مسددة لو بعد؟', 'customer', T.cust(tx, cid('أم زينب'))),
    Q('شكد مصاريفي هالشهر؟', 'expenses', T.exp(tx, 'this_month')),
    Q('شكد دفعت إيجار آخر 30 يوم؟', 'expenses', T.exp(tx, 'last30', null, 'rent')),
    Q('شكد رصيد المحفظة؟', 'position', T.wallet(L)),
    Q('راح تكفيني الفلوس الشهر الجاي؟', 'forecast', null),
    Q('اكو شي غريب بالحسابات؟', 'anomalies', null),
    Q('شنو أكثر مادة تربحني هالشهر؟', 'topItems', null),
    Q('شكد كلفني الدولار آخر شهر؟', 'fxImpact', null),
    Q('شكد باقي سكر بالمخزن؟', 'inventory', T.stock(tx, 'sugar')),
    Q('شنو قرب يخلص من المخزن؟', 'inventory', null),
  ];
  const para = [
    { group: 'مبيعات اليوم', tool: 'sales', truth: T.sales(tx, 'today'), qs: ['شكد بعت اليوم؟', 'شكد الغلة اليوم؟', 'اليوم شكد دخلي؟', 'كم مبيعات اليوم', 'شكد جبت اليوم لحد هسه؟'] },
    { group: 'ربح الأسبوع', tool: 'profit', truth: T.net(tx, 'this_week'), qs: ['شكد ربحت هالأسبوع؟', 'هالاسبوع شكد طلعلي صافي؟', 'شكد فايدتي هذا الاسبوع', 'اشكد ربحي هالاسبوع؟', 'صافي ربح الاسبوع شكد؟'] },
    { group: 'مجموع الديون', tool: 'debts', truth: T.debts(tx), qs: ['منو بعده مطلوب إلي؟', 'شكد ديوني عند الناس؟', 'منو باقي ما سدد؟', 'شكد مجموع الديون؟', 'الناس شكد مطلوبين إلي'] },
    { group: 'دين أبو علي', tool: 'customer', truth: T.cust(tx, cid('أبو علي')), qs: ['شكد مطلوب من أبو علي؟', 'ابو علي شكد عليه؟', 'ابو علي سدد لو بعد؟', 'شكد بذمة ابو علي', 'دين ابو علي شكد صار؟'] },
    { group: 'مبيعات الشهر الماضي', tool: 'sales', truth: T.sales(tx, 'last_month'), qs: ['شكد بعت الشهر الماضي؟', 'الشهر اللي فات شكد اشتغلت؟', 'مبيعات الشهر الفات شكد؟', 'شكد دخلي الشهر الماضي', 'كم بعت بالشهر السابق؟'] },
    { group: 'السيولة', tool: 'forecast', truth: null, qs: ['راح تكفيني الفلوس الشهر الجاي؟', 'اشوكت تخلص الفلوس؟', 'الشهر الجاي راح يضيق علي؟', 'شنو توقعك للسيولة؟', 'راح يكفي الكاش للايجار؟'] },
  ];
  // held-out: written after the parser was finished, never used to tune it
  const held = [
    Q('اليوم شكد صار البيع؟', 'sales', T.sales(tx, 'today')),
    Q('بيع البارح شكد كان', 'sales', T.sales(tx, 'yesterday')),
    Q('شكد انباع هالاسبوع كاش؟', 'sales', T.sales(tx, 'this_week', null, 'cash')),
    Q('المحفظة شكد استلمت مبيعات الشهر الماضي؟', 'sales', T.sales(tx, 'last_month', null, 'wallet')),
    Q('طلعت ربح الشهر الماضي لو لا؟', 'profit', T.net(tx, 'last_month')),
    Q('ربحي الصافي بشهر تموز شكد؟', 'profit', T.net(tx, 'month', 7)),
    Q('شكد فايدتي هالشهر؟', 'profit', T.net(tx, 'this_month')),
    Q('شكد عند الناس فلوس إلي؟', 'debts', T.debts(tx)),
    Q('أبو سجاد باقي عليه شي؟', 'customer', T.cust(tx, cid('أبو سجاد'))),
    Q('ست نور شكد بذمتها؟', 'customer', T.cust(tx, cid('ست نور'))),
    Q('علاوي مطلوب لو خالص؟', 'customer', T.cust(tx, cid('علاوي'))),
    Q('المولدة شكد اخذت مني هالشهر؟', 'expenses', T.exp(tx, 'this_month', null, 'gen')),
    Q('شكد صرفت الشهر الماضي؟', 'expenses', T.exp(tx, 'last_month')),
    Q('المحفظة بيها شكد هسه؟', 'position', T.wallet(L)),
    Q('الكاش راح يخلص قبل الإيجار؟', 'forecast', null),
    Q('اكو غلط بالدفتر؟', 'anomalies', null),
    Q('شنو المادة اللي تجيب ربح أكثر؟', 'topItems', null),
    Q('ارتفاع الدولار أثر علي؟', 'fxImpact', null),
    Q('الشاي ضل منه شي لو خلص؟', 'inventory', T.stock(tx, 'tea')),
  ];
  const refuse = ['شكد بعت بشهر 3؟', 'شكد ربحت من الدجاج؟', 'شكد مطلوب من أبو كرار؟', 'شكد بعت سنة 2024؟', 'منو أحسن لاعب بالمنتخب؟', 'شكد ربحت السنة الماضية؟'];
  // mixed Arabic + English, as shop owners actually type (written after the parser, never tuned on)
  const mixed = [
    Q('شكد الـ sales اليوم؟', 'sales', T.sales(tx, 'today')),
    Q('شكد الprofit هالأسبوع؟', 'profit', T.net(tx, 'this_week')),
    Q('منو عليه debt إلي؟', 'debts', T.debts(tx)),
    Q('total الديون شكد؟', 'debts', T.debts(tx)),
    Q('شكد عند أم زينب balance؟', 'customer', T.cust(tx, cid('أم زينب'))),
    Q('الcash اللي عندي هسه شكد؟', 'position', null),
    Q('شكد صرفت expenses هالشهر؟', 'expenses', T.exp(tx, 'this_month')),
    Q('sugar باقي منه بالمخزن؟', 'inventory', T.stock(tx, 'sugar')),
  ];
  return { base, para, refuse, held, mixed };
}

const ENTRIES = [
  { t: 'بعت 3 كراتين ببسي لأبو حسين بالدين', type: 'credit_sale', customer: 'C1', sku: 'pepsi', qty: 3, amount: 27000 },
  { t: 'سجل على أم زينب طبقة بيض', type: 'credit_sale', customer: 'C2', sku: 'eggs', qty: 1, amount: 5500 },
  { t: 'أبو علي سدد 30 الف', type: 'payment_in', customer: 'C3', amount: 30000 },
  { t: 'حجي كاظم انطاني خمسة وعشرين الف', type: 'payment_in', customer: 'C4', amount: 25000 },
  { t: 'دفعت المولدة 120 الف', type: 'expense', amount: 120000 },
  { t: 'بعت ثلاث باكيتات جگاير كاش', type: 'sale', sku: 'cigs', qty: 3, amount: 10500 },
  { t: 'علاوي اخذ 2 كيلو تمن بالدين', type: 'credit_sale', customer: 'C8', sku: 'rice', qty: 2, amount: 4000 },
  { t: 'سيد جاسم دينته 5 كيلو سكر', type: 'credit_sale', customer: 'C5', sku: 'sugar', qty: 5, amount: 8750 },
  { t: 'أم مريم سددت 50 الف', type: 'payment_in', customer: 'C7', amount: 50000 },
  { t: 'بعت 4 كارتون ماي', type: 'sale', sku: 'water', qty: 4, amount: 12000 },
  { t: 'ست نور اخذت شاي بالدين', type: 'credit_sale', customer: 'C10', sku: 'tea', qty: 1, amount: 4000 },
  { t: 'دفعت أجرة العامل 125 الف', type: 'expense', amount: 125000 },
  { t: 'أبو سجاد دز 40 الف عالمحفظة', type: 'payment_in', customer: 'C9', amount: 40000 },
  { t: 'بعت 6 طبقات بيض لمصطفى الحداد عالحساب', type: 'credit_sale', customer: 'C6', sku: 'eggs', qty: 6, amount: 33000 },
];

function scoreEntry(e, x) {
  const checks = { type: e.type === x.type, amount: e.amount === x.amount };
  if (x.customer) checks.customer = e.customer === x.customer;
  if (x.sku) { checks.sku = e.items?.[0]?.sku === x.sku; checks.qty = e.items?.[0]?.qty === x.qty; }
  return checks;
}

export function evalOffline(L) {
  const { base, para, refuse, held, mixed } = questionSet(L);
  const runQ = (q) => { const r = routeOffline(q); const res = runTool(L, r); const f = mainFigure(r, res); return { r, res, value: f?.value ?? null }; };
  const baseRows = base.map((x) => { const o = runQ(x.q); const ok = x.truth == null ? o.r.tool === x.tool : o.r.tool === x.tool && o.value === x.truth; return { ...x, got: o.value, gotTool: o.r.tool || (o.r.refuse ? 'refuse' : '?'), ok }; });
  const heldRows = held.map((x) => { const o = runQ(x.q); const ok = x.truth == null ? o.r.tool === x.tool : o.r.tool === x.tool && o.value === x.truth; return { ...x, got: o.value, gotTool: o.r.tool || (o.r.refuse ? 'refuse' : '?'), ok }; });
  const mixedRows = mixed.map((x) => { const o = runQ(x.q); const ok = x.truth == null ? o.r.tool === x.tool : o.r.tool === x.tool && o.value === x.truth; return { ...x, got: o.value, gotTool: o.r.tool || (o.r.refuse ? 'refuse' : '?'), ok }; });
  const paraRows = para.map((g) => { const outs = g.qs.map((q) => ({ q, ...runQ(q) })); const okEach = outs.map((o) => o.r.tool === g.tool && (g.truth == null || o.value === g.truth)); return { group: g.group, n: g.qs.length, ok: okEach.filter(Boolean).length, consistent: okEach.every(Boolean), fails: outs.filter((o, i) => !okEach[i]).map((o) => o.q) }; });
  const refRows = refuse.map((q) => { const o = runQ(q); const ok = !!o.r.refuse || !!o.res?.empty; return { q, ok, got: o.r.refuse ? 'رفض' : o.r.tool }; });
  const entRows = ENTRIES.map((x) => { const e = parseEntryOffline(x.t); const c = scoreEntry(e, x); return { t: x.t, ok: Object.values(c).every(Boolean), fields: c }; });
  const fieldTotals = entRows.reduce((a, r) => { for (const [k, v] of Object.entries(r.fields)) { a.n++; if (v) a.ok++; } return a; }, { n: 0, ok: 0 });
  return {
    qa: { n: baseRows.length, ok: baseRows.filter((r) => r.ok).length, rows: baseRows },
    held: { n: heldRows.length, ok: heldRows.filter((r) => r.ok).length, rows: heldRows },
    mixed: { n: mixedRows.length, ok: mixedRows.filter((r) => r.ok).length, rows: mixedRows },
    para: { groups: paraRows, n: paraRows.reduce((a, g) => a + g.n, 0), ok: paraRows.reduce((a, g) => a + g.ok, 0), consistentGroups: paraRows.filter((g) => g.consistent).length },
    refuse: { n: refRows.length, ok: refRows.filter((r) => r.ok).length, rows: refRows },
    entries: { n: entRows.length, ok: entRows.filter((r) => r.ok).length, fieldAcc: fieldTotals.ok / fieldTotals.n, rows: entRows },
  };
}

// questions answered by Gemini end to end: route + tool + phrased answer that must contain the true number
export async function evalLLM(L, { onProgress, pauseMs = 0 } = {}) {
  const { base, para, refuse, held, mixed } = questionSet(L);
  const items = [...base.map((x) => ({ ...x, kind: 'qa' })), ...held.map((x) => ({ ...x, kind: 'held' })), ...mixed.map((x) => ({ ...x, kind: 'mixed' })), ...para.flatMap((g) => g.qs.map((q) => ({ q, tool: g.tool, truth: g.truth, kind: 'para', group: g.group }))), ...refuse.map((q) => ({ q, kind: 'refuse' }))];
  const rows = [];
  for (let i = 0; i < items.length; i++) {
    const x = items[i];
    const r = await ask(L, x.q, { useLLM: true });
    let ok;
    if (x.kind === 'refuse') ok = !!r.route?.refuse || !!r.res?.empty;
    else if (x.truth == null) ok = r.route?.tool === x.tool;
    else ok = r.route?.tool === x.tool && r.main?.value === x.truth && r.answer.includes(fmt(x.truth).replace('-', ''));
    rows.push({ ...x, ok, routeSource: r.routeSource, answerSource: r.answerSource, answer: r.answer, fallback: r.trace[0]?.fallback, writerProblems: r.trace.find((t) => t.step === 'صياغة الجواب')?.problems || r.trace.find((t) => t.step === 'صياغة الجواب')?.error });
    if (pauseMs) await new Promise((res) => setTimeout(res, pauseMs));
    onProgress?.(i + 1, items.length);
  }
  const by = (k) => rows.filter((r) => r.kind === k);
  return { rows, qa: { n: by('qa').length, ok: by('qa').filter((r) => r.ok).length }, held: { n: by('held').length, ok: by('held').filter((r) => r.ok).length }, mixed: { n: by('mixed').length, ok: by('mixed').filter((r) => r.ok).length }, para: { n: by('para').length, ok: by('para').filter((r) => r.ok).length },
    refuse: { n: by('refuse').length, ok: by('refuse').filter((r) => r.ok).length }, geminiRouted: rows.filter((r) => r.routeSource === 'gemini').length, geminiWritten: rows.filter((r) => r.answerSource === 'gemini').length };
}

// anomalies and forecast across many generated shops
export function evalShops(seeds = 20) {
  let tp = 0, fp = 0, fn = 0; const perKind = {}; const bt = [];
  for (let s = 1; s <= seeds; s++) {
    const g = generate(1000 + s);
    const planted = PLANTED.map((p) => ({ ...p }));
    const L = new Ledger(g);
    const found = L.anomalies().items;
    const used = new Set();
    for (const p of planted) {
      const k = (perKind[p.kind] ||= { planted: 0, found: 0, fp: 0 }); k.planted++;
      const hit = found.findIndex((a, i) => !used.has(i) && a.kind === p.kind && (!p.sku || a.sku === p.sku) && (!p.customer || a.customer === p.customer)
        && (p.kind === 'price_jump' || !p.date || a.date === p.date) && (!p.ids || p.kind === 'overdue' || a.ids.some((id) => p.ids.includes(id))));
      if (hit >= 0) { used.add(hit); tp++; k.found++; } else fn++;
    }
    found.forEach((a, i) => { if (!used.has(i)) { fp++; (perKind[a.kind] ||= { planted: 0, found: 0, fp: 0 }).fp++; } });
    const b = L.backtest(); bt.push(b);
  }
  const mae = (k) => Math.round(bt.reduce((a, b) => a + b[k], 0) / bt.length);
  return { seeds, anomalies: { tp, fp, fn, precision: tp / (tp + fp), recall: tp / (tp + fn), perKind },
    backtest: { maeModel: mae('maeModel'), maeNaive: mae('maeNaive'), improvement: Math.round((1 - mae('maeModel') / mae('maeNaive')) * 1000) / 10,
      beatNaive: bt.filter((b) => b.maeModel < b.maeNaive).length } };
}

// ── 7. the agent (open questions): did it read the right tools, and is every key number right? ──
// Truth is computed here from raw transactions; the agent passes a question when its answer
// contains ALL the listed numbers and it called at least the required tools.
export function agentSet(L) {
  const tx = L.tx;
  const n7 = T.net(tx, 'last7'), p7 = T.net(tx, 'prev7');
  const s7 = T.sales(tx, 'last7'), sp7 = T.sales(tx, 'prev7');
  return [
    { q: 'ليش ربحي نزل؟', need: ['compare'], nums: [n7, p7] },
    { q: 'ليش صافي ربحي تغيّر عن الأسبوع اللي قبل؟', need: ['compare'], nums: [n7, p7] },
    { q: 'ليش البيع قل هالأسبوع؟', need: ['compare'], nums: [s7, sp7] },
    { q: 'شلون أدبر الإيجار ودفعة المورد الشهر الجاي؟', need: ['forecast', 'debts'], nums: [T.debts(tx)] },
    { q: 'شنو تنصحني أسوي حتى تكفيني الفلوس؟', need: ['forecast', 'debts'], nums: [T.debts(tx)] },
  ];
}
const usedTools = (r) => r.trace.filter((t) => t.step === 'وكيل' && t.kind === 'tool').map((t) => t.tool);
export async function evalAgent(L, { useLLM = false, pauseMs = 0, agentAsk } = {}) {
  const rows = [];
  for (const c of agentSet(L)) {
    const r = await agentAsk(L, c.q, { useLLM });
    const tools = usedTools(r);
    const nums = new Set((r.answer.match(/\d[\d,]*/g) || []).map((x) => +x.replace(/,/g, '')));
    const okNums = c.nums.every((n) => nums.has(Math.abs(Math.round(n))));
    const okTools = c.need.every((t) => tools.includes(t));
    rows.push({ q: c.q, ok: okNums && okTools, okNums, okTools, tools, source: r.answerSource, steps: r.stepsUsed, answer: r.answer, ms: r.ms });
    if (pauseMs) await new Promise((res) => setTimeout(res, pauseMs));
  }
  return { n: rows.length, ok: rows.filter((r) => r.ok).length, byAgent: rows.filter((r) => r.source === 'agent').length, rows };
}

// ── 8. heavy dialect: words the old rules did not know (written together with lexicon.js, so a dev set, not held-out) ──
export function dialectSet(L) {
  const tx = L.tx;
  const Q = (q, tool, truth) => ({ q, tool, truth });
  const questions = [
    Q('جم بعت اليوم؟', 'sales', T.sales(tx, 'today')),
    Q('شكثر بعت لهسع؟', 'sales', T.sales(tx, 'today')),
    Q('شقد صارت الحركة اليوم؟', 'sales', T.sales(tx, 'today')),
    Q('اشگد كسبت هلاسبوع؟', 'profit', T.net(tx, 'this_week')),
    Q('شكد مكسبي هالجمعة؟', 'profit', T.net(tx, 'this_week')),
    Q('الجمعة اللي طافت شكد بعت؟', 'sales', T.sales(tx, 'last_week')),
    Q('شكد طلعتلي فايدة الشهر الي فات؟', 'profit', T.net(tx, 'last_month')),
    Q('شهر سبعة شكد ربحت؟', 'profit', T.net(tx, 'month', 7)),
    Q('شكد ربحت بشهر ثمانية؟', 'profit', T.net(tx, 'month', 8)),
    Q('منو مطلوبلي فلوس؟', 'debts', T.debts(tx)),
    Q('منو بعد ما صفّى حسابه؟', 'debts', T.debts(tx)),
    Q('شكد صرفيات هلشهر؟', 'expenses', T.exp(tx, 'this_month')),
    Q('شكد دفعت كري المحل آخر 30 يوم؟', 'expenses', T.exp(tx, 'last30', null, 'rent')),
    Q('الامبيرات شكد اخذت هالشهر؟', 'expenses', T.exp(tx, 'this_month', null, 'gen')),
    Q('شكد راحت يومية الصانع هالشهر؟', 'expenses', T.exp(tx, 'this_month', null, 'wage')),
    Q('زين كاش بيه شكد؟', 'position', T.wallet(L)),
    Q('شكد عندي بالدرج هسع؟', 'position', null),
    Q('راح تمشيني الفلوس للشهر الياي؟', 'forecast', null),
    Q('تسد الفلوس للكري؟', 'forecast', null),
    Q('اكو خربطة بالحسابات؟', 'anomalies', null),
    Q('الحساب ملخبط؟', 'anomalies', null),
    Q('شيربحني اكثر؟', 'topItems', null),
    Q('الاخضر شكد ضربني هالشهر؟', 'fxImpact', null),
    Q('شكد ضايل تمن؟', 'inventory', T.stock(tx, 'rice')),
    Q('الستوك شنو بيه ناقص؟', 'inventory', null),
    Q('شنو خلصان من البضاعة؟', 'inventory', null),
    Q('شنو لازم اوصي من البضاعة؟', 'reorder', null),
    Q('شكد بعت بالأجل هالجمعة؟', 'sales', T.sales(tx, 'this_week', null, 'credit')),
    Q('شكد بعت عالدفتر هلاسبوع؟', 'sales', T.sales(tx, 'this_week', null, 'credit')),
    Q('هلشهر شكد انباع عالمحفضة؟', 'sales', T.sales(tx, 'this_month', null, 'wallet')),
    Q('شكد صافيلي هالشهر؟', 'profit', T.net(tx, 'this_month')),
  ];
  const entries = [
    { t: 'ابو حسين صفّى حسابه 20 الف', type: 'payment_in', customer: 'C1', amount: 20000 },
    { t: 'ام زينب نطتني خمسطعش الف', type: 'payment_in', customer: 'C2', amount: 15000 },
    { t: 'خليها على ابو علي 2 كيلو تمن', type: 'credit_sale', customer: 'C3', sku: 'rice', qty: 2, amount: 4000 },
    { t: 'دفعت كري المحل 500 الف', type: 'expense', amount: 500000 },
    { t: 'دفعت الامبيرات 75 الف', type: 'expense', amount: 75000 },
    { t: 'بعت ثنعش كارتون ماي', type: 'sale', sku: 'water', qty: 12, amount: 36000 },
    { t: 'علاوي دز عشرين الف على زين كاش', type: 'payment_in', customer: 'C8', amount: 20000 },
    { t: 'حجي كاظم رجعلي ثلثين الف', type: 'payment_in', customer: 'C4', amount: 30000 },
    { t: 'سجلها على ست نور باكيت جكاير', type: 'credit_sale', customer: 'C10', sku: 'cigs', qty: 1, amount: 3500 },
    { t: 'مصطفى الحداد سدد عشرت تالاف', type: 'payment_in', customer: 'C6', amount: 10000 },
    { t: 'سيد جاسم انطاني خمسة وعشرين', type: 'payment_in', customer: 'C5', amount: 25000 },
    { t: 'بعت سبعطعش طبقة بيض', type: 'sale', sku: 'eggs', qty: 17, amount: 93500 },
  ];
  return { questions, entries };
}
export function evalDialect(L) {
  const { questions, entries } = dialectSet(L);
  const qRows = questions.map((x) => { const r = routeOffline(x.q); const res = runTool(L, r); const v = mainFigure(r, res)?.value ?? null; return { ...x, gotTool: r.tool || (r.refuse ? 'refuse' : '?'), got: v, ok: r.tool === x.tool && (x.truth == null || v === x.truth) }; });
  const eRows = entries.map((x) => { const e = parseEntryOffline(x.t); const c = scoreEntry(e, x); return { t: x.t, ok: Object.values(c).every(Boolean), fields: c }; });
  return { q: { n: qRows.length, ok: qRows.filter((r) => r.ok).length, rows: qRows }, e: { n: eRows.length, ok: eRows.filter((r) => r.ok).length, rows: eRows } };
}
