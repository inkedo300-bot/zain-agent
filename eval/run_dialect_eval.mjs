// node eval/run_dialect_eval.mjs → heavy Iraqi dialect, offline rules only (no API key)
import { generate } from '../public/js/data.js';
import { Ledger } from '../public/js/ledger.js';
import { evalDialect } from '../public/js/eval.js';
const d = evalDialect(new Ledger(generate()));
const pct = (a, b) => `${a}/${b} (${Math.round((a / b) * 100)}%)`;
console.log('Dialect questions:', pct(d.q.ok, d.q.n));
d.q.rows.filter((r) => !r.ok).forEach((r) => console.log('   ✗', r.q, '→', r.gotTool, r.got, 'truth', r.truth));
console.log('Dialect entries:', pct(d.e.ok, d.e.n));
d.e.rows.filter((r) => !r.ok).forEach((r) => console.log('   ✗', r.t, JSON.stringify(r.fields)));
