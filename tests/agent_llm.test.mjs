// Gemini path with a mocked model: routing validation, answer number check, entry grounding, fallbacks.
// node tests/agent_llm.test.mjs
import assert from 'node:assert/strict';
import { generate, fmt } from '../public/js/data.js';
import { Ledger } from '../public/js/ledger.js';
import { ask, parseEntry, draftReminder } from '../public/js/agent.js';
import { health } from '../public/js/llm.js';

let replies = [];
globalThis.fetch = async (url) => {
  if (url === '/api/health') return { json: async () => ({ llm: true, model: 'mock' }) };
  if (url === '/api/llm') { const text = replies.shift(); return { ok: true, json: async () => ({ text, model: 'mock' }) }; }
  return { ok: true, json: async () => ({}) };
};
globalThis.localStorage = { getItem: () => '', setItem() {}, removeItem() {} };
await health(true);
const L = new Ledger(generate());
const today = L.sales({ period: 'today' }).figures[0].value;

// 1) good route + good answer → accepted
replies = ['{"tool":"sales","args":{"period":"today","channel":"all"}}', JSON.stringify({ answer: `اليوم بعت بـ ${fmt(today)} دينار.` })];
let r = await ask(L, 'شگد صار البيع لحد هسه؟');
assert.equal(r.routeSource, 'gemini'); assert.equal(r.answerSource, 'gemini'); assert.equal(r.main.value, today);
console.log('ok 1 · gemini route + answer accepted:', r.answer);

// 2) answer with an invented number → rejected, template used
replies = ['{"tool":"sales","args":{"period":"today"}}', '{"answer":"اليوم بعت بـ 999,999 دينار، تقريباً ضعف البارحة."}'];
r = await ask(L, 'شكد بعت اليوم؟');
assert.equal(r.answerSource, 'template'); assert.ok(r.trace.some((t) => t.problems?.length));
console.log('ok 2 · invented number rejected →', r.trace.find((t) => t.problems)?.problems.join('; '));

// 3) invalid route (unknown customer name) → offline parser takes over
replies = ['{"tool":"customer","args":{"name":"أبو كرار"}}', '{"answer":"x"}'];
r = await ask(L, 'شكد مطلوب من أبو علي؟');
assert.equal(r.routeSource, 'offline'); assert.equal(r.route.tool, 'customer'); assert.equal(r.answerSource, 'template');
console.log('ok 3 · invalid gemini route → offline parser:', r.answer);

// 4) garbage → offline
replies = ['sorry', 'sorry'];
r = await ask(L, 'منو بعده مطلوب إلي؟');
assert.equal(r.routeSource, 'offline'); assert.equal(r.answerSource, 'template');
console.log('ok 4 · non-JSON → offline + template');

// 5) entry: model invents a price → ignored, list price used
replies = ['{"type":"credit_sale","customer":"أبو حسين","items":[{"sku":"pepsi","qty":3}],"amount":50000,"channel":"credit"}'];
const e = await parseEntry('بعت 3 كراتين ببسي لأبو حسين بالدين');
assert.equal(e.source, 'gemini'); assert.equal(e.amount, 27000); assert.equal(e.customer, 'C1');
console.log('ok 5 · entry grounded: amount from price list', e.amount, '(model said 50000)');

// 6) reminder with wrong amount → template
replies = ['{"text":"هلا أبو علي، بذمتك 10,000 دينار."}'];
const rem = await draftReminder(L, 'C3');
assert.equal(rem.source, 'template');
console.log('ok 6 · reminder with wrong amount rejected → template');
console.log('all passed');
