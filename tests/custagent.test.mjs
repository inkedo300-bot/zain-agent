// The customer's agent, with a mocked model (no API key needed).
// node tests/custagent.test.mjs
//  1. understanding without a model: buy, pay, balance, price, stock, reorder
//  2. every price and total comes from the shop's list, never from the model
//  3. the cart respects the shelf and the credit limit
//  4. privacy: another customer or the shop's books are refused before any model call,
//     and no name or phone number reaches the model
//  5. a bad answer from the model falls back to the rules
import assert from 'node:assert/strict';
import { generate, productBySku, CUSTOMERS } from '../public/js/data.js';
import { Ledger } from '../public/js/ledger.js';
import { custOffline, custAsk, makeCart, cartTotals, validIntent, otherCustomer, MAX_QTY } from '../public/js/custagent.js';
import { leaks } from '../public/js/privacy.js';
import { health } from '../public/js/llm.js';

let replies = [];
const sent = [];
globalThis.fetch = async (url, opts) => {
  if (url === '/api/health') return { json: async () => ({ llm: true, model: 'mock' }) };
  if (url === '/api/llm') { sent.push(opts.body); const text = replies.length ? replies.shift() : '{}'; return { ok: true, json: async () => ({ text, model: 'mock' }) }; }
  return { ok: true, json: async () => ({}) };
};
globalThis.localStorage = { getItem: () => '', setItem() {}, removeItem() {} };
await health(true);
const L = new Ledger(generate());
const C = 'C2'; // أم زينب
let fail = 0;
const check = async (name, fn) => { try { await fn(); console.log('ok ·', name); } catch (e) { fail++; console.log('FAIL ·', name, '—', e.message); } };
const items = (it) => (it.items || []).map((i) => `${i.sku}:${i.qty ?? ''}`).join(',');

// ── 1. understanding without a model ──
const cases = [
  ['اريد 2 كيلو سكر وكارتون ببسي', 'buy', 'sugar:2,pepsi:1'],
  ['جيبلي طبقتين بيض و 3 كيلو تمن', 'buy', 'rice:3,eggs:2'],
  ['ابي كارتونين ماي', 'buy', 'water:2'],
  ['شكد بذمتي؟', 'balance'],
  ['شكد علي؟', 'balance'],
  ['ادفع ديني', 'pay'],
  ['ادفع عشرين', 'pay'],
  ['سدد نص ديني', 'pay'],
  ['نفس طلبيتي الماضية', 'reorder'],
  ['بيش الزيت؟', 'price', 'oil:'],
  ['اكو بيض؟', 'stock', 'eggs:'],
  ['شنو اشتريت آخر مرة؟', 'history'],
  ['هلا', 'help'],
];
for (const [q, intent, its] of cases) await check(`understands «${q}» → ${intent}`, () => {
  const r = custOffline(q);
  assert.equal(r.intent, intent);
  if (its) assert.equal(items(r), its);
});
await check('«ادفع عشرين» means 20,000 (Iraqis drop «الف»)', () => assert.equal(custOffline('ادفع عشرين').amount, 20000));
await check('«ادفع ديني» pays it all, «سدد نص ديني» half', () => { assert.ok(custOffline('ادفع ديني').all); assert.ok(custOffline('سدد نص ديني').half); });

// ── 2. numbers come from the shop's list ──
await check('cart prices and total from the price list, even when the model sends a price', async () => {
  replies = ['{"intent":"buy","items":[{"sku":"sugar","qty":2,"price":1},{"sku":"pepsi","qty":1}],"amount":null,"all":false,"total":5}'];
  const r = await custAsk(L, C, 'اريد 2 كيلو سكر وكارتون ببسي');
  assert.equal(r.source, 'gemini');
  assert.equal(r.reply.kind, 'cart');
  for (const l of r.reply.cart.lines) assert.equal(l.price, productBySku(l.sku).sell);
  assert.equal(r.reply.cart.total, 2 * productBySku('sugar').sell + productBySku('pepsi').sell);
});
await check('a total changed on the page is recomputed before sending', () => {
  const cart = makeCart(L, C, [{ sku: 'oil', qty: 2 }]);
  const tampered = { ...cart, total: 1, lines: cart.lines.map((l) => ({ ...l, price: 1 })) };
  const fixed = cartTotals(L, C, tampered);
  assert.equal(fixed.total, 2 * productBySku('oil').sell);
});
await check('a payment never exceeds what the customer owes', async () => {
  const owed = L.debtBook()[C].balance;
  replies = ['{"intent":"pay","items":[],"amount":5000000,"all":false}'];
  const r = await custAsk(L, C, 'ادفع خمس ملايين');
  assert.equal(r.reply.kind, 'pay');
  assert.equal(r.reply.pay.amount, owed);
});

// ── 3. shelf and credit limit ──
await check('quantity is capped by what is on the shelf, with a note', () => {
  const have = L.stockOf('tea');
  const cart = makeCart(L, C, [{ sku: 'tea', qty: have + 5 }]);
  if (have > 0) { assert.equal(cart.lines[0].qty, Math.min(have, MAX_QTY)); if (have + 5 <= MAX_QTY) assert.ok(cart.notes.length); }
  else assert.equal(cart.lines.length, 0);
});
await check('«عالدفتر» only within the credit limit', () => {
  const big = makeCart(L, C, [{ sku: 'pepsi', qty: MAX_QTY }]);
  const owed = L.debtBook()[C].balance, limit = L.creditLimit(C);
  assert.equal(big.credit, owed + big.total <= limit);
  const small = makeCart(L, C, [{ sku: 'flour', qty: 1 }]);
  assert.equal(small.credit, owed + small.total <= limit);
});

// ── 4. privacy ──
await check('another customer is refused before any model call', async () => {
  sent.length = 0;
  const r = await custAsk(L, C, 'شكد على أبو علي؟');
  assert.equal(r.reply.guard, 'private');
  assert.equal(sent.length, 0);
});
await check('«شكد علي؟» is the customer asking about themself, not «أبو علي»', () => assert.equal(otherCustomer('شكد علي؟', C), null));
await check("the shop's profit and other people's debts are refused", () => {
  for (const q of ['شكد ربح المحل هالشهر؟', 'منو مطلوب لأبو مصطفى؟']) assert.equal(custOffline(q).reason, 'private');
});
await check('no customer name or phone number reaches the model', async () => {
  sent.length = 0;
  replies = ['{"intent":"buy","items":[{"sku":"rice","qty":1}],"amount":null,"all":false}'];
  await custAsk(L, C, `اني ${CUSTOMERS[1].name}، اريد كيلو تمن ورقمي 07701234567`);
  for (const b of sent) { assert.deepEqual(leaks(b), [], 'leaked: ' + leaks(b).join(',')); assert.ok(!/07\d{9}/.test(b), 'phone leaked'); }
  assert.equal(sent.length, 1);
});

// ── 5. a bad model answer falls back to the rules ──
await check('unknown item or tool from the model → the rules answer', async () => {
  replies = ['{"intent":"transfer","items":[{"sku":"gold","qty":1}],"amount":100000}'];
  const r = await custAsk(L, C, 'اريد 2 كيلو سكر');
  assert.equal(r.source, 'offline');
  assert.equal(r.reply.kind, 'cart');
  assert.equal(r.reply.cart.lines[0].sku, 'sugar');
});
await check('the intent check rejects bad shapes', () => {
  assert.equal(validIntent({ intent: 'buy', items: [{ sku: 'sugar', qty: 0 }] }), false);
  assert.equal(validIntent({ intent: 'buy', items: [{ sku: 'sugar', qty: 999 }] }), false);
  assert.equal(validIntent({ intent: 'pay', amount: 10 }), false);
  assert.equal(validIntent({ refuse: true, reason: 'private' }), true);
  assert.equal(validIntent({ intent: 'stock', items: [] }), false);
});

if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall passed');
