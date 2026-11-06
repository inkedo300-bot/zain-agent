// The owner's first live test (6/11/2026), turned into checks: each sentence here once went wrong in the real app.
// node tests/livetest.test.mjs   (the model is mocked; what matters is what the app does with its answer)
import assert from 'node:assert/strict';
import { generate } from '../public/js/data.js';
import { Ledger } from '../public/js/ledger.js';
import { ask, route, cleanTranscript } from '../public/js/agent.js';
import { detectAction, routeOffline, splitQuestions } from '../public/js/nlu.js';
import { health } from '../public/js/llm.js';

let replies = [], sentToModel = [];
globalThis.fetch = async (url, opts) => {
  if (url === '/api/health') return { json: async () => ({ llm: true, model: 'mock' }) };
  if (url === '/api/llm') { sentToModel.push(JSON.parse(opts.body)); const text = replies.shift(); return { ok: true, json: async () => ({ text, model: 'mock' }) }; }
  return { ok: true, json: async () => ({}) };
};
globalThis.localStorage = { getItem: () => '', setItem() {}, removeItem() {} };
await health(true);
const L = new Ledger(generate());
let n = 0;
const ok = (name) => console.log(`ok ${++n} · ${name}`);

// 1) «شكد اطلب أم زينب» asks what she owes (اطلب = I am owed); it used to start a supplier order
assert.equal(detectAction('شكد اطلب ام زينب'), null);
let r = await ask(L, 'شكد اطلب ام زينب', { useLLM: false });
assert.equal(r.route.tool, 'customer'); assert.equal(r.route.args.name, 'أم زينب');
ok('«شكد اطلب أم زينب» is a debt question, not an order');

// 2) «ذكّرها» right after: she is the one meant; it used to ask «ذكّر منو؟»
let r2 = await ask(L, 'ذكرها', { useLLM: false, ctx: r.ctx });
assert.equal(r2.action.tool, 'remind'); assert.equal(r2.action.args.name, 'أم زينب'); assert.ok(r2.action.fromContext);
ok('«ذكّرها» reminds the customer just asked about');

// 3) without anything said before, «ذكّرها» still asks who (no guessing)
r2 = await ask(L, 'ذكرها', { useLLM: false });
assert.equal(r2.action.args.name, null);
ok('«ذكّرها» with no earlier customer still asks who');

// 4) «شكد بالمخزن» is a stock question; a refusal from the model no longer wins over the fixed rules
assert.equal(routeOffline('شكد بالمخزن').tool, 'inventory');
replies = ['{"refuse":true,"reason":"offtopic"}'];
const rt = await route('شكد بالمخزن');
assert.equal(rt.route.tool, 'inventory'); assert.equal(rt.source, 'offline'); assert.match(rt.fallback, /رفض/);
ok('stock question refused by the model → answered from the stock tool');

// 5) …but a real off-topic refusal still holds
replies = ['{"refuse":true,"reason":"offtopic"}'];
r = await ask(L, 'منو فاز بالمباراة البارحة؟');
assert.equal(r.route.refuse, true);
ok('an off-topic question is still refused');

// 6) «اطلب على أي حال» is a forced order, and the supplier just discussed is kept
assert.deepEqual(detectAction('اطلب على اي حال'), { tool: 'order', args: { supplier: null, force: true } });
r = await ask(L, 'اطلب على اي حال', { useLLM: false, ctx: { supplier: 'S1' } });
assert.deepEqual(r.action.args, { supplier: 'S1', force: true }); assert.ok(r.action.fromContext);
ok('«اطلب على أي حال» orders from the supplier just discussed, even with enough stock');

// 7) items said with a number go on the order as said, and pick their supplier
assert.deepEqual(detectAction('اطلب 20 كيلو سكر'), { tool: 'order', args: { supplier: 'S1', items: [{ sku: 'sugar', qty: 20 }] } });
assert.deepEqual(detectAction('اطلب من الرافدين'), { tool: 'order', args: { supplier: 'S1' } });
ok('«اطلب 20 كيلو سكر» → an order for 20 sugar from its supplier');

// 8) short follow-ups keep the subject of the last question
r = await ask(L, 'شكد بعت اليوم؟', { useLLM: false });
r2 = await ask(L, 'والبارحة؟', { useLLM: false, ctx: r.ctx });
assert.equal(r2.route.tool, 'sales'); assert.equal(r2.route.args.period, 'yesterday');
r = await ask(L, 'شكد باقي بالمخزن؟', { useLLM: false });
r2 = await ask(L, 'والسكر؟', { useLLM: false, ctx: r.ctx });
assert.equal(r2.route.tool, 'inventory'); assert.equal(r2.route.args.sku, 'sugar');
ok('«والبارحة؟» and «والسكر؟» are understood as follow-ups');

// 9) the model is told what was asked before (names stay masked)
sentToModel = []; replies = ['{"tool":"sales","args":{"period":"yesterday","channel":"all"}}', '{"answer":"x"}'];
await ask(L, 'والبارحة؟', { ctx: { q: 'شكد بعت لأم زينب اليوم؟', tool: 'sales', args: { period: 'today' } } });
const msg = sentToModel[0].messages[0].content;
assert.match(msg, /السؤال السابق/); assert.ok(!msg.includes('زينب'), 'customer name must be masked');
ok('the router sees the previous question, with names masked');

// 10) speech: dialect words written in standard Arabic or another dialect come back in Iraqi spelling
assert.equal(cleanTranscript('اش قد بعت اليوم، أنا جاي أحكي باللهجة، وأريد أن أشوف الفرق'), 'شكد بعت اليوم، أنا جاي أحچي باللهجة، وأريد أشوف الفرق');
assert.equal(cleanTranscript('لماذا نزل ربحي؟'), 'ليش نزل ربحي؟');
assert.equal(cleanTranscript('إش قد عندي الآن'), 'شكد عندي هسه');
assert.equal(cleanTranscript('شكد بعت اليوم؟'), 'شكد بعت اليوم؟');
ok('transcripts keep the Iraqi spelling («شكد»، «أحچي»، «ليش»، «هسه»)');

// 11) several questions in one breath come back from speech joined by commas; greetings are not questions
const heard = cleanTranscript('السلام عليكم حبيبي، شلونك، شخبارك، اش قد بعت اليوم، أم زينب، وليش نزل ربحي، وشلون أدبر الإيجار هذا الشهر؟ أنا حالياً جاي أحكي باللهجة العراقية، وأريد أن أشوف الفرق بين صوتي والنتيجة');
assert.deepEqual(splitQuestions(heard), ['شكد بعت اليوم، أم زينب؟', 'ليش نزل ربحي؟', 'شلون أدبر الإيجار هذا الشهر؟']);
assert.deepEqual(splitQuestions('شكد بعت اليوم؟'), ['شكد بعت اليوم؟']);
assert.deepEqual(splitQuestions('بعت 3 كراتين ببسي لأبو حسين، بالدين'), ['بعت 3 كراتين ببسي لأبو حسين، بالدين']);
ok('the long spoken test sentence → its three questions, greetings left out');

console.log('all passed');
