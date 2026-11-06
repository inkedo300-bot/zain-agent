// ─────────────────────────────────────────────────────────────
// Offline understanding of Iraqi-dialect questions and entries.
// Used when Gemini is not configured, when it fails, and as the
// baseline in the evaluation. Deterministic and readable.
// ─────────────────────────────────────────────────────────────
import { norm, findCustomer, findProduct } from './ledger.js';
import { PRODUCTS, CUSTOMERS, SUPPLIERS } from './data.js';
import { normalizeIraqi, NUMBERS, MULTIPLIERS } from './lexicon.js';

const has = (t, words) => words.some((w) => t.includes(norm(w)));
const MONTHS = { 'كانون الثاني': 1, 'شباط': 2, 'اذار': 3, 'نيسان': 4, 'ايار': 5, 'حزيران': 6, 'تموز': 7, 'اب': 8, 'ايلول': 9, 'تشرين الاول': 10, 'تشرين الثاني': 11, 'كانون الاول': 12 };

export function detectPeriod(t) {
  t = ' ' + norm(t) + ' ';
  const m = t.match(/شهر\s*(\d{1,2})/);
  if (m) return { period: 'month', arg: +m[1] };
  for (const [name, num] of Object.entries(MONTHS)) if (t.includes(' ' + norm(name) + ' ') || t.includes('ب' + norm(name) + ' ') || t.includes('شهر ' + norm(name))) return { period: 'month', arg: num };
  if (/سنه\s*\d{4}|السنه الماضيه|السنه اللي فاتت|العام الماضي/.test(t)) return { period: 'out_of_range' };
  if (has(t, ['الاسبوع الماضي', 'الاسبوع اللي فات', 'الاسبوع الفات', 'الاسبوع السابق', 'الجمعه الفاتت'])) return { period: 'last_week' };
  if (has(t, ['الشهر الماضي', 'الشهر اللي فات', 'الشهر الفات', 'الشهر السابق'])) return { period: 'last_month' };
  if (has(t, ['اخر 7', 'اخر سبع', 'اخر سبعه', 'سبع ايام'])) return { period: 'last7' };
  if (has(t, ['اخر 30', 'اخر شهر', 'اخر ثلاثين', '30 يوم'])) return { period: 'last30' };
  if (has(t, ['البارحه', 'البارح', 'امس', 'مبارح'])) return { period: 'yesterday' };
  if (has(t, ['هالاسبوع', 'هذا الاسبوع', 'هاي الاسبوع', 'الاسبوع'])) return { period: 'this_week' };
  if (has(t, ['هالشهر', 'هذا الشهر', 'هاي الشهر', 'الشهر'])) return { period: 'this_month' };
  if (has(t, ['اليوم', 'هاليوم', 'لحد هسه', 'غله اليوم', 'الغله'])) return { period: 'today' };
  return null;
}

const W = {
  forecast: ['سيوله', 'الشهر الجاي', 'الاسبوع الجاي', 'راح تنقص', 'راح يكفي', 'تكفيني', 'يكفيني', 'تكفي', 'توقع', 'المستقبل', 'تضيق', 'ضيق', 'راح يصير بالفلوس', 'اشوكت تخلص', 'تخلص الفلوس', 'باجر', 'بعدين'],
  anomalies: ['غريب', 'مشكله', 'مشاكل', 'تنبيه', 'تنبيهات', 'غلط', 'مكرر', 'مو طبيعي', 'شي مو صح', 'نقص', 'ناقص', 'اختلاف', 'فرق'],
  debts: ['مطلوب', 'ديون', 'الدين', 'دين', 'يطلبني', 'منو بعده', 'منو باقي', 'ما سدد', 'مسدد', 'عليه', 'عليها', 'بذمه', 'مطلوبه'],
  fx: ['دولار', 'الصرف', 'سعر الصرف', 'الدولار'],
  top: ['اكثر ماده', 'اكثر شي', 'شنو يربح', 'شنو اكثر', 'اي ماده', 'افضل ماده', 'تربحني', 'يربحني', 'اكثر بضاعه', 'اكثر منتج', 'اشو اكثر'],
  expenses: ['مصاريف', 'صرفت', 'مصروف', 'الايجار', 'ايجار', 'المولده', 'اجره', 'اجور', 'مصرف'],
  profit: ['ربح', 'ربحت', 'ربحي', 'فايده', 'فايدتي', 'صافي', 'مربح', 'خسرت', 'خساره', 'طلعلي'],
  sales: ['بعت', 'مبيعات', 'بيع', 'دخل', 'دخلي', 'انباع', 'جبت', 'غله', 'الغله', 'اشتغلت', 'بيعي', 'المبيعات', 'بيعه', 'مدخول'],
  position: ['رصيد', 'كم عندي', 'شكد عندي', 'فلوسي', 'بالجرار', 'بالقاصه', 'الموجود', 'عندي فلوس'],
  reorder: ['اطلب', 'طلبيه', 'اشتري بضاعه', 'شكد اطلب', 'المورد'],
  offtopic: ['لاعب', 'منتخب', 'طقس', 'الجو', 'اغنيه', 'فلم', 'مباراه'],
};

// returns { tool, args } | { refuse, reason } | { tool: 'unknown' }
export function routeOffline(q) {
  const qn = normalizeIraqi(q); // dialect variants → words the rules below know (lexicon.js)
  const t = ' ' + qn + ' ';
  const per = detectPeriod(qn);
  if (has(t, W.offtopic)) return { refuse: true, reason: 'offtopic' };
  if (per?.period === 'out_of_range') return { refuse: true, reason: 'out_of_range' };
  const cust = findCustomer(q);
  // a name that looks like a customer but is not in the book
  const nameLike = t.match(/(ابو|ام|حجي|سيد|ست)\s+(\S+)/);
  const product = findProduct(q) || findProduct(qn);
  const unknownProduct = !product && /(من|بال|ب)\s*(الدجاج|اللحم|الخضره|الفواكه|الموبايلات|الذهب)/.test(t);
  if (unknownProduct) return { refuse: true, reason: 'unknown_product' };

  if (has(t, W.forecast)) return { tool: 'forecast', args: { days: 30 } };
  const invStrong = has(t, ['مخزون', 'المخزون', 'مخزن', 'المخزن', 'نافد', 'شنو خالص', 'شنو ناقص', 'قربت تخلص', 'قرب يخلص', 'شنو قرب']);
  const invWeak = product && has(t, ['باقي', 'ضل', 'بقى', 'عندي', 'عدنا', 'خلص', 'خالص', 'موجود']) && !has(t, ['ربح', 'بعت', 'فلوس']);
  if ((invStrong || invWeak) && !has(t, ['فلوس', 'كاش', 'دين'])) return { tool: 'inventory', args: product ? { sku: product.sku } : {} };
  if (has(t, W.fx)) return { tool: 'fxImpact', args: { period: per?.period || 'last30', arg: per?.arg } };
  if (has(t, W.anomalies) && !has(t, W.debts)) return { tool: 'anomalies', args: {} };
  if (has(t, W.debts) && !has(t, ['بالدين', 'بالاجل'])) {
    if (cust) return { tool: 'customer', args: { name: cust.name } };
    if (nameLike) return { refuse: true, reason: 'unknown_customer', name: nameLike[0].replace(/[؟?!.]/g, '').trim() };
    return { tool: 'debts', args: {} };
  }
  if (cust && !has(t, W.sales) && !has(t, W.profit)) return { tool: 'customer', args: { name: cust.name } };
  if (has(t, W.top)) return { tool: 'topItems', args: { period: per?.period || 'this_month', arg: per?.arg } };
  if (has(t, W.expenses)) {
    const category = has(t, ['ايجار', 'الايجار']) ? 'rent' : has(t, ['مولده', 'المولده']) ? 'gen' : has(t, ['اجره', 'العامل', 'اجور']) ? 'wage' : undefined;
    return { tool: 'expenses', args: { period: per?.period || 'this_month', arg: per?.arg, category } };
  }
  if (has(t, W.position) || (has(t, ['المحفظه', 'الكاش']) && !has(t, W.sales) && !has(t, W.profit))) {
    const focus = has(t, ['محفظه', 'المحفظه']) ? 'wallet' : has(t, ['كاش', 'الجرار', 'القاصه']) ? 'cash' : 'total';
    return { tool: 'position', args: { focus } };
  }
  if (has(t, W.profit)) {
    if (product) return { tool: 'topItems', args: { period: per?.period || 'this_month', arg: per?.arg, sku: product.sku } };
    return { tool: 'profit', args: { period: per?.period || 'this_week', arg: per?.arg } };
  }
  if (has(t, W.sales) || has(t, ['بالدين', 'بالاجل', 'عالمحفظه', 'كاش'])) {
    const channel = has(t, ['بالدين', 'بالاجل', 'دين']) ? 'credit' : has(t, ['محفظه', 'عالمحفظه', 'بالمحفظه']) ? 'wallet' : has(t, ['كاش', 'نقد', 'نقدي']) ? 'cash' : 'all';
    return { tool: 'sales', args: { period: per?.period || 'today', arg: per?.arg, channel } };
  }
  if (has(t, W.reorder)) return { tool: 'reorder', args: {} };
  return { tool: 'unknown' };
}

// ── numbers in Iraqi speech (word list in lexicon.js: «خمسطعش»، «ثلثين»، «عشرت تالاف») ──
const numWord = (tk) => {
  if (NUMBERS[tk] != null || MULTIPLIERS[tk] != null) return tk;
  const w = tk.replace(/^[وب]/, ''); // «وعشرين»، «بخمسطعش»
  return w !== tk && (NUMBERS[w] != null || MULTIPLIERS[w] != null) ? w : null;
};
export function wordsToNumber(s) {
  let total = 0, cur = 0, seen = false, lastMult = 0;
  for (const tk of norm(s).split(/\s+/).filter(Boolean)) {
    const w = numWord(tk);
    if (!w) continue;
    seen = true;
    if (NUMBERS[w] != null) {
      const v = NUMBERS[w];
      if (v > 0 && v < 1 && !cur && lastMult) total += v * lastMult; // «الف ونص» = 1500، «مليون وربع»
      else cur += v;
    } else {
      const m = MULTIPLIERS[w];
      if (w === 'الفين' || w === 'مليونين') { total += m; lastMult = m / 2; }
      else { total += (cur || 1) * m; lastMult = m; }
      cur = 0;
    }
  }
  return seen ? total + cur : null;
}
// runs of consecutive number words: «ست نور سددت خمسة وعشرين الف» → [ست] [خمسه وعشرين الف]
export function numberRuns(text) {
  const runs = []; let run = [];
  const flush = () => { if (run.length) runs.push({ words: run.join(' '), value: wordsToNumber(run.join(' ')), mult: run.some((w) => MULTIPLIERS[numWord(w)] != null) }); run = []; };
  for (const tk of norm(text).replace(/[؟?!.,،]/g, ' ').split(/\s+/).filter(Boolean)) numWord(tk) ? run.push(tk) : flush();
  flush();
  return runs;
}
export function parseAmount(text) {
  const t = norm(text).replace(/٬|،/g, ',');
  const m = t.match(/(\d[\d,.]*)\s*(الف|الاف|تالاف|k|مليون)?/);
  if (m) {
    let v = +m[1].replace(/,/g, '');
    if (m[2] === 'مليون') v *= 1e6; else if (m[2]) v *= 1000;
    return v;
  }
  return numberRuns(t).find((r) => r.mult)?.value ?? null;
}

// a unit said in the dual means two: «كيلوين»، «كارتونين»، «طبقتين»
const DUAL = /(كيلوين|كارتونين|كرتونين|لترين|طبقتين|باكيتين|قنينتين|علبتين|كيسين|ربطتين)$/;
// ── items in a sentence: «3 كراتين ببسي و2 كيلو سكر» → [{ sku, qty, qtyGuessed }] ──
// t is normalised text; the number is looked for just before each product word
export function itemsIn(t) {
  const items = [];
  for (const p of PRODUCTS) {
    for (const a of [p.name, ...p.alias]) {
      const idx = t.indexOf(norm(a));
      if (idx < 0) continue;
      const before = t.slice(Math.max(0, idx - 22), idx).trim().split(/\s+/).slice(-3).join(' ');
      let qty = null;
      const dm = before.match(/(\d+)\s*\S*$/);
      if (dm) qty = +dm[1];
      else if (DUAL.test(before)) qty = 2; // «طبقتين بيض»، «كيلوين سكر»
      else { const w = wordsToNumber(before.split(' ').slice(-2).join(' ')); if (w) qty = w; }
      if (!items.find((i) => i.sku === p.sku)) items.push({ sku: p.sku, qty: qty || 1, qtyGuessed: !qty });
      break;
    }
  }
  return items;
}

// ── free-text entry: «بعت 3 كراتين ببسي لأبو حسين بالدين» ──
export function parseEntryOffline(text) {
  const t = ' ' + normalizeIraqi(text) + ' ';
  const out = { raw: text, type: null, customer: null, items: [], amount: null, channel: null, missing: [], confidence: 0.9 };
  const cust = findCustomer(text);
  if (cust) out.customer = cust.id;
  if (has(t, ['سدد', 'سددت', 'دفعلي', 'انطاني', 'رجعلي', 'واصل منه', 'جابلي', 'دز', 'حول'])) out.type = 'payment_in';
  else if (has(t, ['بالدين', 'دين', 'عالحساب', 'على الحساب', 'بالاجل', 'دينته', 'ديّنته']) || (cust && has(t, ['سجل على', 'سجل عليه', 'سجلي على', 'اكتب على', 'قيد على']))) out.type = 'credit_sale';
  else if (has(t, ['مصروف', 'دفعت', 'صرفت'])) out.type = 'expense';
  else if (has(t, ['اشتريت', 'جبت بضاعه', 'من المورد', 'استلمت بضاعه'])) out.type = 'purchase';
  else if (has(t, ['بعت', 'بيع', 'انباع'])) out.type = 'sale';
  // items: look for "<qty> <product>" (the customer's name is cut out first, so «ست نور» is not 6)
  const ti = cust ? t.replace(norm(cust.name), ' ') : t;
  for (const i of itemsIn(ti)) out.items.push({ sku: i.sku, qty: i.qty, price: PRODUCTS.find((p) => p.sku === i.sku).sell, qtyGuessed: i.qtyGuessed });
  // explicit amount («بـ 15 الف» or «15000») — only if not the item quantity
  const am = t.match(/(?:ب|بـ|مبلغ|قيمته|بسعر)\s*(\d[\d,]*\s*(?:الف|الاف|تالاف)?|[^\d\s]+\s+(?:الف|الاف|تالاف))/) || (out.type === 'payment_in' || out.type === 'expense' ? [null, t] : null);
  if (am) { const v = parseAmount(am[1]); if (v && v >= 250) out.amount = v; }
  // Iraqis drop «الف»: «انطاني خمسة وعشرين» = 25,000 (no note is smaller than 250)
  if (!out.amount && !out.items.length && (out.type === 'payment_in' || out.type === 'expense')) {
    const d = t.match(/(\d[\d,]*)(?![\d,])(?!\s*(?:الف|الاف|تالاف|مليون))/), runs = numberRuns(t).filter((r) => r.value >= 1);
    const v = d ? +d[1].replace(/,/g, '') : runs.length ? runs[runs.length - 1].value : null;
    if (v >= 1 && v < 250) { out.amount = v * 1000; out.amountGuessed = true; }
  }
  if (!out.amount && out.items.length) out.amount = out.items.reduce((a, i) => a + i.qty * i.price, 0);
  if (out.type === 'expense') out.category = has(t, ['ايجار']) ? 'rent' : has(t, ['مولده']) ? 'gen' : has(t, ['اجره', 'العامل']) ? 'wage' : 'other';
  out.channel = out.type === 'credit_sale' ? 'credit' : has(t, ['محفظه', 'حول', 'دز', 'رابط']) ? 'wallet' : 'cash';
  if (!out.type) out.missing.push('type');
  if ((out.type === 'credit_sale' || out.type === 'payment_in') && !out.customer) out.missing.push('customer');
  if (!out.amount) out.missing.push('amount');
  if (out.items.some((i) => i.qtyGuessed) || out.amountGuessed) out.confidence = 0.6;
  if (out.missing.length) out.confidence = Math.min(out.confidence, 0.4);
  return out;
}

export function looksLikeEntry(text) {
  const t = ' ' + normalizeIraqi(text) + ' ';
  if (/[؟?]/.test(text) || has(t, ['شكد', 'كم ', 'منو', 'شنو', 'اشكد', 'اشو', 'هل ', 'ليش', 'شلون', 'راح '])) return false;
  return has(t, ['بعت', 'سجل', 'سجلي', 'بالدين', 'سدد', 'انطاني', 'دفعت', 'صرفت', 'اشتريت', 'دينته', 'عالحساب']);
}
export const SUGGESTIONS = ['شكد بعت اليوم؟', 'ليش ربحي نزل؟', 'شلون أدبر الإيجار الشهر الجاي؟', 'منو بعده مطلوب إلي؟', 'راح تكفيني الفلوس الشهر الجاي؟', 'اكو شي غريب بالحسابات؟', 'شنو أكثر مادة تربحني؟', 'شكد كلفني الدولار آخر شهر؟'];
export const customerNames = () => CUSTOMERS.map((c) => c.name);

// ── commands: things the owner wants DONE, not asked ──
// «ذكّر أم زينب»، «دزله رابط دفع لأبو علي»، «اطلب من الرافدين»
const VOC = /^(يا\s*)?(علي|حبيبي|عيني|عيوني|اخي|أخي|اخوي|أخوي|خويه|خوية|اغاتي|أغاتي|حجي|استاذ|أستاذ|عمي|خالي|يمعود|معود|ابني|بويه|يابه|يبه|عزيزي)[،,\s]+/u;
export const stripVocative = (q) => (q || '').replace(VOC, '').trim();
export function detectAction(q) {
  const t = ' ' + normalizeIraqi(stripVocative(q)) + ' ';
  // a question is never a command: «شكد اطلب أم زينب؟» asks what she owes (اطلب = I am owed), «شنو اطلب؟» what to order
  const asking = /(شكد|منو|شنو|كم |متى|ليش|شلون)/.test(t);
  const remind = /(ذكر|ذكره|ذكرها|ذكرهم|تذكير|رابط|طالب|طالبه|طالبها|دزله|دزلها|ارسله|ارسلها|ابعثله|ابعثلها)/.test(t) && !asking;
  if (remind) {
    const c = findCustomer(stripVocative(q).replace(/(ذكّ?ر|تذكير|برابط|رابط|الدفع|للدفع|دفع|طالب|دز|له|لها|ارسل|ابعث)/g, ' '));
    return { tool: 'remind', args: { name: c?.name || null } };
  }
  const order = /(اطلب|اطلبلي|دز طلبيه|دز طلبية|سوي طلبيه|سوي طلبية|ارسل طلبيه|ارسل طلبية|اطلب بضاعه|اطلب بضاعة)/.test(t) && !asking;
  if (order) {
    let sp = Object.values(SUPPLIERS).find((x) => t.includes(norm(x.short)) || t.includes(norm(x.contact)));
    // items said with a number («اطلب 20 كيلو سكر») go on the order as said; with no supplier named, theirs is used
    let items = itemsIn(t).filter((i) => !i.qtyGuessed).map(({ sku, qty }) => ({ sku, qty }));
    if (!sp && items.length) sp = SUPPLIERS[PRODUCTS.find((p) => p.sku === items[0].sku).supplier];
    if (sp) items = items.filter((i) => PRODUCTS.find((p) => p.sku === i.sku).supplier === sp.id);
    // «اطلب على أي حال»: the owner orders even when the stock looks enough
    const force = /(عل[يى] (اي|كل) حال|عالكل حال|حتي لو|حتى لو|مع ذلك|بكل الاحوال|غصبا|ولو ماكو حاجه)/.test(t);
    return { tool: 'order', args: { supplier: sp?.id || null, ...(force ? { force: true } : {}), ...(items.length ? { items } : {}) } };
  }
  return null;
}
// a short follow-up keeps the last question's subject: «والبارحة؟» after «شكد بعت اليوم؟», «والسكر؟» after a stock question
const PERIODIC = ['sales', 'profit', 'expenses', 'topItems', 'fxImpact'];
export function followUp(q, ctx) {
  if (!ctx?.tool) return null;
  const qn = normalizeIraqi(q);
  if (qn.split(/\s+/).filter(Boolean).length > 4) return null; // a whole new question is not a follow-up
  const per = detectPeriod(qn), cust = findCustomer(q), product = findProduct(q) || findProduct(qn);
  if (per && per.period !== 'out_of_range' && PERIODIC.includes(ctx.tool)) return { tool: ctx.tool, args: { ...ctx.args, period: per.period, arg: per.arg } };
  if (cust && ['customer', 'debts'].includes(ctx.tool)) return { tool: 'customer', args: { name: cust.name } };
  if (product && ['inventory', 'topItems'].includes(ctx.tool)) return { tool: ctx.tool, args: { ...ctx.args, sku: product.sku } };
  return null;
}
// what the conversation is about after a turn: the last subject, customer and supplier
export function nextContext(prev, q, r) {
  const c = { ...(prev || {}) };
  if (r?.tool && !r.refuse && r.tool !== 'unknown') { c.q = q; c.tool = r.tool; c.args = r.args || {}; }
  if (r?.args?.name) c.customer = r.args.name;
  if (r?.args?.supplier) c.supplier = r.args.supplier;
  return c;
}
// «شكد ربحت اليوم؟ ومنو مطلوب إلي؟» → two questions
const QWORD = /^(?:و)?(شكد|شگد|اشكد|منو|شنو|ليش|شلون|كم|وين|اشوكت|متى|شوكت)(?=\s|$)/;
const GREETING = /^(?:و)?(?:السلام عليكم|سلام عليكم|هلا|هلو|مرحبا|صباح الخير|مساء الخير|مسا الخير|شلونك|شلونكم|اشلونك|شخبارك|شخباركم|شلون الصحه|شلون صحتك)(?:\s+(?:حبيبي|عيني|اخي|اخوي|عمي|استاذ))?$/;
// spoken questions come back from speech-to-text joined by commas: «السلام عليكم، شلونك، شكد بعت اليوم، وليش نزل ربحي؟».
// Greetings are dropped; a piece without a question word stays with the question before it (until a «؟» closes it).
export function splitQuestions(q) {
  const whole = stripVocative(q), qs = [];
  for (const part of whole.split(/[؟?]/)) {
    let cur = -1;
    for (const s of part.split(/[،,]/).map((x) => x.trim()).filter(Boolean)) {
      const n = norm(s);
      if (GREETING.test(n)) continue;
      if (QWORD.test(n) || cur < 0) cur = qs.push(s.replace(/^و\s*/, '')) - 1;
      else qs[cur] += '، ' + s;
    }
  }
  const real = qs.filter((x) => QWORD.test(norm(x)) && x.split(/\s+/).length >= 2);
  return real.length >= 2 ? real.slice(0, 3).map((x) => x + '؟') : [whole];
}
