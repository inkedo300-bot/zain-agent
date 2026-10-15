// ─────────────────────────────────────────────────────────────
// Synthetic ledger for ONE shop: «بقالة أبو مصطفى», Basra.
// 90 days of sales, credit, payments, purchases and expenses,
// generated from a fixed seed. Fictional people, fictional numbers.
// Planted anomalies are listed in PLANTED (ground truth for eval).
// ─────────────────────────────────────────────────────────────

export function rng(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const r250 = (n) => Math.round(n / 250) * 250;

export const SHOP = { name: 'بقالة أبو مصطفى', owner: 'أبو مصطفى', ownerName: 'مصطفى جبار', city: 'البصرة – العشار', phone: '07801112233' };
export const TODAY = '2026-09-21';
export const DAYS = 90;

export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const dow = (s) => new Date(s + 'T12:00:00Z').getUTCDay(); // 0 Sun … 5 Fri 6 Sat
export const dom = (s) => +s.slice(8, 10);
export const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 86400000);
export const START = addDays(TODAY, -(DAYS - 1)); // data covers START … TODAY (inclusive)
export const DOW_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const MONTH_AR = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
export const dateAr = (s) => `${dom(s)} ${MONTH_AR[+s.slice(5, 7) - 1]}`;

// ── Products: sell price in IQD, cost in USD or IQD ──
export const PRODUCTS = [
  { sku: 'sugar',  name: 'سكر كيلو',        alias: ['سكر'],               sell: 1750, costUSD: 1.05, supplier: 'S1', base: 22 },
  { sku: 'oil',    name: 'زيت لتر',         alias: ['زيت', 'دهن'],         sell: 3000, costUSD: 1.85, supplier: 'S1', base: 16 },
  { sku: 'rice',   name: 'تمن كيلو',        alias: ['تمن', 'رز'],          sell: 2000, costUSD: 1.20, supplier: 'S1', base: 20 },
  { sku: 'tea',    name: 'شاي نص كيلو',     alias: ['شاي', 'چاي'],         sell: 4000, costUSD: 2.40, supplier: 'S1', base: 9 },
  { sku: 'pepsi',  name: 'كارتون ببسي',     alias: ['ببسي', 'بيبسي', 'بيبسى', 'ببسى', 'كولا'], sell: 9000, costIQD: 7500, supplier: 'S2', base: 6 },
  { sku: 'water',  name: 'كارتون ماي',      alias: ['ماي', 'ماء', 'مي'],   sell: 3000, costIQD: 2250, supplier: 'S2', base: 14 },
  { sku: 'flour',  name: 'طحين كيلو',       alias: ['طحين'],              sell: 1000, costIQD: 750,  supplier: 'S3', base: 18 },
  { sku: 'eggs',   name: 'طبقة بيض',        alias: ['بيض', 'طبقة'],        sell: 5500, costIQD: 4750, supplier: 'S3', base: 10 },
  { sku: 'soap',   name: 'مسحوق غسيل',      alias: ['تايد', 'مسحوق', 'غسيل'], sell: 4500, costUSD: 2.70, supplier: 'S1', base: 5 },
  { sku: 'cigs',   name: 'باكيت جگاير',     alias: ['جگاير', 'جكاير', 'سكاير', 'باكيت'], sell: 3500, costIQD: 3000, supplier: 'S3', base: 14 },
];
export const productBySku = (s) => PRODUCTS.find((p) => p.sku === s);

export const SUPPLIERS = {
  S1: { id: 'S1', name: 'شركة الرافدين للمواد الغذائية', short: 'الرافدين', day: 6, currency: 'USD', phone: '07705550101', lead: 2, contact: 'أبو أحمد' },
  S2: { id: 'S2', name: 'مشروبات البصرة', short: 'مشروبات البصرة', day: 0, currency: 'IQD', phone: '07705550202', lead: 1, contact: 'كرار' },
  S3: { id: 'S3', name: 'مخازن الأمل', short: 'مخازن الأمل', day: 1, currency: 'IQD', phone: '07705550303', lead: 1, contact: 'حجي صباح' },
};
// stock on the shelf at the start of the data — filled by generate() so the shelf never went negative
export const OPENING_STOCK = {};

// Credit customers. delay = usual days until they pay; pWallet = share paid through the wallet.
export const CUSTOMERS = [
  { id: 'C1',  name: 'أبو حسين',   full: 'حسين علي كريم',    phone: '07711000001', delay: 6,  every: 3, avg: 18000, pWallet: 0.9 },
  { id: 'C2',  name: 'أم زينب',    full: 'زينب عبد الله',     phone: '07711000002', delay: 12, every: 4, avg: 22000, pWallet: 0.7 },
  { id: 'C3',  name: 'أبو علي',    full: 'علي حسن جاسم',     phone: '07711000003', delay: 0,  every: 5, avg: 30000, pWallet: 0.8, paysAfterSalary: true },
  { id: 'C4',  name: 'حجي كاظم',   full: 'كاظم عبود خلف',    phone: '07711000004', delay: 26, every: 6, avg: 35000, pWallet: 0.2, partial: true, ageBand: '60+' },
  { id: 'C5',  name: 'سيد جاسم',   full: 'جاسم محمد باقر',   phone: '07711000005', delay: 9,  every: 7, avg: 15000, pWallet: 0.6 },
  { id: 'C6',  name: 'مصطفى الحداد', full: 'مصطفى كامل',     phone: '07711000006', delay: 4,  every: 4, avg: 12000, pWallet: 1.0 },
  { id: 'C7',  name: 'أم مريم',    full: 'مريم صالح',        phone: '07711000007', delay: 15, every: 6, avg: 25000, pWallet: 0.5 },
  { id: 'C8',  name: 'علاوي',      full: 'علاء حمزة',        phone: '07711000008', delay: 3,  every: 3, avg: 8000,  pWallet: 0.9 },
  { id: 'C9',  name: 'أبو سجاد',   full: 'سجاد نعمة',        phone: '07711000009', delay: 18, every: 8, avg: 40000, pWallet: 0.4 },
  { id: 'C10', name: 'ست نور',     full: 'نور الهدى فاضل',   phone: '07711000010', delay: 0,  every: 7, avg: 20000, pWallet: 1.0, paysAfterSalary: true },
];
export const customerById = (id) => CUSTOMERS.find((c) => c.id === id);

export const EXPENSES = [
  { key: 'rent',  name: 'إيجار المحل',       amount: 750000, rule: 'monthly', day: 5 },
  { key: 'gen',   name: 'اشتراك المولدة',     amount: 120000, rule: 'monthly', day: 1 },
  { key: 'wage',  name: 'أجرة العامل',       amount: 125000, rule: 'weekly',  dow: 4 },
  { key: 'draw',  name: 'سحب شخصي',          amount: 250000, rule: 'weekly',  dow: 5, owner: true },
];

// Known upcoming payables the owner entered (used by the forecast).
export const PAYABLES = [
  { date: '2026-10-03', name: 'بضاعة موسم المدارس من الرافدين', amount: 1800000, supplier: 'S1', movable: true },
];

// Ground truth for the anomaly evaluation (never read by the detector).
export const PLANTED = [];

const OPEN_WALLET = 3500000; // savings kept in the wallet (the fridge came out of it)
export function generate(seed = 2026) {
  const r = rng(seed);
  const tx = [];
  let n = 0;
  const add = (o) => { const t = { id: 'T' + String(++n).padStart(4, '0'), ...o }; tx.push(t); return t; };
  PLANTED.length = 0;

  // exchange rate: drift 1,480 → ~1,530
  const fx = []; let rate = 1480;
  for (let d = 0; d <= DAYS + 35; d++) { rate += (r() - 0.42) * 3.2; fx.push(Math.round(rate)); }
  const costOf = (p, day) => {
    let usd = p.costUSD;
    if (p.sku === 'oil' && day >= 60) usd = 2.10; // planted supplier price jump
    return usd ? r250(usd * fx[day]) : p.costIQD;
  };

  let dupDone = false;
  const invByDay = {}; // purchases accumulate per supplier per week
  for (let d = 0; d < DAYS; d++) {
    const date = addDays(START, d), wd = dow(date), md = dom(date);
    let f = 1 + (wd === 5 ? 0.28 : wd === 4 ? 0.15 : 0) + (md <= 6 ? 0.25 : md >= 25 ? -0.12 : 0);
    if (d === 52) { f *= 0.38; PLANTED.push({ kind: 'low_day', date, note: 'يوم انقطاع كهرباء: مبيعات منخفضة' }); }
    // daily sales split into cash and wallet
    const walletShare = 0.30 + 0.12 * (d / DAYS);
    const cashItems = [], walletItems = [];
    for (const p of PRODUCTS) {
      let q = Math.max(0, Math.round(p.base * f * (0.75 + r() * 0.5)));
      if (p.sku === 'sugar' && d >= DAYS - 12) q = Math.round(q * 1.7); // sugar demand jumped in the last two weeks
      const qw = Math.round(q * (walletShare + (r() - 0.5) * 0.1));
      const cost = costOf(p, d);
      if (q - qw > 0) cashItems.push({ sku: p.sku, qty: q - qw, price: p.sell, cost });
      if (qw > 0) walletItems.push({ sku: p.sku, qty: qw, price: p.sell, cost });
      const sup = p.supplier;
      const wk = Math.floor(d / 7);
      invByDay[sup] ??= {}; invByDay[sup][wk] ??= {}; invByDay[sup][wk][p.sku] = (invByDay[sup][wk][p.sku] || 0) + q;
    }
    const sum = (items) => items.reduce((a, i) => a + i.qty * i.price, 0);
    add({ date, type: 'sale', channel: 'cash', amount: sum(cashItems), items: cashItems, note: 'مبيعات اليوم (كاش)' });
    add({ date, type: 'sale', channel: 'wallet', amount: sum(walletItems), items: walletItems, note: 'مبيعات اليوم (محفظة)' });

    // expenses
    for (const e of EXPENSES) {
      const hit = e.rule === 'monthly' ? md === e.day : wd === e.dow;
      if (hit) add({ date, type: 'expense', channel: e.key === 'rent' ? 'wallet' : 'cash', amount: e.amount, category: e.key, note: e.name, owner: !!e.owner });
    }

    // supplier purchases: paid on the supplier's weekday for the previous week's usage
    for (const s of Object.values(SUPPLIERS)) {
      if (wd === s.dow || wd === s.day) {
        const wk = Math.floor(d / 7) - 1;
        const used = invByDay[s.id]?.[wk] || {};
        const items = PRODUCTS.filter((p) => p.supplier === s.id).map((p) => ({ sku: p.sku, qty: used[p.sku] || 0, cost: costOf(p, d) }));
        const amt = items.reduce((a, i) => a + i.qty * i.cost, 0);
        if (amt > 0) {
          const t = add({ date, type: 'purchase', channel: r() < 0.42 ? 'wallet' : 'cash', amount: amt, supplier: s.id, fx: fx[d],
            note: `بضاعة من ${s.short}`, items });
          if (s.id === 'S2' && d >= 40 && !dupDone) { dupDone = true; // planted duplicate payment
            const dup = add({ date: addDays(date, 1), type: 'purchase', channel: 'wallet', amount: amt, supplier: s.id, fx: fx[d + 1], note: `بضاعة من ${s.short}`, items: t.items });
            PLANTED.push({ kind: 'duplicate_payment', date: dup.date, ids: [t.id, dup.id], note: 'دفعة مورد مكررة' });
          }
        }
      }
    }
  }
  PLANTED.push({ kind: 'price_jump', date: addDays(START, 60 + ((6 - dow(addDays(START, 60)) + 7) % 7)), sku: 'oil', note: 'سعر الزيت من المورد ارتفع' });
  PLANTED.push({ kind: 'below_cost', sku: 'oil', note: 'الزيت ينباع بأقل من كلفته' });

  // credit sales and repayments
  const debts = [];
  for (const c of CUSTOMERS) {
    let d = Math.floor(r() * c.every);
    while (d < DAYS) {
      const date = addDays(START, d);
      const amount = r250(c.avg * (0.6 + r() * 0.8));
      const p1 = PRODUCTS[Math.floor(r() * PRODUCTS.length)];
      const qty = Math.max(1, Math.round(amount / p1.sell));
      const debt = add({ date, type: 'credit_sale', channel: 'credit', amount: qty * p1.sell, customer: c.id, items: [{ sku: p1.sku, qty, price: p1.sell, cost: costOf(p1, d) }],
        note: `دين على ${c.name}`, confirmed: r() < 0.85 });
      debts.push(debt);
      // repayment
      let payDay;
      if (c.paysAfterSalary) { const md = dom(date); const toNext = md <= 3 ? 1 : daysUntilDom(date, 2 + Math.floor(r() * 3)); payDay = d + toNext; }
      else payDay = d + Math.max(1, Math.round(c.delay * (0.7 + r() * 0.6)));
      const paid = c.partial ? r() < 0.6 : true;
      if (payDay < DAYS && paid) {
        const pdate = addDays(START, payDay);
        const wallet = r() < c.pWallet;
        const amt = c.partial && r() < 0.5 ? r250(debt.amount * 0.5) : debt.amount;
        add({ date: pdate, type: 'payment_in', channel: wallet ? 'wallet' : 'cash', amount: amt, customer: c.id, debtRef: wallet ? debt.id : null,
          note: wallet ? `تسديد من ${c.name} (رابط دفع)` : `تسديد كاش من ${c.name}` });
      }
      d += Math.max(1, Math.round(c.every * (0.6 + r() * 0.8)));
    }
  }
  // deliveries also replace what was sold on credit the week before
  const creditQty = {};
  for (const t of tx.filter((t) => t.type === 'credit_sale')) for (const i of t.items) { const wk = Math.floor(daysBetween(START, t.date) / 7); (creditQty[wk] ||= {})[i.sku] = (creditQty[wk][i.sku] || 0) + i.qty; }
  const seenItems = new Set();
  for (const t of tx.filter((t) => t.type === 'purchase')) {
    if (!seenItems.has(t.items)) { seenItems.add(t.items); const wk = Math.floor(daysBetween(START, t.date) / 7) - 1; for (const i of t.items) i.qty += creditQty[wk]?.[i.sku] || 0; }
    t.amount = t.items.reduce((a, i) => a + i.qty * i.cost, 0);
  }

  // the last delivery from الرافدين came without sugar (the supplier ran out)
  const lastS1 = tx.filter((t) => t.type === 'purchase' && t.supplier === 'S1').at(-1);
  if (lastS1) { lastS1.items = lastS1.items.map((i) => (i.sku === 'sugar' ? { ...i, qty: 0 } : i)); lastS1.amount = lastS1.items.reduce((a, i) => a + i.qty * i.cost, 0); lastS1.note += ' (بدون سكر)'; }

  // Hajji Kadhim: an old unpaid debt, well past his usual delay
  const old = add({ date: addDays(START, 30), type: 'credit_sale', channel: 'credit', amount: 67500, customer: 'C4',
    items: [{ sku: 'tea', qty: 15, price: 4000, cost: costOf(productBySku('tea'), 30) }, { sku: 'sugar', qty: 4, price: 1750, cost: costOf(productBySku('sugar'), 30) }], note: 'دين على حجي كاظم', confirmed: false });
  PLANTED.push({ kind: 'overdue', customer: 'C4', ids: [old.id], note: 'دين حجي كاظم متأخر كثير عن عادته' });

  // capital purchase: a new display fridge (not an operating expense)
  add({ date: addDays(START, 70), type: 'expense', channel: 'wallet', amount: 2500000, category: 'equipment', capital: true, note: 'ثلاجة عرض جديدة' });

  // unmatched wallet payment
  const um = add({ date: addDays(START, 71), type: 'payment_in', channel: 'wallet', amount: 25000, customer: null, fromPhone: '07822334455', debtRef: null, note: 'تحويل وارد بدون اسم' });
  PLANTED.push({ kind: 'unmatched_in', ids: [um.id], date: um.date, note: 'دفعة محفظة ما تطابق أي دين' });
  // unusual refund
  const rf = add({ date: addDays(START, 83), type: 'refund', channel: 'cash', amount: 60000, note: 'إرجاع لزبون' });
  PLANTED.push({ kind: 'odd_refund', ids: [rf.id], date: rf.date, note: 'إرجاع كبير بدون بيع مقابل' });

  // evening closings (counted cash). Planted shortfall on day 78.
  const closings = [];
  tx.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  let cash = 400000, wallet = OPEN_WALLET;
  const byDate = groupBy(tx, (t) => t.date);
  for (let d = 0; d < DAYS; d++) {
    const date = addDays(START, d);
    for (const t of byDate[date] || []) { cash += cashEffect(t); wallet += walletEffect(t); }
    // the owner moves money between the drawer and the wallet at an agent
    if (cash > 1200000) { const t = add({ date, type: 'transfer', channel: 'transfer', dir: 'to_wallet', amount: r250(cash - 600000), note: 'إيداع كاش بالمحفظة' }); cash -= t.amount; wallet += t.amount; }
    else if (cash < 250000 && wallet > 700000) { const t = add({ date, type: 'transfer', channel: 'transfer', dir: 'to_cash', amount: 500000, note: 'سحب كاش من المحفظة' }); cash += t.amount; wallet -= t.amount; }
    let counted = cash + r250((r() - 0.5) * 1000);
    if (d === 78) { counted = cash - 40000; PLANTED.push({ kind: 'cash_short', date, note: 'نقص بالكاش عند التسكيرة' }); }
    closings.push({ date, expected: cash, counted });
    cash = counted; // the counted amount carries to the next day
  }
  tx.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
  // opening stock: chosen so today's shelf is realistic (a few items running low)
  // and the shelf never went negative in the past
  const TARGET_DAYS = { sugar: 1.5, tea: 2.5, eggs: 3, soap: 6, oil: 7, rice: 8, flour: 9, water: 7, pepsi: 8, cigs: 6 };
  for (const p of PRODUCTS) {
    let run = 0, min = 0;
    for (const t of tx) {
      if (t.type === 'purchase') for (const i of t.items) if (i.sku === p.sku) run += i.qty;
      if (t.type === 'sale' || t.type === 'credit_sale') for (const i of t.items) if (i.sku === p.sku) run -= i.qty;
      min = Math.min(min, run);
    }
    const perDay = p.base * (p.sku === 'sugar' ? 1.8 : 1.1);
    OPENING_STOCK[p.sku] = Math.max(-min + Math.round(p.base * 0.5), Math.round(perDay * TARGET_DAYS[p.sku]) - run);
  }
  return { tx, closings, fx, debts, openingCash: 400000, openingWallet: OPEN_WALLET };
}

function daysUntilDom(date, target) {
  let d = 1; let s = addDays(date, 1);
  while (dom(s) !== target && d < 40) { s = addDays(s, 1); d++; }
  return d;
}
export function groupBy(arr, f) { const o = {}; for (const x of arr) (o[f(x)] ||= []).push(x); return o; }
export function cashEffect(t) {
  if (t.type === 'transfer') return t.dir === 'to_cash' ? t.amount : -t.amount;
  if (t.channel !== 'cash') return 0;
  if (t.type === 'sale' || t.type === 'payment_in') return t.amount;
  if (t.type === 'purchase' || t.type === 'expense' || t.type === 'refund' || t.type === 'payment_out') return -t.amount;
  return 0;
}
export function walletEffect(t) {
  if (t.type === 'transfer') return t.dir === 'to_wallet' ? t.amount : -t.amount;
  if (t.channel !== 'wallet') return 0;
  if (t.type === 'sale' || t.type === 'payment_in') return t.amount;
  if (t.type === 'purchase' || t.type === 'expense' || t.type === 'refund' || t.type === 'payment_out') return -t.amount;
  return 0;
}

export const TYPE_AR = { adjust: 'جرد (تعديل مخزون)', transfer: 'تحويل بين الكاش والمحفظة', sale: 'بيع', credit_sale: 'بيع بالدين', payment_in: 'تسديد', purchase: 'شراء بضاعة', expense: 'مصروف', refund: 'إرجاع', payment_out: 'دفع' };
export const CH_AR = { cash: 'كاش', wallet: 'محفظة', credit: 'دين' };
