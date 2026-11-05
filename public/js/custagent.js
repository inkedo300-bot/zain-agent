// ─────────────────────────────────────────────────────────────
// The customer's agent, inside the customer's own wallet.
// It understands what the customer wants from the shop (buy, pay a debt, a price,
// what they owe) and prepares it as a card. It never sends or pays by itself:
// an order goes only when the customer taps «أرسل», and money needs the PIN.
// What it sees: the shop's public price list, whether an item is in stock, and this
// customer's own debts. Never the shop's books, its profit, or other customers.
// The model only maps the sentence to an intent; every price and total is computed here.
// ─────────────────────────────────────────────────────────────
import { PRODUCTS, CUSTOMERS, productBySku, fmt, dateAr, SHOP, r250 } from './data.js';
import { norm } from './ledger.js';
import { normalizeIraqi } from './lexicon.js';
import { itemsIn, parseAmount, numberRuns, stripVocative } from './nlu.js';
import { callLLM, extractJSON, llmStatus } from './llm.js';
import { mask } from './privacy.js';
import { friendlyErr } from './agent.js';

export const CUST_INTENTS = ['buy', 'reorder', 'pay', 'balance', 'history', 'price', 'stock', 'help'];
export const MAX_QTY = 50;
export const CUST_SUGGESTIONS = ['اريد 2 كيلو سكر وكارتون ببسي', 'شكد بذمتي؟', 'ادفع ديني', 'نفس طلبيتي الماضية', 'بيش الزيت؟', 'اكو بيض؟'];

const ROUTER = `أنت وكيل داخل محفظة زبون عراقي، تساعده ويا محل «${SHOP.name}». حوّل كلام الزبون (باللهجة العراقية) لنية وحدة. لا تحسب أي رقم ولا سعر.
النوايا:
- buy {items:[{sku,qty}]} : يريد يشتري أو يجهّز سلة («اريد 2 كيلو سكر وببسي»، «جيبلي طبقة بيض»)
- reorder {} : يريد نفس طلبيته الماضية
- pay {amount: رقم|null, all: true|false} : يريد يسدد دينه للمحل كله أو جزء منه
- balance {} : يسأل شكد بذمته للمحل
- history {} : يسأل شنو اشترى أو شكد دفع
- price {items:[{sku}]} : يسأل عن سعر مادة
- stock {items:[{sku}]} : يسأل إذا المادة موجودة
- help {} : تحية أو يسأل شتگدر تسوي
المواد (sku=الاسم): ${PRODUCTS.map((p) => `${p.sku}=${p.name}`).join('، ')}. qty عدد صحيح من 1 لـ ${MAX_QTY}، وإذا ما انذكر عدد خليه 1. «عشرين» بالفلوس تعني 20000.
أسماء الناس مخفية برموز مثل C3.
إذا سأل عن حسابات المحل أو زبائن غيره (ربح المحل، ديون الناس، شكد على C3) أرجع {"refuse":true,"reason":"private"}. إذا طلب مادة مو بالقائمة أرجع {"refuse":true,"reason":"unknown_product","name":"اسم المادة"}. إذا ما إله علاقة بالمحل أرجع {"refuse":true,"reason":"offtopic"}.
أرجع JSON فقط: {"intent":"...","items":[],"amount":null,"all":false}`;

// ── 1. understand: rules first (also the fallback), the model when there is a key ──
const has = (t, ws) => ws.some((w) => t.includes(norm(w)));
const ASKING = ['شكد', 'بيش', 'بكم', 'اكو', 'شنو', 'متى', 'هل ', 'وين'];
const BUY = ['اريد', 'ابي', 'ابغى', 'اطلب', 'جيبلي', 'دزلي', 'احتاج', 'اشتري', 'حضرلي', 'جهزلي', 'سله', 'ضيف', 'زيد', 'انطيني', 'خليلي', 'اخذ'];
const clampQty = (q) => Math.max(1, Math.min(MAX_QTY, Math.round(+q || 1)));

export function custOffline(text) {
  const t = ' ' + normalizeIraqi(stripVocative(text)) + ' ';
  const items = itemsIn(t);
  const asking = /[؟?]/.test(text) || has(t, ASKING);
  if (has(t, ['ربح المحل', 'ارباح', 'ربحه', 'شكد يربح', 'كم يربح', 'ديون الناس', 'منو مطلوب', 'الزباين', 'الزبائن', 'دفتر المحل', 'حسابات المحل'])) return { refuse: true, reason: 'private' };
  if (has(t, ['نفس الطلبيه', 'نفس طلبيتي', 'نفس المره', 'نفس الاغراض', 'مثل المره الماضيه', 'مثل كل مره', 'نفس اللي اخذته', 'نفس اخر طلب'])) return { intent: 'reorder' };
  if (has(t, ['ادفع', 'اسدد', 'سدد', 'اصفي', 'صفي', 'اسد ديني', 'سد ديني', 'اخلص ديني']) && !has(t, ['شكد دفعت', 'شكد سددت', 'متى دفعت', 'متى سددت', 'اخر دفعه'])) {
    const all = has(t, ['كله', 'كلها', 'كامل', 'الكل', 'كل الدين', 'كل ديني', 'صفي', 'اصفي']);
    const half = has(t, ['نصه', 'نص الدين', 'نص ديني']);
    let amount = all || half ? null : parseAmount(t) ?? numberRuns(t).find((r) => r.value >= 1)?.value ?? null;
    if (amount != null && amount < 250) amount *= 1000; // Iraqis drop «الف»: «ادفع عشرين» = 20,000
    return { intent: 'pay', amount, all: all || (!amount && !half), half };
  }
  if (has(t, ['اخر شي اشتريت', 'شنو اشتريت', 'شكد اشتريت', 'شكد صرفت', 'مشترياتي', 'شكد دفعت', 'متى دفعت', 'متى سددت', 'شكد سددت', 'اخر دفعه', 'شنو اخذت'])) return { intent: 'history' };
  if (has(t, ['بذمتي', 'شكد علي', 'مطلوب مني', 'تطلبوني', 'يطلبني', 'حسابي', 'ديني', 'ديوني'])) return { intent: 'balance' };
  if (items.length && has(t, ['بيش', 'بكم', 'سعر', 'شكد حق', 'شكد ثمن', 'شكد يسوى', 'شكد صار'])) return { intent: 'price', items: items.map(({ sku }) => ({ sku })) };
  if (items.length && asking && has(t, ['اكو', 'موجود', 'عندكم', 'عندك', 'متوفر', 'خالص', 'خلص', 'باقي'])) return { intent: 'stock', items: items.map(({ sku }) => ({ sku })) };
  if (items.length && (!asking || has(t, BUY))) return { intent: 'buy', items: items.map((i) => ({ sku: i.sku, qty: clampQty(i.qty), guessed: i.qtyGuessed })) };
  if (has(t, BUY)) return { intent: 'buy', items: [] };
  if (items.length) return { intent: 'price', items: items.map(({ sku }) => ({ sku })) }; // «السكر؟»
  if (has(t, ['دين', 'الدين'])) return { intent: 'balance' };
  if (has(t, ['هلا', 'مرحبا', 'السلام', 'شتكدر', 'شنو تكدر', 'شتسوي', 'ساعدني', 'مساعده'])) return { intent: 'help' };
  return { intent: 'unknown' };
}

export function validIntent(j) {
  if (!j || typeof j !== 'object') return false;
  if (j.refuse) return ['private', 'unknown_product', 'offtopic'].includes(j.reason);
  if (!CUST_INTENTS.includes(j.intent)) return false;
  const items = j.items ?? [];
  if (!Array.isArray(items) || items.some((i) => !productBySku(i?.sku))) return false;
  if (j.intent === 'buy' && items.some((i) => !Number.isInteger(+i.qty) || +i.qty < 1 || +i.qty > MAX_QTY)) return false;
  if ((j.intent === 'price' || j.intent === 'stock') && !items.length) return false;
  if (j.amount != null && !(+j.amount >= 250 && +j.amount <= 100000000)) return false;
  return true;
}
const tidy = (j) => j.refuse ? { refuse: true, reason: j.reason, name: j.name }
  : { intent: j.intent, items: (j.items || []).map((i) => ({ sku: i.sku, qty: clampQty(i.qty) })), amount: j.amount != null ? +j.amount : null, all: !!j.all || (j.intent === 'pay' && j.amount == null) };

export async function custRoute(text, { useLLM = true } = {}) {
  const off = custOffline(text);
  if (useLLM && llmStatus().ok) {
    const sent = mask(text);
    try {
      const { text: out, ms } = await callLLM({ system: ROUTER, messages: [{ role: 'user', content: sent }], json: true, maxTokens: 220, timeoutMs: 20000 });
      const j = extractJSON(out);
      if (validIntent(j)) return { intent: tidy(j), source: 'gemini', ms, sent, offline: off };
      return { intent: off, source: 'offline', fallback: 'رد النموذج ما اجتاز التحقق', raw: out, sent, offline: off };
    } catch (e) { return { intent: off, source: 'offline', fallback: friendlyErr(e), sent, offline: off }; }
  }
  return { intent: off, source: 'offline', offline: off };
}

// ── 2. compute: everything with a number in it is computed here, from the shop's lists ──
export function stockWord(L, sku) {
  const n = L.stockOf(sku);
  return n <= 0 ? 'خالص هسه' : n < 5 ? 'باقي شوية' : 'موجود';
}
// a cart from requested items: price from the shop's list, quantity capped by what is on the shelf
export function makeCart(L, cid, items) {
  const lines = [], notes = [];
  for (const it of items) {
    const p = productBySku(it.sku); if (!p) continue;
    const have = Math.max(0, L.stockOf(p.sku)), want = clampQty(it.qty);
    if (!have) { notes.push(`${p.name} خالص هسه بالمحل، فما ضفته.`); continue; }
    const qty = Math.min(want, have);
    if (qty < want) notes.push(`${p.name}: باقي ${have} بس، فخليت ${have}.`);
    lines.push({ sku: p.sku, qty, price: p.sell, max: Math.min(MAX_QTY, have), guessed: !!it.guessed });
  }
  return cartTotals(L, cid, { lines, notes });
}
// recomputed on every change and again before sending: the total never comes from the model or the page
export function cartTotals(L, cid, cart) {
  const lines = cart.lines.filter((l) => l.qty > 0 && productBySku(l.sku)).map((l) => ({ ...l, price: productBySku(l.sku).sell }));
  const total = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const owed = L.debtBook()[cid].balance;
  return { ...cart, lines, total, owed, credit: owed + total <= L.creditLimit(cid) };
}
const itemsText = (lines) => lines.map((l) => `${l.qty} ${productBySku(l.sku).name}`).join('، ');

// the customer's own last purchase: their last order from the wallet, else their last purchase on credit
export function lastItems(L, cid, orders = []) {
  const o = orders.filter((x) => x.cid === cid && x.status !== 'rejected').at(-1);
  if (o) return o.lines.map(({ sku, qty }) => ({ sku, qty }));
  const t = L.tx.filter((x) => x.type === 'credit_sale' && x.customer === cid && x.items?.length).at(-1);
  return t ? t.items.map(({ sku, qty }) => ({ sku, qty })) : [];
}

export function custReply(L, cid, it, { orders = [] } = {}) {
  const b = L.debtBook()[cid];
  if (it.refuse) {
    if (it.reason === 'private') return { kind: 'text', text: 'هاي معلومات تخص المحل أو زباين غيرك، وأني ما أشوفها أصلاً. أگدر أساعدك بطلباتك وديونك إنت.', guard: 'private' };
    if (it.reason === 'unknown_product') return { kind: 'text', text: `${SHOP.name} ما يبيع «${it.name || 'هاي المادة'}». الموجود: ${PRODUCTS.map((p) => p.name).join('، ')}.` };
    return { kind: 'text', text: `أني وكيلك ويا ${SHOP.name} بس: أجهزلك سلة، أدفع دينك، أو أگلك سعر مادة.` };
  }
  switch (it.intent) {
    case 'buy': case 'reorder': {
      const items = it.intent === 'reorder' ? lastItems(L, cid, orders) : it.items;
      if (!items.length) return { kind: 'text', text: it.intent === 'reorder' ? 'ما لگيت طلبية قبل باسمك. گلّي شنو تحتاج وأجهزلك السلة.' : `شنو تحتاج من ${SHOP.name}؟ الموجود: ${PRODUCTS.map((p) => p.name).join('، ')}.` };
      const cart = makeCart(L, cid, items);
      if (!cart.lines.length) return { kind: 'text', text: cart.notes.join(' ') || 'ما گدرت أجهز السلة.' };
      return { kind: 'cart', cart, text: it.intent === 'reorder' ? 'جهزتلك نفس طلبيتك الماضية. عدّل الكميات إذا تحتاج:' : 'جهزتلك السلة. عدّل الكميات إذا تحتاج، واختار شلون تدفع:' };
    }
    case 'pay': {
      if (b.balance <= 0) return { kind: 'text', text: `ما بذمتك شي لـ${SHOP.name} ✓` };
      const want = it.all ? b.balance : it.half ? r250(b.balance / 2) : it.amount;
      const amount = Math.min(want || b.balance, b.balance);
      const note = want > b.balance ? `بذمتك ${fmt(b.balance)} بس، فجهزت ${fmt(b.balance)}.` : '';
      return { kind: 'pay', pay: { amount, owed: b.balance, note }, text: `جهزتلك دفعة لـ${SHOP.name}. تتطابق ويا دينك وحدها:` };
    }
    case 'balance':
      if (b.balance <= 0) return { kind: 'text', text: `ما بذمتك شي لـ${SHOP.name} ✓` };
      return { kind: 'text', text: `بذمتك ${fmt(b.balance)} د.ع لـ${SHOP.name}، من ${b.open.length === 1 ? 'دين واحد' : `${b.open.length} ديون`}، أقدمها من ${dateAr(b.open[0].date)}.`, actions: [{ k: 'pay', label: `ادفع ${fmt(b.balance)}` }] };
    case 'history': {
      const buys = L.tx.filter((t) => t.type === 'credit_sale' && t.customer === cid).slice(-3).reverse();
      const pay = L.tx.filter((t) => t.type === 'payment_in' && t.customer === cid).at(-1);
      if (!buys.length && !pay) return { kind: 'text', text: 'ما عندك مشتريات أو دفعات مسجلة بالمحل.' };
      return { kind: 'text', text: [buys.length ? `آخر مشترياتك بالدين: ${buys.map((t) => `${dateAr(t.date)}: ${itemsText(t.items || [])} (${fmt(t.amount)})`).join('؛ ')}.` : '', pay ? `وآخر دفعة ${fmt(pay.amount)} د.ع بـ${dateAr(pay.date)}.` : ''].filter(Boolean).join(' ') };
    }
    case 'price':
      return { kind: 'text', text: it.items.map((i) => { const p = productBySku(i.sku); return `${p.name}: ${fmt(p.sell)} د.ع`; }).join('، ') + '.', actions: [{ k: 'cart', label: 'ضيفها للسلة', items: it.items.map((i) => ({ sku: i.sku, qty: 1 })) }] };
    case 'stock':
      return { kind: 'text', text: it.items.map((i) => `${productBySku(i.sku).name}: ${stockWord(L, i.sku)}`).join('، ') + '.', actions: it.items.some((i) => L.stockOf(i.sku) > 0) ? [{ k: 'cart', label: 'اطلبها', items: it.items.filter((i) => L.stockOf(i.sku) > 0).map((i) => ({ sku: i.sku, qty: 1 })) }] : [] };
    case 'help':
      return { kind: 'text', text: `هلا بيك. أگدر أجهزلك سلة من ${SHOP.name} («اريد 2 كيلو سكر وببسي»)، أدفع دينك كله أو جزء منه، أگلك شكد بذمتك، أو سعر مادة وإذا موجودة. ما يروح شي إلا لما إنت توافق.` };
    default:
      return { kind: 'text', text: 'ما فهمت طلبك زين. جرّب: «اريد 2 كيلو سكر وببسي»، «شكد بذمتي؟»، أو «ادفع ديني».' };
  }
}

// ── 3. the whole turn, with a trace for the «خطوات الوكيل» panel ──
// another customer named in full («أبو علي»، «علاوي»); the short form is not enough, «شكد علي؟» means «how much do I owe?»
export const otherCustomer = (text, cid) => { const n = ' ' + norm(text) + ' '; return CUSTOMERS.find((c) => c.id !== cid && [c.name, c.full].some((x) => x && n.includes(norm(x)))) || null; };
export async function custAsk(L, cid, text, { useLLM = true, orders = [] } = {}) {
  const t0 = Date.now();
  // before any model call: another customer's name means someone else's data
  const other = otherCustomer(text, cid);
  if (other) {
    const it = { refuse: true, reason: 'private' };
    return { q: text, ms: Date.now() - t0, intent: it, source: 'offline', reply: custReply(L, cid, it),
      trace: [{ step: 'وكيل الزبون', kind: 'guard', note: `ذكر زبون ثاني (${other.name})، فانمنع قبل ما يوصل شي للنموذج` }] };
  }
  const r = await custRoute(text, { useLLM });
  const reply = custReply(L, cid, r.intent, { orders });
  const done = reply.kind === 'cart' ? `سلة: ${itemsText(reply.cart.lines)} = ${fmt(reply.cart.total)} د.ع (الأسعار من قائمة المحل)` : reply.kind === 'pay' ? `دفعة ${fmt(reply.pay.amount)} من دين ${fmt(reply.pay.owed)}` : 'جواب ثابت من بيانات الزبون';
  return { q: text, ms: Date.now() - t0, ...r, reply,
    trace: [{ step: 'وكيل الزبون', kind: 'understand', source: r.source, fallback: r.fallback, sent: r.sent, intent: r.intent },
      { step: 'وكيل الزبون', kind: 'compute', note: done + (reply.kind === 'cart' || reply.kind === 'pay' ? ' · ينتظر موافقة الزبون' : '') }] };
}
