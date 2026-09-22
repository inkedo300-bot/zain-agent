// node tests/commands.test.mjs — commands vs questions, and the "no invented statements" check
import { detectAction, splitQuestions } from '../public/js/nlu.js';
import { validateAnswer } from '../public/js/agent.js';
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'ok' : 'FAIL', '·', name, ok ? '' : `got ${JSON.stringify(got)}`); };
const cases = [
  ['ذكر أم زينب إن هي مطلوبة إلنا برباط للدفع', { tool: 'remind', args: { name: 'أم زينب' } }],
  ['ذكّر حجي كاظم', { tool: 'remind', args: { name: 'حجي كاظم' } }],
  ['دزله رابط دفع لأبو علي', { tool: 'remind', args: { name: 'أبو علي' } }],
  ['حبيبي، سجل أم زينب أبو رابط صفر', { tool: 'remind', args: { name: 'أم زينب' } }], // a real mis-transcription
  ['ذكرهم', { tool: 'remind', args: { name: null } }],
  ['اطلب من الرافدين', { tool: 'order', args: { supplier: 'S1' } }],
  ['دز طلبية لمشروبات البصرة', { tool: 'order', args: { supplier: 'S2' } }],
  ['منو بعده مطلوب إلي؟', null],
  ['شكد ربحت اليوم؟', null],
  ['سجل على أبو حسين 3 كراتين ببسي بالدين', null],
  ['حجي كاظم سدد 25 الف', null],
];
for (const [q, want] of cases) eq(q, detectAction(q), want);
eq('two questions', splitQuestions('علي، شكد ربحت اليوم؟ ومنو مطلوب إلي بالدين هالأسبوع؟'), ['شكد ربحت اليوم؟', 'منو مطلوب إلي بالدين هالأسبوع؟']);
eq('one question', splitQuestions('شكد ربحت اليوم؟'), ['شكد ربحت اليوم؟']);
const res = { figures: [{ key: 'balance', value: 67500, ids: [] }] };
eq('invented reply rejected', validateAnswer('أم زينب مطلوبة 67,500 دينار. وگالت هي تذكرت السالفة ورح تخلص الحساب قريب.', res, null).length > 0, true);
eq('claims it sent rejected', validateAnswer('ذكّرتها وراح تدفع 67,500.', res, null).length > 0, true);
eq('"موعدها" is fine', validateAnswer('أم زينب مطلوبة 67,500، ومتأخرة عن موعدها المعتاد.', res, null), []);
console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
