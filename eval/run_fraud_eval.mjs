// Transfer safety check — evaluation on synthetic labelled transfers.
// node eval/run_fraud_eval.mjs
// dev (seed 11) was used to tune; held (seed 22) was not looked at while tuning.
// The label comes from the scenario that generated the case, not from the scorer.
// Honest limit: we wrote both the scenarios and the rules, so this shows the rules
// behave as designed. Real accuracy needs labelled reports from the wallet itself.
import { writeFileSync } from 'node:fs';
import { checkTransfer } from '../public/js/fraud.js';
import { generateTransfers } from '../public/js/fraud_data.js';

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
function run(name, seed) {
  const set = generateTransfers(seed, 400);
  const res = set.map((t) => ({ t, r: checkTransfer(t) }));
  const scams = res.filter((x) => x.t.scam), normal = res.filter((x) => !x.t.scam);
  const any = (x) => x.r.level !== 'none';
  const kinds = {};
  for (const x of res) { const k = (kinds[x.t.kind] ??= { scam: x.t.scam, n: 0, full: 0, light: 0 }); k.n++; if (x.r.level === 'high') k.full++; else if (x.r.level === 'medium') k.light++; }
  // fairness 1: flip the sender's age band on every case → nothing may change
  let changed = 0;
  for (const { t, r } of res) for (const ageBand of ['18-29', '30-59', '60+']) {
    const r2 = checkTransfer({ ...t, sender: { ...t.sender, ageBand } });
    if (r2.score !== r.score || r2.level !== r.level) changed++;
  }
  // fairness 2: warning rate on honest transfers, by age band
  const byAge = {};
  for (const x of normal) { const b = (byAge[x.t.sender.ageBand] ??= { n: 0, warned: 0 }); b.n++; if (any(x)) b.warned++; }
  const out = {
    set: name, seed, n: set.length, scams: scams.length, normal: normal.length,
    caught_any: scams.filter(any).length, caught_full: scams.filter((x) => x.r.level === 'high').length,
    normal_full: normal.filter((x) => x.r.level === 'high').length, normal_light: normal.filter((x) => x.r.level === 'medium').length,
    age_flip_changes: changed, warned_by_age: Object.fromEntries(Object.entries(byAge).map(([k, v]) => [k, `${v.warned}/${v.n} (${pct(v.warned, v.n)}%)`])),
    kinds,
  };
  out.rates = { caught_any: pct(out.caught_any, out.scams), caught_full: pct(out.caught_full, out.scams), normal_full: pct(out.normal_full, out.normal), normal_light: pct(out.normal_light, out.normal) };
  return out;
}

const TARGET = { caught_any: 85, normal_full: 2, normal_light: 25 };
const results = [run('dev', 11), run('held', 22)];
for (const o of results) {
  console.log(`\n── ${o.set} (seed ${o.seed}): ${o.scams} scams, ${o.normal} honest transfers`);
  console.log(`scams with any warning : ${o.caught_any}/${o.scams} (${o.rates.caught_any}%)  target ≥ ${TARGET.caught_any}%`);
  console.log(`scams with full warning: ${o.caught_full}/${o.scams} (${o.rates.caught_full}%)`);
  console.log(`honest → full warning  : ${o.normal_full}/${o.normal} (${o.rates.normal_full}%)  target ≤ ${TARGET.normal_full}%`);
  console.log(`honest → light warning : ${o.normal_light}/${o.normal} (${o.rates.normal_light}%)  target ≤ ${TARGET.normal_light}%`);
  console.log(`age band flipped on every case → changes: ${o.age_flip_changes} (must be 0)`);
  console.log('honest transfers warned, by age band:', o.warned_by_age);
  console.table(o.kinds);
}
writeFileSync(new URL('./results_fraud.json', import.meta.url), JSON.stringify({ target: TARGET, results }, null, 2));
