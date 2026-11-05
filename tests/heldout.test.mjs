// The held-out questions are frozen: if a question or its expected tool changes, this fails.
// They are run, never tuned on. node tests/heldout.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { generate } from '../public/js/data.js';
import { Ledger } from '../public/js/ledger.js';
import { questionSet } from '../public/js/eval.js';

const frozen = JSON.parse(readFileSync(new URL('../eval/heldout.sha256', import.meta.url), 'utf8'));
const qs = questionSet(new Ledger(generate()));
const hash = (rows) => createHash('sha256').update(JSON.stringify(rows.map((x) => [x.q, x.tool]))).digest('hex');
let fail = 0;
for (const k of ['held', 'mixedHeld']) {
  try { assert.equal(hash(qs[k]), frozen[k]); console.log(`ok · ${k}: ${qs[k].length} questions unchanged since ${frozen.frozen}`); }
  catch { fail++; console.log(`FAIL · ${k} changed after it was frozen`); }
}
if (fail) { console.log(`\n${fail} failed`); process.exit(1); }
console.log('\nall passed');
