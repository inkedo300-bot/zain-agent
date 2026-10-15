// node eval/run_agent_eval.mjs   (needs the server running with a model key: PORT=8080 node server.js)
// The agent on open questions, with the model. Results → eval/results_agent.json
import { generate } from '../public/js/data.js';
import { Ledger } from '../public/js/ledger.js';
import { evalAgent } from '../public/js/eval.js';
import { agentAsk } from '../public/js/agentloop.js';
import { health } from '../public/js/llm.js';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:8080';
const realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => realFetch(typeof u === 'string' && u.startsWith('/') ? BASE + u : u, o);
globalThis.localStorage = { getItem: () => '', setItem() {}, removeItem() {} };
const st = await health(true);
if (!st.ok) { console.error('No model key on the server.'); process.exit(1); }
const L = new Ledger(generate());
const r = await evalAgent(L, { useLLM: true, agentAsk, pauseMs: +process.env.PAUSE || 4000 });
console.log(`agent: ${r.ok}/${r.n} right (tools + every key number) · answered by the agent ${r.byAgent}/${r.n}, the rest by the fixed workflow`);
for (const x of r.rows) console.log(x.ok ? '  ✓' : '  ✗', x.q, '|', x.source, x.steps + ' tools:', x.tools.join(','), '|', x.ms + 'ms', x.okNums ? '' : '| numbers missing');
writeFileSync(new URL('./results_agent.json', import.meta.url), JSON.stringify({ model: st.model, at: new Date().toISOString(), ...r }, null, 2));
