// ─────────────────────────────────────────────────────────────
// The agent for open questions — «ليش ربحي نزل؟»، «شلون أدبّر الإيجار؟»
//
// Workflow vs agent (see README «وكيل + سير عمل»):
//   • anything that writes to the ledger or moves money runs as a FIXED workflow
//     (agent.js: route → tool → phrase → validate → approval card)
//   • open questions run here as an AGENT: the model chooses which READ-ONLY tool
//     to call next, up to MAX_STEPS times, then answers and may PROPOSE actions.
//     Proposals are only buttons; pressing one starts the fixed workflow (with its
//     own approval card), so the agent can never move money by itself.
//   • without a model (or if its answer fails the checks) a fixed «why» workflow
//     answers instead, from the same tools.
// ─────────────────────────────────────────────────────────────
import { callLLM, extractJSON, llmStatus } from './llm.js';
import { mask, unmask, nameOfCode, CUSTOMER_CODES } from './privacy.js';
import { norm } from './ledger.js';
import { SUPPLIERS, PRODUCTS, fmt, dateAr, customerById } from './data.js';
import { compact, validateAnswer, friendlyErr } from './agent.js';
import { dialectGlossary, AGENT_CATS } from './lexicon.js';

export const MAX_STEPS = 5;
const PERIODS = ['today', 'yesterday', 'this_week', 'last_week', 'last7', 'prev7', 'this_month', 'last_month', 'last30'];
export const READ_TOOLS = ['compare', 'sales', 'profit', 'expenses', 'fxImpact', 'debts', 'customer', 'topItems', 'position', 'forecast', 'anomalies', 'inventory'];

// open, multi-step questions go to the agent; everything else stays in the fixed workflow
export function isOpenQuestion(q) {
  const t = ' ' + norm(q) + ' ';
  return /(ليش|لويش|لماذا|شنو السبب|شسبب|وين راحت|شلون ادبر|شلون اتدبر|شلون اكدر|شنو اسوي|شسوي|حلل|تحليل|خطه|انصحني|شنو تنصح|شتنصح|ليش قل|ليش نزل|ليش زاد|اشرحلي ليش)/.test(t);
}
const isPlanning = (q) => /(ادبر|اتدبر|تكفي|يكفي|خطه|اسوي|انصح|تنصح)/.test(norm(q));

const AGENT = `أنت وكيل تحليل داخل دفتر حسابات بقالة عراقية. صاحب المحل سأل سؤال مفتوح يحتاج أكثر من خطوة.
عندك أدوات للقراءة فقط (ما تگدر تسجل أو تدفع أو ترسل شي):
- compare {metric: sales|profit|expenses, a: period, b: period} : يقارن فترتين ويرجع الفرق جاهز (استخدمه بدل ما تطرح بنفسك)
- sales {period} - profit {period} - expenses {period} - fxImpact {period}
- debts {} : منو مطلوب - customer {name: رمز الزبون} - topItems {period}
- position {} : الفلوس هسه - forecast {} : توقع السيولة 30 يوم - anomalies {} : أشياء غريبة - inventory {} : المخزون
period واحد من: ${PERIODS.join(', ')} (last7 = آخر 7 أيام، prev7 = السبعة اللي قبلها).
أسماء الزبائن مخفية برموز (${CUSTOMER_CODES.join('، ')}).
بكل خطوة أرجع JSON واحد فقط:
  لأداة:  {"thought":"ليش أحتاجها بجملة قصيرة","tool":"...","args":{...}}
  للجواب: {"final":"3 لـ5 جمل باللهجة العراقية لصاحب المحل","proposals":[{"type":"remind","customer":"C3"},{"type":"order","supplier":"S1"}]}
قواعد: حد أقصى ${MAX_STEPS} أدوات. بسؤال «ليش» استخدم أداتين على الأقل: compare بين last7 وprev7 (فترتين متساويتين، لا تقارن أسبوع ناقص بأسبوع كامل)، وبعدها أداة تشرح السبب (expenses أو fxImpact أو anomalies أو topItems).
بسؤال التخطيط استخدم forecast وdebts. لا تنادي صاحب المحل باسم، ولا تذكر أي رقم ما رجعته أداة، واكتب التواريخ بالكلام (مثل «5 تشرين الأول»). استخدم فقط الأرقام اللي رجعتها الأدوات وبنفس الشكل (مثل 1,250,000)، وممنوع تحسب رقم جديد.
لا تنسب كلام لزبون ولا تگول إنك سويت شي. الاقتراحات اختيارية، وبس من نوع remind أو order، وصاحب المحل هو اللي يوافق عليها.
${dialectGlossary({ cats: AGENT_CATS, perEntry: 2 })}`;

// ── read-only tools ──
function compare(L, { metric = 'profit', a = 'last7', b = 'prev7' } = {}) {
  const pick = { sales: ['sales', 'total'], profit: ['profit', 'net'], expenses: ['expenses', 'total'] }[metric] || ['profit', 'net'];
  const ra = L[pick[0]]({ period: a }), rb = L[pick[0]]({ period: b });
  if (ra.empty || rb.empty) return { tool: 'compare', empty: true, figures: [] };
  const va = ra.figures.find((f) => f.key === pick[1]), vb = rb.figures.find((f) => f.key === pick[1]);
  const diff = va.value - vb.value;
  const figures = [
    { ...va, key: 'a', label: `${va.label} · ${ra.period.label}` },
    { ...vb, key: 'b', label: `${vb.label} · ${rb.period.label}` },
    { key: 'diff', label: diff >= 0 ? 'الزيادة' : 'النقص', value: Math.abs(diff), ids: [...va.ids, ...vb.ids] },
  ];
  // for profit, also give the parts so the agent can explain the cause without arithmetic
  if (pick[0] === 'profit') for (const k of ['revenue', 'gross', 'expenses']) {
    const x = ra.figures.find((f) => f.key === k), y = rb.figures.find((f) => f.key === k);
    figures.push({ key: k + '_a', label: `${x.label} · ${ra.period.label}`, value: x.value, ids: x.ids }, { key: k + '_b', label: `${y.label} · ${rb.period.label}`, value: y.value, ids: y.ids },
      { key: k + '_diff', label: `فرق ${x.label}`, value: Math.abs(x.value - y.value), ids: [] });
  }
  if (va.value && vb.value) figures.push({ key: 'pct', label: 'نسبة التغيّر %', value: Math.round(Math.abs(diff) / Math.abs(vb.value) * 100), ids: [] });
  return { tool: 'compare', metric, direction: diff >= 0 ? 'up' : 'down', figures };
}
export function runReadTool(L, tool, args = {}) {
  if (!READ_TOOLS.includes(tool)) return { refused: true, reason: 'not_read_only' };
  const a = { ...args };
  for (const k of ['period', 'a', 'b']) if (a[k] && !PERIODS.includes(a[k])) delete a[k];
  if (a.name && /^C\d+$/.test(a.name)) a.name = nameOfCode(a.name);
  switch (tool) {
    case 'compare': return compare(L, a);
    case 'sales': return L.sales(a);
    case 'profit': return L.profit(a);
    case 'expenses': return L.expenses(a);
    case 'fxImpact': return L.fxImpact(a);
    case 'debts': return L.debts();
    case 'customer': return L.customer(a);
    case 'topItems': return L.topItems(a);
    case 'position': return L.position();
    case 'forecast': return L.forecast({ days: 30 });
    case 'anomalies': return L.anomalies();
    case 'inventory': return L.inventory({});
  }
}
const slim = (res) => ({ tool: res.tool, figures: (res.figures || []).map(({ key, label, value, ids }) => ({ key, label, value, ids })) });

function validProposals(L, list) {
  const book = L.debtBook();
  return (Array.isArray(list) ? list : []).slice(0, 3).flatMap((p) => {
    if (p?.type === 'remind') { const id = /^C\d+$/.test(p.customer) ? p.customer : null; return id && book[id]?.balance > 0 ? [{ type: 'remind', customer: id, name: customerById(id).name }] : []; }
    if (p?.type === 'order' && SUPPLIERS[p.supplier]) return [{ type: 'order', supplier: p.supplier, name: SUPPLIERS[p.supplier].short }];
    return [];
  });
}

// ── fixed «why» workflow: the fallback, and the offline answer ──
export function workflowWhy(L, q) {
  const steps = [];
  const run = (tool, args) => { const res = runReadTool(L, tool, args); steps.push({ tool, args, res: slim(res) }); return res; };
  const F = (res, k) => res.figures.find((f) => f.key === k)?.value ?? 0;
  if (isPlanning(q)) {
    const fc = run('forecast', {});
    const d = run('debts', {});
    const low = fc.lowest;
    const top = d.rows.filter((r) => r.balance > 0).sort((x, y) => y.oldest - x.oldest).slice(0, 2);
    const answer = `حسب التوقع، أقل رصيد راح يوصله محلك ${fmt(low.balance)} دينار يوم ${dateAr(low.date)}${low.balance < 0 ? '، يعني تحت الصفر' : ''}. ` +
      `الديون المفتوحة ${fmt(F(d, 'total'))} دينار، وأقدمها عند ${top.map((r) => `${r.name} (${fmt(r.balance)})`).join(' و')}. ` +
      `إذا تحصّلهم قبل موعد الدفعات الكبيرة، يخف الضغط. تگدر تذكّرهم برابط دفع من هنا.`;
    return { answer, steps, proposals: top.map((r) => ({ type: 'remind', customer: r.id, name: r.name })) };
  }
  const metric = /(بيع|بعت|مبيعات|غله)/.test(norm(q)) ? 'sales' : 'profit';
  const c = run('compare', { metric, a: 'last7', b: 'prev7' });
  const an = run('anomalies', {});
  const up = c.direction === 'up';
  let cause = '';
  if (metric === 'profit') {
    const dRev = F(c, 'revenue_a') - F(c, 'revenue_b'), dGross = F(c, 'gross_a') - F(c, 'gross_b'), dExp = F(c, 'expenses_a') - F(c, 'expenses_b');
    const parts = [
      { k: 'revenue', v: dRev, txt: `المبيعات ${dRev >= 0 ? 'زادت' : 'نزلت'} من ${fmt(F(c, 'revenue_b'))} إلى ${fmt(F(c, 'revenue_a'))}` },
      { k: 'expenses', v: -dExp, txt: `المصاريف ${dExp >= 0 ? 'زادت' : 'نزلت'} من ${fmt(F(c, 'expenses_b'))} إلى ${fmt(F(c, 'expenses_a'))}` },
      { k: 'margin', v: dGross - dRev, txt: `ربح البضاعة صار ${fmt(F(c, 'gross_a'))} بدل ${fmt(F(c, 'gross_b'))}` },
    ].sort((x, y) => Math.abs(y.v) - Math.abs(x.v));
    cause = ` أكبر سبب: ${parts[0].txt}.`;
  }
  const label = metric === 'sales' ? 'مبيعاتك' : 'صافي ربحك';
  const highs = an.items.filter((x) => x.sev === 'high').length;
  const answer = `${label} آخر 7 أيام ${fmt(F(c, 'a'))} دينار، مقابل ${fmt(F(c, 'b'))} بالسبعة اللي قبلها، يعني ${up ? 'زاد' : 'نزل'} ${fmt(F(c, 'diff'))} دينار.${cause}` +
    (highs ? ` واكو ${highs} تنبيهات مهمة بالحسابات تستاهل تشوفها.` : '');
  return { answer, steps, proposals: [] };
}

// ── the agent loop ──
export async function agentAsk(L, q, { useLLM = true } = {}) {
  const t0 = performance.now();
  const trace = [{ step: 'وكيل', kind: 'start', note: 'سؤال مفتوح ← وكيل بأدوات قراءة فقط' }];
  const finish = (o) => ({ q, agent: true, ...o, trace, ms: Math.round(performance.now() - t0) });
  const fallback = (why) => {
    const w = workflowWhy(L, q);
    for (const s of w.steps) trace.push({ step: 'وكيل', kind: 'tool', source: 'workflow', tool: s.tool, args: s.args, figures: s.res.figures });
    trace.push({ step: 'وكيل', kind: 'final', source: 'workflow', note: why });
    return finish({ answer: w.answer, answerSource: 'workflow', proposals: w.proposals, res: { figures: w.steps.flatMap((s) => s.res.figures) }, stepsUsed: w.steps.length });
  };
  if (!(useLLM && llmStatus().ok)) return fallback('بدون نموذج: خطوات ثابتة');

  const sent = mask(q);
  trace.push({ step: 'الخصوصية', sent });
  const msgs = [{ role: 'user', content: sent }];
  const results = [];
  let final = null;
  try {
    for (let i = 0; i <= MAX_STEPS && !final; i++) {
      const last = i === MAX_STEPS;
      if (last) msgs.push({ role: 'user', content: 'خلصت الخطوات المسموحة. اكتب الجواب النهائي هسه بصيغة {"final":...}.' });
      const { text, ms } = await callLLM({ system: AGENT, messages: msgs, json: true, maxTokens: 600, timeoutMs: 30000 });
      const j = extractJSON(text);
      if (!j) { trace.push({ step: 'وكيل', kind: 'error', note: 'رد مو JSON' }); break; }
      if (j.final) { final = j; trace.push({ step: 'وكيل', kind: 'think', ms, note: 'جاهز للجواب' }); break; }
      if (last) break;
      msgs.push({ role: 'assistant', content: JSON.stringify(j) });
      if (!READ_TOOLS.includes(j.tool)) {
        // the model asked for something it is not allowed to do (or that does not exist)
        trace.push({ step: 'وكيل', kind: 'blocked', tool: String(j.tool || '?'), note: 'أداة مو مسموحة، الوكيل يقرا بس' });
        msgs.push({ role: 'user', content: `الأداة ${j.tool} مو مسموحة. المسموح للقراءة فقط: ${READ_TOOLS.join(', ')}.` });
        continue;
      }
      const res = runReadTool(L, j.tool, j.args || {});
      results.push(res);
      trace.push({ step: 'وكيل', kind: 'tool', source: 'gemini', ms, thought: unmask(j.thought || ''), tool: j.tool, args: j.args || {}, figures: slim(res).figures });
      msgs.push({ role: 'user', content: mask(`نتيجة ${j.tool}: ${res.empty ? 'ماكو بيانات لهالفترة' : compact(res)}`) });
    }
  } catch (e) { return fallback('Gemini ما رد: ' + friendlyErr(e)); }
  if (!final) return fallback('الوكيل ما وصل لجواب');
  if (!results.length) return fallback('الوكيل جاوب بدون ما يقرا أي أداة');

  // numbers in the house style (1,250,000), the same way the fixed workflow writes them
  const answer = unmask(String(final.final)).replace(/(?<![\d,.\-/:])\d{4,}(?![\d,.\-/:])/g, (n) => fmt(+n));
  // every number any tool returned (figures, rows, forecast drivers…) is allowed; nothing else is
  const merged = { figures: results.flatMap((r) => r.figures || []), all: results };
  const problems = validateAnswer(answer, merged, null);
  trace.push({ step: 'وكيل', kind: 'final', source: 'gemini', accepted: !problems.length, problems, draft: answer });
  if (problems.length) return fallback('جواب الوكيل انرفض: ' + problems[0]);
  return finish({ answer, answerSource: 'agent', proposals: validProposals(L, final.proposals), res: { figures: merged.figures }, stepsUsed: results.length });
}
