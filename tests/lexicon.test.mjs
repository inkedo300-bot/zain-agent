// node tests/lexicon.test.mjs — the Iraqi word bank: normalisation, numbers, prompts, no side effects
import { normalizeIraqi, LEXICON, NUMBERS, lexiconStats, dialectGlossary, sttHints } from '../public/js/lexicon.js';
import { routeOffline, parseEntryOffline, wordsToNumber, parseAmount, detectAction } from '../public/js/nlu.js';
import { norm } from '../public/js/ledger.js';
import { CUSTOMERS, PRODUCTS, generate } from '../public/js/data.js';
import { Ledger } from '../public/js/ledger.js';
import { evalDialect } from '../public/js/eval.js';
let fail = 0;
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log(ok ? 'ok' : 'FAIL', '·', name, ok ? '' : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

// ── normalisation ──
eq('question word', normalizeIraqi('جم بعت هسع؟'), 'شكد بعت هسه؟');
eq('prefix kept', normalizeIraqi('دفعت بالامبيرات'), 'دفعت بالمولده');
eq('wallet with عال', normalizeIraqi('انباع عالمحفضة'), 'انباع عالمحفظه');
eq('week = جمعة', normalizeIraqi('الجمعة اللي طافت'), 'الاسبوع الماضي');
eq('last year stays a refusal', routeOffline('شكد ربحت السنة اللي فاتت؟').refuse, true);
eq('month by number word', normalizeIraqi('شهر سبعة'), 'شهر 7');
eq('month by ordinal', normalizeIraqi('بالشهر الثامن'), 'بشهر 8');
eq('Arabic-Indic digits and Persian letters', normalizeIraqi('٣ كراتين پيبسي'), '3 كراتين بيبسي');
eq('«شكرا» is not sugar', normalizeIraqi('شكرا'), 'شكرا');
eq('«شكر» is sugar', normalizeIraqi('كيلو شكر'), 'كيلو سكر');
eq('«إلي» (to me) untouched', normalizeIraqi('منو مطلوب إلي؟'), 'منو مطلوب الي؟');
for (const c of CUSTOMERS) eq(`name untouched: ${c.name}`, normalizeIraqi(c.name), norm(c.name));

// ── numbers ──
eq('خمسطعش الف', wordsToNumber('خمسطعش الف'), 15000);
eq('خمسة وعشرين الف', wordsToNumber('خمسة وعشرين الف'), 25000);
eq('عشرت تالاف', parseAmount('سدد عشرت تالاف'), 10000);
eq('الف ونص', wordsToNumber('الف ونص'), 1500);
eq('مليون وربع', wordsToNumber('مليون وربع'), 1250000);
eq('نص مليون', wordsToNumber('نص مليون'), 500000);
eq('ميتين وخمسين الف', wordsToNumber('ميتين وخمسين الف'), 250000);
eq('الفين', wordsToNumber('الفين'), 2000);
eq('واحد (starts with و)', wordsToNumber('واحد'), 1);
eq('٢٥ الف', parseAmount('٢٥ الف'), 25000);
eq('«تمن» is rice, not 8', NUMBERS['تمن'], undefined);

// ── entries ──
const e1 = parseEntryOffline('سيد جاسم انطاني خمسة وعشرين');
eq('dropped «الف» → 25,000, flagged', [e1.type, e1.amount, e1.amountGuessed, e1.confidence], ['payment_in', 25000, true, 0.6]);
const e2 = parseEntryOffline('سجلها على ست نور باكيت جكاير');
eq('«ست نور» is not a quantity of 6', [e2.type, e2.customer, e2.items[0]?.qty], ['credit_sale', 'C10', 1]);
eq('normal entry unchanged', parseEntryOffline('أبو علي سدد 30 الف').amount, 30000);

// ── commands ──
eq('نبهها = remind', detectAction('نبهها لأم زينب'), { tool: 'remind', args: { name: 'أم زينب' } });
eq('يمعود vocative', detectAction('يمعود، ذكّر حجي كاظم'), { tool: 'remind', args: { name: 'حجي كاظم' } });

// ── the bank itself ──
const st = lexiconStats();
eq('bank is big (≥200 entries, ≥900 forms)', st.entries >= 200 && st.forms >= 900, true);
const productWords = new Set(PRODUCTS.flatMap((p) => [p.name, ...p.alias].map(norm)));
const clash = [];
const seen = new Map();
for (const [cat, rows] of Object.entries(LEXICON)) for (const [v, meaning, to] of rows) {
  if (!meaning) clash.push(`${cat}: empty meaning`);
  if (!to) continue;
  for (const f of v.split('|').map(norm)) {
    if (seen.has(f) && seen.get(f) !== norm(to)) clash.push(`${f} → ${seen.get(f)} / ${norm(to)}`);
    seen.set(f, norm(to));
    if (productWords.has(f) && cat !== 'products') clash.push(`${f} is a product name`);
  }
}
eq('no variant maps to two different words, none hides a product', clash, []);
const g = dialectGlossary();
eq('prompt glossary fits (≤4.5k chars) and has no customer name', g.length <= 4600 && !CUSTOMERS.some((c) => g.includes(c.name)), true);
eq('stt hints fit', sttHints().length <= 600 && sttHints().includes('شكد'), true);

// ── the dialect set (offline rules only) ──
const d = evalDialect(new Ledger(generate()));
eq('dialect questions all right', d.q.rows.filter((r) => !r.ok).map((r) => r.q), []);
eq('dialect entries all right', d.e.rows.filter((r) => !r.ok).map((r) => r.t), []);

console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
