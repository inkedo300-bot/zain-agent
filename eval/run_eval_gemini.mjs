// node eval/run_eval_gemini.mjs   (needs the server running with a Gemini key: PORT=8080 node server.js)
import { generate, fmt } from '../public/js/data.js';
import { Ledger } from '../public/js/ledger.js';
import { evalLLM } from '../public/js/eval.js';
import { health } from '../public/js/llm.js';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:8080';
const realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => realFetch(typeof u === 'string' && u.startsWith('/') ? BASE + u : u, o);
globalThis.localStorage = { getItem: () => '', setItem() {}, removeItem() {} };
const st = await health(true);
if (!st.ok) { console.error('No Gemini key on the server.'); process.exit(1); }
const L = new Ledger(generate());
const t0 = Date.now();
const r = await evalLLM(L, { pauseMs: +process.env.PAUSE || 6000, onProgress: (i, n) => { if (i % 10 === 0) console.log(i + '/' + n); } });
console.log(`\nmodel ${st.model} · ${Math.round((Date.now() - t0) / 1000)}s`);
const pct = (o) => `${o.ok}/${o.n} (${Math.round((o.ok / o.n) * 100)}%)`;
console.log('dev questions', pct(r.qa)); console.log('HELD-OUT', pct(r.held)); console.log('paraphrases', pct(r.para)); console.log('refusals', pct(r.refuse));
console.log('routed by Gemini', r.geminiRouted, '/', r.rows.length, '· phrased by Gemini', r.geminiWritten);
for (const x of r.rows.filter((x) => !x.ok)) console.log('  ✗', x.kind, x.q, '→', x.routeSource, x.answerSource, x.fallback ? '[' + x.fallback.slice(0, 60) + ']' : '', '|', x.answer.slice(0, 110));
writeFileSync(new URL('./results_gemini.json', import.meta.url), JSON.stringify({ model: st.model, ...r, rows: r.rows.map(({ q, kind, ok, routeSource, answerSource, answer }) => ({ q, kind, ok, routeSource, answerSource, answer })) }, null, 2));
