// ─────────────────────────────────────────────────────────────
// The agent: Gemini understands and explains, the ledger computes.
//  1. route    — question → one tool call (Gemini, validated; offline parser as fallback)
//  2. tool     — deterministic arithmetic on the ledger (ledger.js)
//  3. answer   — Gemini phrases it in Iraqi dialect; every number is checked
//                against the tool result, otherwise the template answer is used
// ─────────────────────────────────────────────────────────────
import { Ledger, period } from './ledger.js';
import { routeOffline, parseEntryOffline, looksLikeEntry, detectAction, stripVocative } from './nlu.js';
import { callLLM, extractJSON, llmStatus } from './llm.js';
import { CUSTOMERS, PRODUCTS, SUPPLIERS, productBySku, customerById, fmt, dateAr, TODAY, SHOP, daysBetween, addDays, dom } from './data.js';

export const ACTIONS = ['remind', 'order'];
export const TOOL_NAMES = ['remind', 'order', 'sales', 'profit', 'debts', 'customer', 'topItems', 'expenses', 'fxImpact', 'position', 'forecast', 'anomalies', 'reorder', 'inventory'];
const PERIODS = ['today', 'yesterday', 'this_week', 'last_week', 'last7', 'this_month', 'last_month', 'last30', 'month', 'all'];

const ROUTER = `أنت موجّه أسئلة داخل تطبيق دفتر حسابات لبقالة عراقية. حوّل سؤال صاحب المحل (باللهجة العراقية) لاستدعاء أداة واحدة. لا تحسب أي رقم.
الأدوات:
- sales {period, arg?, channel: all|cash|wallet|credit} : المبيعات
- profit {period, arg?} : الربح (المبيعات ناقص كلفة البضاعة والمصاريف)
- debts {} : منو مطلوب ومجموع الديون
- customer {name} : شكد مطلوب من زبون معيّن. الأسماء الموجودة: ${CUSTOMERS.map((c) => c.name).join('، ')}
- topItems {period, arg?, sku?} : أكثر المواد ربحاً أو ربح مادة معيّنة. المواد: ${PRODUCTS.map((p) => `${p.sku}=${p.name}`).join('، ')}
- expenses {period, arg?, category?: rent|gen|wage|draw} : المصاريف
- fxImpact {period} : تأثير سعر الدولار
- position {focus: total|cash|wallet} : شكد عندي فلوس هسه
- forecast {days:30} : السيولة والتوقع للأيام الجاية
- anomalies {} : الأشياء الغريبة أو الأخطاء بالحسابات
- reorder {} : شنو أطلب من الموردين
- inventory {sku?} : المخزون: شكد باقي من مادة، أو شنو قرب يخلص
أوامر (صاحب المحل يريد تنسوي شغلة، مو يسأل):
- remind {name|null} : ذكّر زبون بدينه وأرسله رابط دفع (مثل «ذكّر أم زينب»، «دزله رابط دفع»)
- order {supplier: S1|S2|S3|null} : سوّي طلبية لمورد. الموردين: ${Object.values(SUPPLIERS).map((x) => `${x.id}=${x.short}`).join('، ')}
الكلام ممكن يبدأ بنداء مثل «علي» أو «حبيبي»، تجاهله.
period واحد من: ${PERIODS.join(', ')}. إذا period=month فـ arg رقم الشهر (1-12). اليوم ${TODAY}. البيانات موجودة بس لآخر 90 يوم.
إذا السؤال عن زبون أو مادة مو موجودة بالقوائم، أو عن فترة قبل 90 يوم، أو ما إله علاقة بالمحل: أرجع {"refuse":true,"reason":"unknown_customer|unknown_product|out_of_range|offtopic"}.
أرجع JSON فقط: {"tool":"...","args":{...}}`;

const WRITER = `أنت مساعد صاحب بقالة عراقية اسمه ${SHOP.owner} (تحچي وياه هو، مو ويا الزبون، ولا تخترع أسماء). اكتب جواب قصير (جملتين أو ثلاث) باللهجة العراقية البسيطة، بدون مصطلحات محاسبية، بدون تنسيق Markdown، وبدون ما تذكر إنك ذكاء اصطناعي. اكتب التواريخ بالكلام مثل «4 أيلول».
القاعدة الأهم: استخدم فقط الأرقام الموجودة بنتيجة الأداة، واكتبها بالأرقام مع فواصل مثل 1,250,000. ممنوع تجمع أو تطرح أو تحسب نسبة أو تقرّب لرقم جديد.
ممنوع تذكر أي معلومة مو موجودة بنتيجة الأداة: لا تنسب كلام أو وعد أو رد أو شعور لأي زبون أو مورد، ولا تگول إنك أرسلت أو ذكّرت أو سجلت شي، لأن إنت بس تجاوب. ولا تضيف فترة زمنية (مثل «هالأسبوع») إذا مو موجودة بالنتيجة.
إذا الرقم تقدير (توقع) گول «متوقع» أو «تقريباً». أرجع JSON فقط: {"answer":"..."}`;

const REFUSALS = {
  out_of_range: 'ما عندي بيانات لهاي الفترة. الدفتر يغطي آخر 90 يوم بس.',
  unknown_product: 'هاي المادة ما موجودة بدفترك، فما أگدر أحسب ربحها.',
  unknown_customer: 'ما لگيت هالاسم بقائمة زبائن الدين. تأكد من الاسم لو سجّله كزبون جديد.',
  offtopic: 'أني مختص بحسابات محلك بس. اسألني عن البيع، الربح، الديون، أو السيولة.',
  unknown: 'ما فهمت السؤال زين. جرّب مثلاً: «شكد بعت اليوم؟» أو «منو بعده مطلوب إلي؟»',
};

export function friendlyErr(e) {
  const m = String(e?.message || e);
  if (/quota|rate/i.test(m)) return 'Gemini وصل لحد الاستخدام المجاني بالدقيقة';
  if (/high demand|overloaded|UNAVAILABLE/i.test(m)) return 'Gemini مشغول هسه';
  if (/abort/i.test(m)) return 'Gemini تأخر بالرد';
  if (/API key/i.test(m)) return 'مفتاح Gemini مو صحيح';
  return m.slice(0, 80);
}
// ── 1. route ──
function validRoute(j) {
  if (!j) return false;
  if (j.refuse) return true;
  if (!TOOL_NAMES.includes(j.tool)) return false;
  const a = j.args || {};
  if (a.period && !PERIODS.includes(a.period)) return false;
  if (a.period === 'month' && !(+a.arg >= 1 && +a.arg <= 12)) return false;
  if (a.channel && !['all', 'cash', 'wallet', 'credit'].includes(a.channel)) return false;
  if (j.tool === 'customer' && !CUSTOMERS.some((c) => c.name === a.name)) return false;
  if (j.tool === 'remind' && a.name && !CUSTOMERS.some((c) => c.name === a.name)) return false;
  if (j.tool === 'order' && a.supplier && !SUPPLIERS[a.supplier]) return false;
  if (a.sku && !productBySku(a.sku)) return false;
  return true;
}
export async function route(q, { useLLM = true } = {}) {
  const off = routeOffline(q);
  if (useLLM && llmStatus().ok) {
    try {
      const { text, ms } = await callLLM({ system: ROUTER, messages: [{ role: 'user', content: q }], json: true, maxTokens: 200, timeoutMs: 12000 });
      const j = extractJSON(text);
      if (validRoute(j)) return { route: j, source: 'gemini', ms, offline: off };
      return { route: off, source: 'offline', fallback: 'رد النموذج ما اجتاز التحقق', raw: text, offline: off };
    } catch (e) { return { route: off, source: 'offline', fallback: friendlyErr(e), offline: off }; }
  }
  return { route: off, source: 'offline', offline: off };
}

// ── 2. tool ──
export function runTool(L, r) {
  if (!r || r.refuse || r.tool === 'unknown') return null;
  const a = r.args || {};
  switch (r.tool) {
    case 'sales': return L.sales(a);
    case 'profit': return L.profit(a);
    case 'debts': return L.debts();
    case 'customer': return L.customer(a);
    case 'topItems': return L.topItems(a);
    case 'expenses': return L.expenses(a);
    case 'fxImpact': return L.fxImpact(a);
    case 'position': return L.position();
    case 'forecast': return L.forecast({ days: 30 });
    case 'anomalies': return L.anomalies();
    case 'reorder': return L.reorder();
    case 'inventory': return L.inventory({ sku: a.sku });
  }
  return null;
}
export function mainFigure(r, res) {
  if (!res || res.empty) return null;
  const f = (k) => res.figures.find((x) => x.key === k);
  switch (r.tool) {
    case 'sales': return f(r.args?.channel && r.args.channel !== 'all' ? r.args.channel : 'total');
    case 'profit': return f('net');
    case 'debts': return f('total');
    case 'customer': return f('balance');
    case 'expenses': return f('total');
    case 'fxImpact': return f('extra');
    case 'position': return f(r.args?.focus || 'total');
    case 'forecast': return f('lowest');
    case 'anomalies': return f('count');
    case 'topItems': return r.args?.sku ? f('profit:' + r.args.sku) : res.figures[0];
    case 'inventory': return r.args?.sku ? f('stock:' + r.args.sku) : f('low');
  }
  return null;
}

// ── 3. answer ──
const F = (res, k) => res.figures.find((x) => x.key === k)?.value ?? 0;
export function templateAnswer(r, res) {
  if (!r || r.refuse) return REFUSALS[r?.reason] || REFUSALS.unknown;
  if (r.tool === 'unknown') return REFUSALS.unknown;
  if (!res || res.empty) return res?.query ? REFUSALS.unknown_customer : REFUSALS.out_of_range;
  const L = res.period?.label || '';
  switch (r.tool) {
    case 'sales': {
      const ch = r.args?.channel;
      if (ch && ch !== 'all') return `${L} بعت ${ch === 'cash' ? 'كاش' : ch === 'wallet' ? 'عالمحفظة' : 'بالدين'} بـ ${fmt(F(res, ch))} دينار.`;
      return `${L} بعت بـ ${fmt(F(res, 'total'))} دينار: ${fmt(F(res, 'cash'))} كاش، و${fmt(F(res, 'wallet'))} عالمحفظة، و${fmt(F(res, 'credit'))} بالدين.`;
    }
    case 'profit':
      return `${L} ربحك من البضاعة ${fmt(F(res, 'gross'))} دينار من مبيعات ${fmt(F(res, 'revenue'))}. بعد المصاريف (${fmt(F(res, 'expenses'))}) يبقى صافي ${fmt(F(res, 'net'))} دينار.`;
    case 'debts': {
      const top = res.rows.slice(0, 3).map((x) => `${x.name} ${fmt(x.balance)}`).join('، ');
      const late = res.rows.filter((x) => x.overdue).map((x) => x.name);
      return `مطلوبلك ${fmt(F(res, 'total'))} دينار عند ${res.rows.length} زباين. أكثرهم: ${top}.${late.length ? ` و${late.join(' و')} متأخر عن عادته.` : ''}`;
    }
    case 'customer': {
      const b = F(res, 'balance');
      if (!b) return `${res.customer.name} مسدد كلشي، ما مطلوب منه شي.`;
      const oldest = Math.max(...res.open.map((d) => d.age));
      return `${res.customer.name} مطلوب منه ${fmt(b)} دينار. أقدم دين عمره ${oldest} يوم${res.usual != null ? `، وعادته يسدد خلال ${res.usual} يوم` : ''}.`;
    }
    case 'topItems': {
      if (r.args?.sku) { const row = res.rows.find((x) => x.sku === r.args.sku); return row ? (row.profit >= 0 ? `${L} ربحت من ${row.name} ${fmt(row.profit)} دينار (بعت ${fmt(row.qty)}).` : `${L} خسرت بـ${row.name} ${fmt(-row.profit)} دينار (بعت ${fmt(row.qty)})، لأن كلفته صارت أعلى من سعر بيعك.`) : REFUSALS.unknown_product; }
      const [a, b, c] = res.rows;
      const worst = res.rows.at(-1);
      return `${L} أكثر شي ربّحك ${a.name} (${fmt(a.profit)} دينار)، بعده ${b.name} (${fmt(b.profit)})، و${c.name} (${fmt(c.profit)}).${worst.profit < 0 ? ` وانتبه: ${worst.name} طالع خسارة (${fmt(worst.profit)}).` : ''}`;
    }
    case 'expenses': return `${L} صرفت ${fmt(F(res, 'total'))} دينار${res.figures.length > 2 ? ': ' + res.figures.slice(1).map((x) => `${x.label} ${fmt(x.value)}`).join('، ') : ''}.`;
    case 'fxImpact': return `الدولار صار ${fmt(F(res, 'rate_to'))} بعد ما كان ${fmt(F(res, 'rate_from'))}. هالشي كلفك ${fmt(F(res, 'extra'))} دينار زيادة على البضاعة اللي تنشترى بالدولار (${L}).${res.oil.cost > res.oil.sell ? ` والزيت هسه كلفته ${fmt(res.oil.cost)} وتبيعه بـ ${fmt(res.oil.sell)}.` : ''}`;
    case 'position': {
      const fo = r.args?.focus;
      if (fo === 'wallet') return `رصيد المحفظة هسه ${fmt(F(res, 'wallet'))} دينار.`;
      if (fo === 'cash') return `المفروض عندك بالجرار ${fmt(F(res, 'cash'))} دينار كاش.`;
      return `عندك هسه ${fmt(F(res, 'cash'))} كاش و${fmt(F(res, 'wallet'))} بالمحفظة، المجموع ${fmt(F(res, 'total'))} دينار. وعند الناس ديون ${fmt(F(res, 'debts'))}.`;
    }
    case 'forecast': return forecastText(res);
    case 'anomalies': return res.items.length ? `لگيت ${res.items.length} أشياء تحتاج انتباه. أهمها: ${res.items.slice(0, 3).map((a, i) => `(${i + 1}) ${a.title}`).join('، ')}.` : 'ما لگيت شي غريب بالحسابات.';
    case 'reorder': return 'حسب المخزون وسرعة البيع، جهزتلك طلبية لكل مورد يحتاج. تگدر تراجعها من شاشة «الموردين».';
    case 'inventory': {
      if (r.args?.sku) { const x = res.rows[0]; return x.stock <= 0 ? `${x.name} خالص من المخزن.` : `باقي عندك ${fmt(x.stock)} ${x.name}، يكفي حوالي ${x.cover} يوم حسب بيع هالأسبوع (${x.perDay} باليوم).`; }
      const low = res.rows.filter((x) => x.status === 'out' || x.status === 'low');
      return low.length ? `قربت تخلص: ${low.map((x) => `${x.name} (باقي ${fmt(x.stock)}، يكفي ${x.cover} يوم)`).join('، ')}. الباقي كافي.` : 'المخزون كافي، ماكو مادة قربت تخلص.';
    }
  }
  return REFUSALS.unknown;
}
export function forecastText(fc) {
  const d = fc.drivers.filter((x) => x.label !== 'بضاعة الموردين الأسبوعية').slice(0, 2).map((x) => `${x.label} (${fmt(x.amount)}) يوم ${dateAr(x.date)}`).join(' و');
  const tight = fc.lowest.balance < 500000;
  const pend = fc.pending[0];
  const low = fc.lowest.balance < 0 ? `رصيدك ينزل تحت الصفر بـ ${fmt(-fc.lowest.balance)} دينار، يعني الفلوس ما تكفي` : `رصيدك ينزل لحدود ${fmt(fc.lowest.balance)} دينار`;
  return `${tight ? 'الشهر الجاي ضيق.' : 'الشهر الجاي ماشي.'} أوطأ نقطة متوقعة يوم ${dateAr(fc.lowestDate)}: ${low}.${d ? ` السبب الرئيسي ${d}، فوگ بضاعة الموردين كل أسبوع.` : ''}${pend ? ` إذا حصّلت دين ${pend.customer} (${fmt(pend.amount)}) من وقت، يرتاح الحساب.` : ''}`;
}

export function numbersIn(text) {
  const t = String(text).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\d{4}-\d{2}-\d{2}/g, ' ');
  const out = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(ألف|الف|آلاف|الاف|مليون)?/g;
  let m;
  while ((m = re.exec(t))) { let v = +m[1].replace(/,/g, ''); if (m[2] === 'مليون') v *= 1e6; else if (m[2]) v *= 1000; out.push(Math.round(v)); }
  return out;
}
export function validateAnswer(text, res, r) {
  const allowed = Ledger.allowedNumbers(res);
  if (r?.args?.arg) allowed.add(+r.args.arg);
  if (res?.marginPct) allowed.add(Math.round(res.marginPct));
  const bad = numbersIn(text).filter((n) => !(allowed.has(n) || n <= 31));
  const problems = bad.map((n) => `رقم غير موجود بالنتيجة: ${fmt(n)}`);
  if (/(ذكاء اصطناعي|نموذج لغوي|بصفتي|AI)/i.test(text)) problems.push('يذكر الذكاء الاصطناعي');
  if (text.length > 420) problems.push('الجواب طويل');
  // the ledger has no record of what anyone said or promised, and the assistant did not act
  const said = /(?:^|[\s،.]|و)(گال|قال|گالت|قالت|گالتلي|قالتلي|گاللي|قاللي|وعد|وعدت|وعدته|وعدتني|وعدني|تذكرت|تذكّرت|ردت|رد عليّ?|حچت|حچى|اعتذر|اعتذرت|أرسلت|ارسلت|ذكرته|ذكرتها|ذكّرته|ذكّرتها|بلغته|بلغتها|دزيت|دزيتله|دزيتلها)(?=$|[\s،.؟!])/u;
  if (said.test(text) || /(رح|راح)\s+(ي|ت)(دفع|سدد|خلص)/u.test(text)) problems.push('نسب كلام أو فعل ما موجود بالدفتر');
  const mf = r && res ? mainFigure(r, res) : null;
  if (mf && mf.value && !['anomalies', 'topItems', 'inventory'].includes(r.tool) && !text.includes(fmt(Math.abs(mf.value)))) problems.push('ما ذكر الرقم الأساسي ' + fmt(Math.abs(mf.value)));
  return problems;
}
function compact(res) {
  const c = { ...res };
  c.figures = res.figures?.map(({ key, label, value }) => ({ key, label, value }));
  if (res.series) { c.series = undefined; c.lowest = { date: res.lowestDate, balance: res.lowest.balance }; }
  if (res.rows) c.rows = res.rows.slice(0, 8).map(({ ids, ...x }) => x);
  if (res.items) c.items = res.items.slice(0, 6).map(({ ids, ...x }) => x);
  if (res.open) c.open = res.open.map(({ id, ...x }) => x);
  return JSON.stringify(c);
}

export async function ask(L, q, { useLLM = true } = {}) {
  const trace = [];
  const t0 = performance.now();
  q = stripVocative(q);
  const act = detectAction(q);
  if (act) { trace.push({ step: 'فهم الأمر', source: 'offline', detail: act }); return { q, route: act, routeSource: 'offline', action: act, trace, ms: Math.round(performance.now() - t0) }; }
  const rt = await route(q, { useLLM });
  trace.push({ step: 'فهم السؤال', source: rt.source, ms: rt.ms, detail: rt.route, fallback: rt.fallback });
  const r = rt.route;
  if (ACTIONS.includes(r?.tool)) return { q, route: r, routeSource: rt.source, action: r, trace, ms: Math.round(performance.now() - t0) };
  const res = runTool(L, r);
  if (res) trace.push({ step: 'الأداة', tool: r.tool, args: r.args, figures: res.figures?.map(({ key, label, value, ids }) => ({ key, label, value, n: ids?.length || 0 })) });
  const tmpl = templateAnswer(r, res);
  let answer = tmpl, answerSource = 'template', problems = [];
  if (useLLM && llmStatus().ok && res && !res.empty) {
    try {
      const { text, ms } = await callLLM({ system: WRITER, messages: [{ role: 'user', content: `السؤال: ${q}\nنتيجة الأداة ${r.tool}: ${compact(res)}` }], json: true, maxTokens: 400, timeoutMs: 12000 });
      const j = extractJSON(text);
      if (j?.answer) {
        problems = validateAnswer(j.answer, res, r);
        if (!problems.length) { answer = j.answer; answerSource = 'gemini'; }
        trace.push({ step: 'صياغة الجواب', source: 'gemini', ms, accepted: !problems.length, problems, draft: j.answer });
      }
    } catch (e) { trace.push({ step: 'صياغة الجواب', source: 'gemini', error: friendlyErr(e) }); }
  }
  trace.push({ step: 'التحقق', ok: !res || !validateAnswer(answer, res, r).length, answerSource });
  return { q, route: r, routeSource: rt.source, res, answer, answerSource, main: mainFigure(r, res), trace, ms: Math.round(performance.now() - t0) };
}

// ── entries from free text ──
const ENTRY = `استخرج قيد من كلام صاحب بقالة عراقية. أرجع JSON فقط:
{"type":"sale|credit_sale|payment_in|expense|purchase","customer":"<اسم من القائمة أو null>","items":[{"sku":"<sku>","qty":<عدد>}],"amount":<رقم فقط إذا مذكور صراحة بالكلام وإلا null>,"channel":"cash|wallet|credit","category":"rent|gen|wage|other|null"}
الزبائن: ${CUSTOMERS.map((c) => c.name).join('، ')}. المواد: ${PRODUCTS.map((p) => `${p.sku}=${p.name}`).join('، ')}.
لا تخترع سعر: الأسعار تنحسب من قائمة المحل. إذا شي مو واضح خليه null.`;
export async function parseEntry(text, { useLLM = true } = {}) {
  const off = parseEntryOffline(text);
  if (!(useLLM && llmStatus().ok)) return { ...off, source: 'offline' };
  try {
    const { text: out } = await callLLM({ system: ENTRY, messages: [{ role: 'user', content: text }], json: true, maxTokens: 300 });
    const j = extractJSON(out);
    if (!j || !j.type) return { ...off, source: 'offline', fallback: 'bad_json' };
    const e = { raw: text, type: j.type, customer: null, items: [], amount: null, channel: j.channel || 'cash', missing: [], confidence: 0.9, category: j.category };
    const c = CUSTOMERS.find((x) => x.name === j.customer); if (c) e.customer = c.id;
    for (const it of j.items || []) { const p = productBySku(it.sku); if (p && +it.qty > 0) e.items.push({ sku: p.sku, qty: +it.qty, price: p.sell }); }
    // an explicit amount is accepted only if that number is actually in the text
    if (j.amount && numbersIn(text).concat(off.amount ? [off.amount] : []).includes(Math.round(+j.amount))) e.amount = +j.amount;
    if (!e.amount && e.items.length) e.amount = e.items.reduce((a, i) => a + i.qty * i.price, 0);
    if (!e.amount && off.amount) e.amount = off.amount;
    if (e.type === 'credit_sale') e.channel = 'credit';
    if ((e.type === 'credit_sale' || e.type === 'payment_in') && !e.customer) e.missing.push('customer');
    if (!e.amount) e.missing.push('amount');
    if (e.missing.length) e.confidence = 0.4;
    return { ...e, source: 'gemini' };
  } catch (err) { return { ...off, source: 'offline', fallback: friendlyErr(err) }; }
}
export { looksLikeEntry };

// ── speech → text with the shop's vocabulary ──
const STT = `إنت تفريغ صوتي (speech-to-text) فقط. حوّل الكلام المسموع بالتسجيل لنص عربي حرفياً مثل ما انگال، باللهجة العراقية. المتكلم صاحب بقالة بالبصرة يسأل مساعده أو يسجل قيد.
كلمات تتكرر عنده: ذكّر، رابط دفع، طلبية، اطلب، شكد، شگد، ربحت، الغلة، مطلوب إلي، منو، بالدين، سدد، سجل، المخزن، المخزون، باقي، خلص، قرب يخلص، الكاش، المحفظة، اليوم، البارحة، هالأسبوع، الأسبوع الماضي، هالشهر، الشهر الماضي، الدولار، الإيجار، المورد، طلبية.
أسماء زباينه: ${CUSTOMERS.map((c) => c.name).join('، ')}. موادّه: ${PRODUCTS.map((p) => [p.name, ...p.alias].join('/')).join('، ')}. الموردين: الرافدين، مشروبات البصرة، مخازن الأمل.
إذا كلمة مسموعة قريبة من وحدة من هذي الكلمات أو الأسماء، اكتبها بالشكل الصحيح.
اكتب الأرقام بالأرقام (مثلاً 25 الف، 3 كراتين). لا تجاوب على السؤال، ولا تضيف تعليق، ولا تكتب أي شي ما انگال. إذا ماكو كلام أبد أرجع text فارغ.
أرجع JSON فقط: {"text":"..."}`;
const STT_ASK = 'فرّغ الكلام اللي بالتسجيل الصوتي المرفق.';
// deterministic touch-ups for near-misses the model sometimes makes
const STT_FIX = [[/محزن/g, "مخزن"], [/هال(أسماء|اسماء|سمك|اسبوغ)/g, "هالأسبوع"], [/محزون/g, 'مخزون'], [/\s*(هذا التسجيل|التسجيل الصوتي)\.?$/u, ''], [/[.،]+$/u, '']];
export function cleanTranscript(t) { let s = (t || '').trim(); for (const [re, to] of STT_FIX) s = s.replace(re, to); return s.trim(); }
export async function transcribe(dataUrl) {
  let ms = 0, out = '';
  for (const tier of ['media', 'strong']) { // Flash-Lite first (500/day free); an empty result gets one try on Flash
    const r = await callLLM({ system: STT, messages: [{ role: 'user', content: STT_ASK }], images: [dataUrl], json: true, maxTokens: 200, timeoutMs: 30000, tier });
    ms += r.ms || 0;
    out = cleanTranscript(extractJSON(r.text)?.text);
    if (out) break;
  }
  if (out.length > 300) throw new Error('نص طويل');
  return { text: out, ms };
}

// ── reading a photographed notebook page ──
const OCR = `هذي صورة صفحة من دفتر دين ورقي لبقالة عراقية، مكتوبة بخط اليد. استخرج كل سطر: اسم الزبون، المادة، الكمية، والمبلغ.
لكل حقل أعط ثقة من 0 إلى 1. إذا ما تگدر تقرا حقل خليه null وثقته 0. لا تخمن.
أرجع JSON فقط: {"lines":[{"customer":"...","customer_conf":0.9,"item":"...","item_conf":0.8,"qty":2,"qty_conf":0.7,"amount":15000,"amount_conf":0.9}]}`;
export const SAMPLE_PAGE = {
  lines: [
    { customer: 'أبو حسين', customer_conf: 0.95, item: 'ببسي', item_conf: 0.9, qty: 2, qty_conf: 0.85, amount: 18000, amount_conf: 0.9 },
    { customer: 'أم مريم', customer_conf: 0.9, item: 'بيض', item_conf: 0.8, qty: 1, qty_conf: 0.9, amount: 5500, amount_conf: 0.85 },
    { customer: 'سيد جاسم', customer_conf: 0.55, item: 'تمن', item_conf: 0.7, qty: 5, qty_conf: 0.45, amount: null, amount_conf: 0 },
    { customer: 'علاوي', customer_conf: 0.85, item: 'جگاير', item_conf: 0.9, qty: 2, qty_conf: 0.8, amount: 7000, amount_conf: 0.8 },
  ],
};
export async function readNotebook(image) {
  if (!image) return { ...SAMPLE_PAGE, source: 'sample' };
  const { text } = await callLLM({ system: OCR, messages: [{ role: 'user', content: 'اقرأ الصفحة.' }], images: [image], json: true, maxTokens: 900, timeoutMs: 45000, tier: 'strong' });
  const j = extractJSON(text);
  if (!j?.lines) throw new Error('ما گدرنا نقرا الصفحة');
  return { lines: j.lines, source: 'gemini' };
}
export const CONF_MIN = 0.7;
export function notebookToEntries(page) {
  return page.lines.map((l, i) => {
    const c = CUSTOMERS.find((x) => x.name === l.customer) || (l.customer ? CUSTOMERS.find((x) => x.name.includes(l.customer) || l.customer.includes(x.name)) : null);
    const p = PRODUCTS.find((x) => [x.name, ...x.alias].some((a) => (l.item || '').includes(a)));
    const qty = +l.qty || null;
    const amount = l.amount_conf >= CONF_MIN && l.amount ? +l.amount : qty && p && l.qty_conf >= CONF_MIN ? qty * p.sell : null;
    const flags = [];
    if (!c || l.customer_conf < CONF_MIN) flags.push('الاسم');
    if (!p || l.item_conf < CONF_MIN) flags.push('المادة');
    if (!qty || l.qty_conf < CONF_MIN) flags.push('الكمية');
    if (!amount) flags.push('المبلغ');
    return { i, line: l, customer: c?.id || null, sku: p?.sku || null, qty, amount, flags, ok: !flags.length };
  });
}

// ── payment reminder with a wallet pay link ──
export function reminderTemplate(L, cid) {
  const b = L.debtBook()[cid]; const c = customerById(cid);
  return `هلا ${c.name}، شلونك؟ حبيت أذكرك بالحساب اللي بذمتك عدنا: ${fmt(b.balance)} دينار. تگدر تسدده بضغطة من الرابط بالمحفظة، ولو جزء منه. تسلم، ${SHOP.owner}.`;
}
export async function draftReminder(L, cid, { useLLM = true } = {}) {
  const b = L.debtBook()[cid]; const c = customerById(cid);
  const tmpl = reminderTemplate(L, cid);
  if (!(useLLM && llmStatus().ok)) return { text: tmpl, source: 'template' };
  try {
    const { text } = await callLLM({ system: `اكتب رسالة تذكير مؤدبة وقصيرة (سطرين) باللهجة العراقية من صاحب بقالة لزبون عنده دين. لازم تذكر المبلغ بالضبط ${fmt(b.balance)} دينار، وتگول إنه يگدر يسدد بضغطة من رابط الدفع بالمحفظة. بدون تهديد وبدون ضغط. توقيع: ${SHOP.owner}. أرجع JSON: {"text":"..."}`,
      messages: [{ role: 'user', content: `الزبون: ${c.name}. أقدم دين: ${Math.max(...b.open.map((d) => d.age))} يوم.` }], json: true, maxTokens: 250 });
    const j = extractJSON(text);
    const bad = j?.text ? numbersIn(j.text).filter((n) => n !== b.balance && n > 31 && !b.open.some((d) => d.age === n)) : ['x'];
    if (j?.text && !bad.length && j.text.includes(fmt(b.balance))) return { text: j.text, source: 'gemini' };
    return { text: tmpl, source: 'template', rejected: 'رقم مو صحيح أو المبلغ ناقص' };
  } catch { return { text: tmpl, source: 'template' }; }
}

// ── morning brief & weekly summary (computed, then phrased) ──
export function morningBrief(L) {
  const fc = L.forecast({ days: 7 });
  const today = fc.series[0];
  const fc14 = L.forecast({ days: 14 });
  const dues = fc14.series.flatMap((r) => r.events.filter((e) => e.kind === 'out' && e.fixed && e.label !== 'سحب شخصي').map((e) => ({ ...e, date: r.date }))).slice(0, 4);
  const debts = L.debts();
  const target = debts.rows.filter((x) => !x.overdue || x.balance < 300000).sort((a, b) => b.balance - a.balance)[0] || debts.rows[0];
  const pos = L.position();
  const cash = pos.figures.find((f) => f.key === 'total').value;
  return { dues, target, cash, tomorrowSales: today.events.find((e) => e.label === 'مبيعات متوقعة')?.amount || 0 };
}
export function weeklySummary(L) {
  const s = L.sales({ period: 'this_week' }), p = L.profit({ period: 'this_week' }), lw = L.sales({ period: 'last_week' });
  const d = L.debts(), a = L.anomalies(), fc = L.forecast({ days: 30 });
  const warn = a.items[0];
  const act = d.rows.find((x) => x.overdue) || d.rows[0];
  return { sales: s.figures[0], lastWeek: lw.figures[0], net: p.figures.find((f) => f.key === 'net'), debts: d.figures[0], warn, act, lowest: fc.lowest, lowestDate: fc.lowestDate };
}
