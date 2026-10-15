import { generate, SHOP, TODAY, CUSTOMERS, PRODUCTS, SUPPLIERS, customerById, productBySku, fmt, dateAr, addDays, daysBetween, TYPE_AR, CH_AR, DOW_AR, dow, r250 } from './data.js';
import { Ledger } from './ledger.js';
import { SUGGESTIONS, splitQuestions, detectAction } from './nlu.js';
import { ask, parseEntry, looksLikeEntry, readNotebook, notebookToEntries, SAMPLE_PAGE, CONF_MIN, draftReminder, morningBrief, weeklySummary, forecastText } from './agent.js';
import { health, llmStatus, getKey, setKey } from './llm.js';
import { evalOffline, evalLLM, evalShops } from './eval.js';
import { autoCheck, incomingOf, makeOrder, orderValue, STATUS_AR, OPEN, describe as describeOrder } from './orders.js';
import { startRecording } from './voice.js';
import { FLOWS, LANES, flowSVG } from './flow.js';
import { transcribe } from './agent.js';
import { agentAsk, isOpenQuestion, MAX_STEPS } from './agentloop.js';

// ── helpers ──
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const initials = (n) => (n || '؟').replace(/^(أبو|ابو|أم|ام|حجي|سيد|ست)\s+/, '').trim().slice(0, 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const money = (n) => `${fmt(n)} د.ع`;
const P = {
  home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>', chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',
  book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>', users: '<circle cx="9" cy="8" r="3"/><path d="M3 19c.8-3 3-4.5 6-4.5s5.2 1.5 6 4.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c2.2 0 3.8 1.2 4.5 3.5"/>',
  chart: '<path d="M4 19h16"/><path d="M5 15l4-5 4 3 6-7"/>', bell: '<path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>', alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.01"/>', dollar: '<path d="M12 3v18"/><path d="M16 7.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.6 4 3.1 4 1.3 4 3.3-1.8 3.1-4 3.1-4-1.2-4-3"/>',
  truck: '<path d="M3 6h11v10H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>', camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  week: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0012 0M12 17v4"/>', lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  send: '<path d="M20 12H6M12 6l-6 6 6 6"/>', back: '<path d="M9 5l7 7-7 7"/>', plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12l5 5 9-10"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  in: '<path d="M12 4v13M6 11l6 6 6-6"/>', out: '<path d="M12 20V7M6 13l6-6 6 6"/>', link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.01"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M16 12h3"/><path d="M3 9h14a2 2 0 002-2V6"/>', spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>',
};
const icon = (n, s = 20, sw = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;
const sbIcons = `<span class="icons"><svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg><svg width="24" height="11" viewBox="0 0 24 11"><rect x=".5" y=".5" width="21" height="10" rx="3" fill="none" stroke="currentColor" opacity=".5"/><rect x="2" y="2" width="15" height="7" rx="1.6" fill="currentColor"/></svg></span>`;

// ── state ──
let L, S;
function init() {
  L = new Ledger(generate());
  S = {
    useLLM: true,
    A: { tab: 'home', sub: null, custId: null, chat: [], draft: '', typing: false, sheet: null, toast: null, filter: 'all',
      scen: { collect: [], delaySupplier: false, salaryDelay: false }, closing: { step: 1, counted: '', exp: '', expNote: '', res: null }, nb: { page: null, entries: null, busy: false, img: null, err: null },
      recording: false, transcribing: false, count: null },
    B: { mode: 'cust', cid: 'C1', sid: 'S1', sheet: null, toast: null, edit: null, deliver: null },
    orders: [], supSet: { S1: { auto: true, cap: 2000000 }, S2: { auto: false, cap: 1000000 }, S3: { auto: false, cap: 1000000 } },
    supBal: { S1: 8450000, S2: 3200000, S3: 4125000 },
    notes: [], bal: Object.fromEntries(CUSTOMERS.map((c, i) => [c.id, 250000 + i * 37500])),
    runs: [], events: [], audit: [], remLog: {}, tab: 'flow', flow: { key: 'debt', sel: -1, live: { debt: -1, ask: -1, agent: -1, order: -1 }, note: {}, fresh: false, zoom: false }, evalOff: null, evalShops: null, evalLLM: null, evalBusy: false, evalProg: 0,
  };
  // pending debt confirmations from the last two weeks
  for (const t of L.tx.filter((t) => t.type === 'credit_sale' && !t.confirmed && daysBetween(t.date, TODAY) <= 14))
    S.notes.push({ id: 'N' + t.id, cid: t.customer, kind: 'confirm', debtId: t.id, amount: t.amount, status: 'new', time: dateAr(t.date), text: describeItems(t) });
}
const describeItems = (t) => (t.items || []).map((i) => `${i.qty} ${productBySku(i.sku).name}`).join(' + ');
// ── audit log: every write, who did it, and a 5-minute undo where undo makes sense ──
const UNDO_MS = 5 * 60 * 1000;
const PIN = '1234'; // demo PIN for money that leaves the shop
function audit(o) { S.audit.unshift({ id: 'A' + (S.audit.length + 1), at: Date.now(), time: hhmm(), status: 'done', ...o }); if (S.tab === 'audit') renderPanel(); }
function undoAudit(id) {
  const a = S.audit.find((x) => x.id === id); if (!a || a.status !== 'done' || !a.undo || Date.now() - a.at > UNDO_MS) return false;
  a.undo(); a.status = 'undone'; event(`تراجع: ${a.action} (${a.detail}).`); return true;
}
function event(text, kind = 'info') { S.events.unshift({ time: hhmm(), text, kind }); fetch('/api/log', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, text }) }).catch(() => {}); if (S.tab === 'events') renderPanel(); }

// ── top bar ──
async function renderPill(force) {
  const st = await health(force);
  const on = st.ok && S.useLLM;
  $('#enginePill').className = 'pill ' + (on ? 'ok' : 'warn');
  $('#enginePill').innerHTML = `<span class="dot"></span><span>${on ? `Gemini متصل · ${esc(st.model)}` : st.ok ? 'Gemini موقوف من الإعدادات' : 'وضع احتياطي بدون نموذج'}</span>`;
  $('#modeBadge').textContent = on ? 'gemini' : 'offline';
  $('#modeBadge').className = 'src ' + (on ? 'g' : 'o');
}
const useLLM = () => S.useLLM && llmStatus().ok;

// ═════════════ PHONE A: merchant ═════════════
function statusA(dark) { $('#sbA').className = 'statusbar' + (dark ? ' dark' : ''); $('#sbA').innerHTML = `<span>${hhmm()}</span>${sbIcons}`; }
const appbar = (title, sub, back = true) => `<div class="appbar">${back ? `<button class="back" data-a="back">${icon('back', 16)}</button>` : ''}<b>${title}${sub ? `<small>${sub}</small>` : ''}</b></div>`;
function bnav() {
  const n = L.anomalies().items.length;
  const tabs = [['home', 'الرئيسية', 'home'], ['chat', 'المساعد', 'chat'], ['book', 'الدفتر', 'book'], ['debts', 'الديون', 'users'], ['cash', 'السيولة', 'chart']];
  return `<nav class="bnav">${tabs.map(([k, l, ic]) => `<button class="${S.A.tab === k && !S.A.sub ? 'on' : ''}" data-a="tab" data-k="${k}">${icon(ic, 20)}${l}${k === 'home' && n ? `<span class="badge">${n}</span>` : ''}</button>`).join('')}</nav>`;
}

function homeScreen() {
  const pos = L.position(); const F = (k) => pos.figures.find((f) => f.key === k);
  const today = L.sales({ period: 'today' }).figures[0];
  const mb = morningBrief(L);
  const alerts = L.anomalies().items.length;
  const tx = L.tx.filter((t) => t.date === TODAY).slice(-4).reverse();
  const inv = L.inventory({ incoming: incomingOf(S.orders) });
  const low = inv.rows.filter((r) => r.status === 'low' || r.status === 'out');
  const lowN = low.length, supN = S.orders.filter((o) => o.status === 'draft' || o.status === 'delivered').length;
  return `<div class="scroll">
  <div class="hero"><div class="hrow"><div><small>${DOW_AR[dow(TODAY)]} ${dateAr(TODAY)} · صباح الخير</small><h3>${SHOP.name}</h3></div><button class="iconbtn" data-a="sub" data-k="alerts">${icon('bell', 18)}</button></div></div>
  <div class="balcard"><small>فلوسك هسه (كاش + محفظة)</small><div class="big num">${figBtn(F('total'))}<span>د.ع</span></div>
    <div class="split"><div><small>بالجرار</small><b class="num">${figBtn(F('cash'))}</b></div><div><small>بالمحفظة</small><b class="num">${figBtn(F('wallet'))}</b></div><div><small>ديون عند الناس</small><b class="num">${figBtn(F('debts'))}</b></div></div></div>
  <div class="brief"><h4>${icon('spark', 16)} شنو عندك هالأيام</h4>
    <ul>${mb.dues.map((d) => `<li><span>${esc(d.label)} · ${dateAr(d.date)}</span><b class="num">${fmt(d.amount)}</b></li>`).join('') || '<li>ماكو دفعات كبيرة قريبة</li>'}</ul>
    ${low.map((r) => { const o = S.orders.find((x) => OPEN.includes(x.status) && x.items.some((i) => i.sku === r.sku)); return `<p>${icon('box', 13)} <b>${esc(r.name)}</b> يخلص خلال ${r.cover} يوم. ${o ? `طلبية ${esc(SUPPLIERS[o.sid].short)}: ${STATUS_AR[o.status]}.` : ''}</p>`; }).join('')}
    ${mb.target ? `<p>أكبر دين قريب تحصيله: <b>${esc(mb.target.name)}</b> (${fmt(mb.target.balance)}). تذكير برابط دفع يسرّع التحصيل.</p><button class="btn sm primary" data-a="cust" data-id="${mb.target.id}">ذكّر ${esc(mb.target.name)}</button>` : ''}
  </div>
  <div class="tiles">
    <button class="tile" data-a="sub" data-k="closing"><span class="ic">${icon('moon')}</span>تسكيرة المساء</button>
    <button class="tile" data-a="sub" data-k="alerts"><span class="ic">${icon('alert')}</span>التنبيهات${alerts ? `<span class="badge">${alerts}</span>` : ''}</button>
    <button class="tile" data-a="sub" data-k="weekly"><span class="ic">${icon('week')}</span>ملخص الأسبوع</button>
    <button class="tile" data-a="sub" data-k="fx"><span class="ic">${icon('dollar')}</span>الدولار والأسعار</button>
    <button class="tile" data-a="sub" data-k="inventory"><span class="ic">${icon('box')}</span>المخزون${lowN ? `<span class="badge">${lowN}</span>` : ''}</button>
    <button class="tile" data-a="sub" data-k="sup"><span class="ic">${icon('truck')}</span>الموردين${supN ? `<span class="badge">${supN}</span>` : ''}</button>
    <button class="tile" data-a="sub" data-k="notebook"><span class="ic">${icon('camera')}</span>اقرأ صفحة دفتر</button>
  </div>
  <div class="sec">بيع اليوم <a data-a="tab" data-k="book">الدفتر</a></div>
  <div class="list"><div class="row"><span class="ic">${icon('chart', 18)}</span><span class="t"><b>مجموع بيع اليوم</b><small>كاش + محفظة + دين</small></span><span class="a num">${figBtn(today)}</span></div>
    ${tx.map(txRow).join('')}</div></div>`;
}
function txRow(t) {
  const c = t.customer ? customerById(t.customer) : null;
  const inflow = ['sale', 'payment_in', 'credit_sale'].includes(t.type) || (t.type === 'transfer' && t.dir === 'to_cash');
  const title = t.type === 'credit_sale' ? `دين على ${c.name}` : t.type === 'payment_in' ? (c ? `تسديد من ${c.name}` : 'تحويل وارد بدون اسم') : t.type === 'sale' ? `بيع ${CH_AR[t.channel]}` : t.note;
  const tags = [];
  if (t.type === 'credit_sale') tags.push(t.disputed ? '<span class="tag late">معترض</span>' : t.confirmed ? '<span class="tag ok">مؤكد</span>' : '<span class="tag unconf">بانتظار التأكيد</span>');
  if (t.type === 'payment_in' && t.debtRef) tags.push('<span class="tag info">تطابق تلقائي</span>');
  return `<button class="row" data-a="tx" data-id="${t.id}"><span class="ic">${icon(inflow ? 'in' : 'out', 16)}</span><span class="t"><b>${esc(title)}${tags.join('')}</b><small>${dateAr(t.date)} · ${CH_AR[t.channel] || 'تحويل'}${t.items?.length && t.type !== 'sale' ? ' · ' + esc(describeItems(t)) : ''}</small></span><span class="a num ${inflow ? 'pos' : ''}">${inflow ? '+' : '−'}${fmt(t.amount)}</span></button>`;
}

// figures become buttons that open their source transactions
const FIGS = new Map(); let figSeq = 0;
function figBtn(f, text) { if (!f) return '—'; const id = 'f' + (++figSeq); FIGS.set(id, f); return `<button class="numchip" data-a="fig" data-f="${id}">${text || fmt(f.value)}</button>`; }
function linkify(text, figs) {
  let html = esc(text);
  const list = (figs || []).filter((f) => f.value !== 0 && f.ids?.length).map((f) => ({ f, s: fmt(Math.abs(f.value)) })).sort((a, b) => b.s.length - a.s.length);
  const done = new Set();
  for (const { f, s } of list) {
    if (done.has(s) || !html.includes(s)) continue;
    done.add(s);
    const id = 'f' + (++figSeq); FIGS.set(id, f);
    html = html.split(s).join(`\u0001${id}\u0002`);
  }
  return html.replace(/\u0001(f\d+)\u0002/g, (_, id) => `<button class="numchip" data-a="fig" data-f="${id}">${fmt(Math.abs(FIGS.get(id).value))}</button>`);
}

function chatScreen() {
  const msgs = S.A.chat.map((m, i) => {
    if (m.from === 'me') return `<div class="msg me">${m.voice ? `<span style="opacity:.75;font-size:11px">${icon('mic', 11)} من الصوت · </span>` : ''}${esc(m.text)}</div>`;
    if (m.entry) return entryCard(m, i);
    if (m.act) return actCard(m, i);
    return `<div class="msg bot">${m.html || linkify(m.text, m.figs)}${m.meta ? `<div class="meta">${m.meta}</div>` : ''}</div>`;
  }).join('');
  return `${appbar('المساعد', 'اسأل أو سجّل باللهجة، بالكتابة أو بالصوت', false)}
  <div class="chat" id="chatBox">${msgs || `<div class="msg bot">هلا ${SHOP.owner}. اسألني عن البيع، الربح، الديون، أو السيولة. وتگدر تسجل: «بعت 3 كراتين ببسي لأبو حسين بالدين».<div class="meta"><span>الأرقام اللي تحتها خط تنضغط وتبين العمليات اللي انحسبت منها.</span></div></div>`}${S.A.typing ? '<div class="typing"><i></i><i></i><i></i></div>' : ''}</div>
  <div class="composer"><div class="sugs">${SUGGESTIONS.map((s) => `<button data-a="ask" data-q="${esc(s)}">${esc(s)}</button>`).join('')}<button data-a="ask" data-q="بعت 3 كراتين ببسي لأبو حسين بالدين">بعت 3 كراتين ببسي لأبو حسين بالدين</button></div>
    ${S.A.heard ? `<div class="heard">${icon('mic', 16)}<span>سمعتك: «<b>${esc(S.A.heard.text)}</b>». صح؟</span><button class="btn sm primary" data-a="heardOk">صح، أرسل</button><button class="btn sm" data-a="heardEdit">أصحّح</button></div>` : ''}
    <div class="line"><button class="cbtn ${S.A.recording ? 'rec' : ''}" data-a="mic" title="${S.A.recording ? 'اضغط حتى توقف' : 'تكلم'}" ${S.A.transcribing ? 'disabled' : ''}>${S.A.transcribing ? '<span class="spin"></span>' : icon('mic', 18)}</button><button class="cbtn" data-a="sub" data-k="notebook" title="صورة دفتر">${icon('camera', 18)}</button>
    <input id="chatIn" placeholder="اكتب سؤالك أو القيد…" value="${esc(S.A.draft)}" autocomplete="off"><button class="cbtn send" data-a="send">${icon('send', 18)}</button></div></div>`;
}
function entryCard(m, i) {
  const e = m.entry;
  if (m.saved) return `<div class="entry done"><h5>${icon('check', 16)} انحفظ: ${esc(TYPE_AR[e.type] || '')} ${e.customer ? '· ' + esc(customerById(e.customer).name) : ''} · ${fmt(e.amount)} د.ع</h5>${e.type === 'credit_sale' ? '<div class="pnote" style="font-size:11.5px">وصل للزبون طلب تأكيد بمحفظته.</div>' : ''}</div>`;
  if (m.cancelled) return `<div class="msg bot">لغيت القيد.</div>`;
  const it = e.items?.[0];
  return `<div class="entry" data-i="${i}"><h5>تأكد من القيد قبل الحفظ <span class="src ${e.source === 'gemini' ? 'g' : 'o'}">${e.source === 'gemini' ? 'Gemini' : 'بدون نموذج'}</span></h5>
    <div class="grid">
      <label>النوع<select data-e="type">${['credit_sale', 'sale', 'payment_in', 'expense'].map((t) => `<option value="${t}" ${e.type === t ? 'selected' : ''}>${TYPE_AR[t]}</option>`).join('')}</select></label>
      <label>الزبون<select data-e="customer"><option value="">—</option>${CUSTOMERS.map((c) => `<option value="${c.id}" ${e.customer === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select></label>
      ${e.type === 'payment_in' || e.type === 'expense' ? '' : `<label>المادة<select data-e="sku"><option value="">—</option>${PRODUCTS.map((p) => `<option value="${p.sku}" ${it?.sku === p.sku ? 'selected' : ''}>${p.name} (${fmt(p.sell)})</option>`).join('')}</select></label>
      <label>الكمية<input data-e="qty" type="number" min="1" value="${it?.qty || 1}"></label>`}
      <label class="full">المبلغ (دينار)<input data-e="amount" type="number" min="0" step="250" value="${e.amount || ''}"></label>
      ${e.type !== 'credit_sale' ? `<label class="full">الطريقة<select data-e="channel"><option value="cash" ${e.channel === 'cash' ? 'selected' : ''}>كاش</option><option value="wallet" ${e.channel === 'wallet' ? 'selected' : ''}>محفظة</option></select></label>` : ''}
    </div>
    ${e.missing?.length ? `<div class="warn">ناقص: ${e.missing.map((x) => ({ type: 'النوع', customer: 'الزبون', amount: 'المبلغ' }[x] || x)).join('، ')}. كمّله قبل الحفظ.</div>` : e.items?.some((x) => x.qtyGuessed) ? '<div class="warn">الكمية ما مذكورة، حطيت 1. تأكد منها.</div>' : ''}
    <div class="acts"><button class="go" data-a="saveEntry" data-i="${i}">احفظ</button><button data-a="cancelEntry" data-i="${i}">إلغاء</button></div></div>`;
}

function bookScreen() {
  const f = S.A.filter;
  const types = { all: null, sale: ['sale'], credit: ['credit_sale'], pay: ['payment_in'], exp: ['expense'], buy: ['purchase'] };
  const list = L.tx.filter((t) => !types[f] || types[f].includes(t.type)).slice(-70).reverse();
  let last = '';
  const rows = list.map((t) => { const h = t.date !== last ? `<div class="daylabel">${t.date === TODAY ? 'اليوم' : t.date === addDays(TODAY, -1) ? 'البارحة' : `${DOW_AR[dow(t.date)]} ${dateAr(t.date)}`}</div>` : ''; last = t.date; return h + txRow(t); }).join('');
  return `${appbar('الدفتر', `${fmt(L.tx.length)} قيد · آخر 90 يوم`, false)}
  <div class="chips">${[['all', 'الكل'], ['sale', 'بيع'], ['credit', 'دين'], ['pay', 'تسديد'], ['exp', 'مصاريف'], ['buy', 'بضاعة']].map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-a="filter" data-k="${k}">${l}</button>`).join('')}</div>
  <div class="scroll"><div class="list">${rows}</div></div>
  <button class="fab" data-a="quickAdd" title="قيد جديد">${icon('plus', 22, 2.2)}</button>`;
}

function debtsScreen() {
  const d = L.debts();
  return `${appbar('الديون', 'منو مطلوب إلك، ومن متى', false)}
  <div class="scroll"><div class="pad" style="padding-bottom:0"><div class="box"><small class="muted">مجموع الديون عند الناس</small><div class="bigno num">${figBtn(d.figures[0])} <small class="muted" style="font-size:12px">د.ع · ${d.rows.length} زباين</small></div></div></div>
  <div class="list" style="padding-top:10px">${d.rows.map((r) => `<button class="row" data-a="cust" data-id="${r.id}"><span class="av">${initials(r.name)}</span><span class="t"><b>${esc(r.name)}${r.overdue ? '<span class="tag late">متأخر</span>' : ''}${r.unconfirmed ? `<span class="tag unconf">${r.unconfirmed} غير مؤكد</span>` : ''}</b><small>أقدم دين ${r.oldest} يوم${r.usual != null ? ` · عادته يسدد خلال ${r.usual} يوم` : ''}</small></span><span class="a num">${fmt(r.balance)}</span></button>`).join('')}</div></div>`;
}

function custScreen() {
  const cid = S.A.custId, c = customerById(cid), b = L.debtBook()[cid];
  const hist = L.tx.filter((t) => t.customer === cid).slice(-8).reverse();
  const monthly = L.tx.filter((t) => t.customer === cid && t.type === 'credit_sale' && t.date > addDays(TODAY, -60)).reduce((a, t) => a + t.amount, 0) / 2;
  const limit = Math.max(25000, Math.round((monthly * 1.5) / 5000) * 5000);
  const rem = S.A.reminder?.cid === cid ? S.A.reminder : null;
  const f = { key: 'bal', label: `المطلوب من ${c.name}`, value: b.balance, ids: b.open.map((d) => d.id) };
  return `${appbar(esc(c.name), `${esc(c.full)} · <span class="ltr">${c.phone}</span>`)}
  <div class="scroll"><div class="pad">
    <div class="box"><small class="muted">المطلوب منه</small><div class="bigno num">${figBtn(f)} <small class="muted" style="font-size:12px">د.ع</small></div>
      <p style="margin-top:6px">${b.usual != null ? `عادته يسدد خلال ${b.usual} يوم.` : ''} ${b.lastPay ? `آخر تسديد ${dateAr(b.lastPay)}.` : ''} الحد المقترح لدينه: <b class="num">${fmt(limit)}</b> (حسب معدل شرائه بالدين).</p>
      ${b.balance > limit ? `<div class="note warn" style="margin-top:8px">${icon('info', 14)}<span>دينه هسه فوق الحد المقترح. فكّر قبل ما تزيده.</span></div>` : ''}</div>
    ${b.balance > 0 ? (rem ? `<div class="box"><h4>تذكير برابط دفع <span class="src ${rem.source === 'gemini' ? 'g' : 't'}">${rem.source === 'gemini' ? 'Gemini' : 'قالب'}</span></h4>
        ${rem.busy ? '<p>جاري كتابة الرسالة…</p>' : `<textarea id="remText" rows="4" style="width:100%;border:1px solid var(--line-2);border-radius:12px;padding:8px">${esc(rem.text)}</textarea>
        <div class="note info" style="margin:8px 0">${icon('link', 14)}<span>ينضاف تلقائياً زر «ادفع ${fmt(b.balance)}» بالمحفظة. الرسالة ما تنرسل إلا بموافقتك.</span></div>
        <button class="main" data-a="sendReminder">أرسل للزبون</button>`}</div>`
      : `<button class="main" data-a="draftReminder">${icon('link', 16)} ذكّره برابط دفع بالمحفظة</button>`) : ''}
    ${b.balance > 0 ? `<div class="box"><h4>سجّل تسديد كاش</h4><div style="display:flex;gap:6px"><input id="cashPay" type="number" step="250" placeholder="${fmt(b.balance)}" style="flex:1;border:1.5px solid var(--line-2);border-radius:12px;padding:8px 10px"><button class="btn primary" data-a="cashPay">سجّل</button></div></div>` : ''}
    <div class="box"><h4>الديون المفتوحة</h4>${b.open.length ? b.open.map((d) => `<div class="srcrow"><span>${dateAr(d.date)} · عمره ${d.age} يوم ${d.disputed ? '<span class="tag late">معترض</span>' : d.confirmed ? '<span class="tag ok">مؤكد</span>' : '<span class="tag unconf">غير مؤكد</span>'}<small>${esc(describeItems(L.byId(d.id)))}</small></span><b class="num">${fmt(d.left)}${d.left !== d.amount ? ` <small>من ${fmt(d.amount)}</small>` : ''}</b></div>`).join('') : '<p>ماكو.</p>'}</div>
    <div class="box"><h4>آخر الحركات</h4>${hist.map((t) => `<div class="srcrow"><span>${TYPE_AR[t.type]} · ${dateAr(t.date)}<small>${esc(t.note)}</small></span><b class="num ${t.type === 'payment_in' ? 'pos' : ''}">${fmt(t.amount)}</b></div>`).join('')}</div>
  </div></div>`;
}

function chartSVG(fc) {
  const W = 320, H = 170, pl = 6, pr = 6, pt = 12, pb = 22;
  const s = fc.series;
  const vals = s.flatMap((r) => [r.low, r.high, r.balance]).concat([fc.figures[0].value, 0]);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (i) => W - pr - (i / (s.length)) * (W - pl - pr); // RTL: time runs right→left
  const y = (v) => pt + (1 - (v - min) / (max - min || 1)) * (H - pt - pb);
  const pts = [[0, fc.figures[0].value], ...s.map((r, i) => [i + 1, r.balance])];
  const line = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const band = `M${s.map((r, i) => `${x(i + 1).toFixed(1)},${y(r.high).toFixed(1)}`).join('L')}L${s.slice().reverse().map((r, i) => `${x(s.length - i).toFixed(1)},${y(r.low).toFixed(1)}`).join('L')}Z`;
  const li = s.findIndex((r) => r.date === fc.lowestDate) + 1;
  const ticks = [0, 7, 14, 21, 28].map((i) => `<text x="${x(i)}" y="${H - 6}" font-size="9" fill="#7b7584" text-anchor="middle">${i === 0 ? 'اليوم' : dateAr(addDays(TODAY, i)).split(' ').slice(0, 2).join(' ')}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="توقع الرصيد لـ30 يوم">
    <path d="${band}" fill="#e6daf2" opacity=".7"/>
    ${min < 0 ? `<line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" stroke="#c3283d" stroke-dasharray="4 3" stroke-width="1"/><text x="${pl + 2}" y="${y(0) - 3}" font-size="9" fill="#c3283d">صفر</text>` : ''}
    <path d="${line}" fill="none" stroke="#5b2a86" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="${x(li)}" cy="${y(fc.lowest.balance)}" r="4.5" fill="${fc.lowest.balance < 0 ? '#c3283d' : '#e0287a'}" stroke="#fff" stroke-width="1.5"/>
    ${ticks}</svg>`;
}
function cashScreen() {
  const sc = S.A.scen;
  const fc = L.forecast({ days: 30, scenario: sc });
  const base = L.forecast({ days: 30 });
  const bt = L.backtest();
  const F = (k) => fc.figures.find((f) => f.key === k);
  const changed = sc.collect.length || sc.delaySupplier || sc.salaryDelay;
  return `${appbar('السيولة', 'توقع 30 يوم من الدفتر، مشروح', false)}
  <div class="scroll"><div class="fc">
    <div class="fcbox"><div class="kpis"><div class="kpi"><small>هسه</small><b class="num">${fmt(F('start').value)}</b></div><div class="kpi"><small>أوطأ نقطة (${dateAr(fc.lowestDate)})</small><b class="num ${fc.lowest.balance < 0 ? 'neg' : ''}">${fmt(fc.lowest.balance)}</b></div></div>
      <div class="chart" style="margin-top:8px">${chartSVG(fc)}</div>
      <div class="pnote" style="font-size:11px">الخط = الرصيد المتوقع، والظل = المدى المحتمل. هذا توقع، مو رقم أكيد.</div></div>
    <div class="fcbox"><h4>ليش؟</h4><p>${esc(forecastText(fc))}</p>
      <ul class="drivers">${fc.drivers.map((d) => `<li><span>${esc(d.label)}${d.times > 1 ? ` (${d.times} مرات)` : ''}</span><b class="num">−${fmt(d.amount)}</b></li>`).join('')}</ul></div>
    <div class="fcbox"><h4>شنو لو؟</h4>
      ${fc.pending.map((p) => `<div class="toggle"><span>حصّلت دين ${esc(p.customer)} (${fmt(p.amount)}) باچر</span><button class="sw ${sc.collect.includes(p.cid) ? 'on' : ''}" data-a="scen" data-k="collect" data-id="${p.cid}"></button></div>`).join('')}
      <div class="toggle"><span>أجّلت «${esc(L.payables[0].name)}» أسبوع</span><button class="sw ${sc.delaySupplier ? 'on' : ''}" data-a="scen" data-k="delaySupplier"></button></div>
      <div class="toggle"><span>تأخرت رواتب الموظفين أسبوع</span><button class="sw ${sc.salaryDelay ? 'on' : ''}" data-a="scen" data-k="salaryDelay"></button></div>
      ${changed ? `<div class="note ${fc.lowest.balance > base.lowest.balance ? 'ok' : 'warn'}" style="margin-top:6px">${icon('info', 14)}<span>أوطأ نقطة صارت ${fmt(fc.lowest.balance)} بدل ${fmt(base.lowest.balance)}.</span></div>` : ''}</div>
    <div class="fcbox"><h4>شگد دقيق هالتوقع؟</h4><p>جربناه على آخر 30 يوم كأنها ما صايرة: معدل الخطأ اليومي ${fmt(bt.maeModel)} دينار، مقابل ${fmt(bt.maeNaive)} لو اعتمدنا «نفس معدل الشهر الماضي». يعني أدق بـ${bt.improvement}%.</p></div>
  </div></div>`;
}

// ── sub screens ──
function alertsScreen() {
  const a = L.anomalies().items;
  return `${appbar('التنبيهات', `${a.length} أشياء تحتاج نظرة`)}
  <div class="scroll"><div class="list" style="padding-top:12px">${a.map((x, i) => `<div class="row" style="align-items:stretch"><span class="sev ${x.sev}"></span><span class="t"><b>${esc(x.title)}</b><small style="line-height:1.6;display:block">${esc(x.reason)}</small><small>${dateAr(x.date)}</small>${x.ids.length ? `<div style="margin-top:6px"><button class="btn sm" data-a="alertSrc" data-i="${i}">العمليات (${x.ids.length})</button>${x.kind === 'below_cost' || x.kind === 'price_jump' ? ' <button class="btn sm" data-a="sub" data-k="fx">عدّل السعر</button>' : ''}${x.kind === 'overdue' || x.kind === 'disputed' ? ` <button class="btn sm" data-a="cust" data-id="${x.customer || L.byId(x.ids[0])?.customer}">الزبون</button>` : ''}${x.kind === 'unmatched_in' ? ' <button class="btn sm" data-a="sub" data-k="closing">اربطه</button>' : ''}</div>` : ''}</span></div>`).join('') || '<div class="box"><p>ماكو تنبيهات.</p></div>'}</div></div>`;
}
function closingScreen() {
  const c = S.A.closing;
  const exp = L.closings.at(-1).expected;
  if (c.step === 1) return `${appbar('تسكيرة المساء', 'ثلاث أسئلة، دقيقة وحدة')}<div class="pad">
    <div class="box"><h4>١. كم الكاش بالجرار هسه؟</h4><p>عدّ الفلوس واكتب المجموع.</p><div class="field" style="margin-top:8px"><input id="cntIn" type="number" step="250" value="${esc(c.counted)}" placeholder="مثلاً ${fmt(r250(exp - 15000))}"></div></div>
    <button class="main" data-a="closeNext">التالي</button></div>`;
  if (c.step === 2) return `${appbar('تسكيرة المساء', 'السؤال ٢ من ٣')}<div class="pad">
    <div class="box"><h4>٢. دفعت شي من الجرار اليوم وما سجلته؟</h4><p>مثل غدا للعامل، فكة، أو أجرة نقل.</p>
      <div class="field" style="margin-top:8px"><input id="expIn" type="number" step="250" placeholder="المبلغ (اتركه فارغ إذا ماكو)" value="${esc(c.exp)}"><input id="expNote" placeholder="على شنو؟" value="${esc(c.expNote)}"></div></div>
    <button class="main" data-a="closeNext">التالي</button></div>`;
  if (c.step === 3) return `${appbar('تسكيرة المساء', 'السؤال ٣ من ٣')}<div class="pad">
    <div class="box"><h4>٣. اكو دين انطيته اليوم وما سجلته؟</h4><p>إذا اكو، سجّله بجملة وحدة بالمساعد، مثلاً «سجل على علاوي 2 كيلو تمن».</p>
      <div class="yn" style="margin-top:8px"><button data-a="closeDebt">اي، خليني أسجله</button><button data-a="closeNext">لا، كمّل</button></div></div></div>`;
  const r = c.res;
  const ok = Math.abs(r.diff) <= 1000;
  return `${appbar('تسكيرة المساء', 'النتيجة')}<div class="scroll"><div class="pad">
    <div class="box"><h4>الكاش</h4><div class="srcrow"><span>المتوقع من الدفتر</span><b class="num">${figBtn(r.figures[0])}</b></div><div class="srcrow"><span>اللي عدّيته</span><b class="num">${fmt(r.counted)}</b></div>
      <div class="note ${ok ? 'ok' : r.diff < 0 ? 'bad' : 'warn'}" style="margin-top:8px">${icon(ok ? 'check' : 'info', 14)}<span>${ok ? 'الكاش مطابق.' : `${r.diff < 0 ? 'ناقص' : 'زايد'} ${fmt(Math.abs(r.diff))} دينار. أسباب محتملة: ${r.reasons.join('، ') || '—'}.`}</span></div></div>
    <div class="box"><h4>المحفظة</h4><p>تسديدات هالأسبوع عالمحفظة: ${r.walletIns}، منها ${r.walletMatched} تطابقت تلقائياً مع ديون لأنها جت من رابط دفع.</p>
      ${r.unmatched.map((t) => `<div class="note warn" style="margin-top:8px;flex-direction:column">${icon('info', 14)}<span>تحويل ${fmt(t.amount)} من <span class="ltr">${t.fromPhone || '—'}</span> (${dateAr(t.date)}) ما مربوط بأي زبون.</span>
        <div style="display:flex;gap:6px;width:100%"><select id="um_${t.id}" style="flex:1;border:1px solid var(--line-2);border-radius:8px;padding:4px">${CUSTOMERS.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select><button class="btn sm primary" data-a="linkPay" data-id="${t.id}">اربطه</button></div></div>`).join('')}</div>
    <div class="box"><h4>الدفتر</h4><p>${r.unconfirmed.length} ديون من آخر أسبوعين بعدها ما تأكدت من الزبائن.</p></div>
    <button class="main" data-a="closeDay">سكّر اليوم</button></div></div>`;
}
function weeklyScreen() {
  const w = weeklySummary(L);
  const diff = w.sales.value - w.lastWeek.value;
  const msg = `ملخص الأسبوع – ${SHOP.name}\n• البيع: ${fmt(w.sales.value)} (${diff >= 0 ? 'أكثر' : 'أقل'} من الأسبوع الماضي بـ${fmt(Math.abs(diff))})\n• صافي الربح: ${fmt(w.net.value)}\n• ديون عند الناس: ${fmt(w.debts.value)}\n⚠️ ${w.warn ? w.warn.title : 'ماكو تنبيهات'}\n✅ خطوة وحدة: ${w.act ? `حصّل من ${w.act.name} (${fmt(w.act.balance)})` : '—'}`;
  S.A.weeklyText = msg;
  return `${appbar('ملخص الأسبوع', 'يوصلك كل خميس كرسالة')}<div class="scroll"><div class="pad">
    <div class="kpis"><div class="kpi"><small>البيع هالأسبوع</small><b class="num">${figBtn(w.sales)}</b></div><div class="kpi"><small>صافي الربح</small><b class="num">${figBtn(w.net)}</b></div></div>
    <div class="kpis"><div class="kpi"><small>الأسبوع الماضي</small><b class="num">${figBtn(w.lastWeek)}</b></div><div class="kpi"><small>ديون عند الناس</small><b class="num">${figBtn(w.debts)}</b></div></div>
    ${w.warn ? `<div class="note warn">${icon('alert', 14)}<span><b>تنبيه واحد:</b> ${esc(w.warn.title)}. ${esc(w.warn.reason)}</span></div>` : ''}
    ${w.act ? `<div class="note ok">${icon('check', 14)}<span><b>خطوة وحدة:</b> حصّل من ${esc(w.act.name)} (${fmt(w.act.balance)}).</span></div><button class="ghost" data-a="cust" data-id="${w.act.id}">افتح ${esc(w.act.name)}</button>` : ''}
    <div class="box"><h4>الرسالة</h4><pre style="direction:rtl;text-align:right;font-family:var(--font);font-size:12.5px">${esc(msg)}</pre><button class="btn sm" data-a="copyWeekly" style="margin-top:8px">${icon('copy', 14)} انسخ</button></div>
  </div></div>`;
}
function fxScreen() {
  const f = L.fxImpact({ period: 'last30' });
  const F = (k) => f.figures.find((x) => x.key === k);
  const rows = PRODUCTS.map((p) => { const cost = L.currentCost(p.sku); const m = (p.sell - cost) / p.sell; return { p, cost, m, sug: Math.ceil((cost * 1.12) / 250) * 250 }; }).sort((a, b) => a.m - b.m);
  return `${appbar('الدولار والأسعار', 'آخر 30 يوم')}<div class="scroll"><div class="pad">
    <div class="kpis"><div class="kpi"><small>الدولار قبل 30 يوم</small><b class="num">${fmt(F('rate_from').value)}</b></div><div class="kpi"><small>الدولار هسه</small><b class="num">${fmt(F('rate_to').value)}</b></div></div>
    <div class="box"><p>ارتفاع الدولار كلفك ${figBtn(F('extra'))} دينار زيادة على بضاعة الرافدين (تنشترى بالدولار)، من مشتريات بـ${figBtn(F('usd_buys'))}.</p></div>
    <div class="box"><h4>هامش كل مادة (سعر البيع مقابل آخر كلفة)</h4>
      ${rows.map((r) => `<div class="srcrow"><span>${esc(r.p.name)}<small>كلفة ${fmt(r.cost)} · بيع ${fmt(r.p.sell)}</small></span><span style="text-align:left"><b class="${r.m < 0 ? 'neg' : r.m < 0.1 ? '' : 'pos'}">${Math.round(r.m * 100)}%</b>${r.m < 0.08 ? `<br><button class="btn sm" data-a="setPrice" data-sku="${r.p.sku}" data-v="${r.sug}">خليه ${fmt(r.sug)}</button>` : ''}</span></div>`).join('')}
      <div class="pnote" style="margin-top:6px">السعر المقترح = الكلفة + 12% مقرّب لأقرب 250. القرار إلك.</div></div>
  </div></div>`;
}
function inventoryScreen() {
  const inv = L.inventory({ incoming: incomingOf(S.orders) });
  const tag = { out: '<span class="tag late">خالص</span>', low: '<span class="tag late">قليل</span>', watch: '<span class="tag unconf">انتبه</span>', ok: '<span class="tag ok">كافي</span>' };
  const F = (k) => inv.figures.find((f) => f.key === k);
  return `${appbar('المخزون', 'من الدفتر: الموجود + البضاعة الواصلة − المبيوع')}<div class="scroll"><div class="pad">
    <div class="kpis"><div class="kpi"><small>قيمة المخزون بالكلفة</small><b class="num">${fmt(F('value').value)}</b></div><div class="kpi"><small>مواد قربت تخلص</small><b class="num">${F('low').value}</b></div></div>
    <div class="note info">${icon('info', 14)}<span>كل بيع تسجله ينقص المخزون، وكل طلبية تستلمها وتدفعها تزيده. «يكفي» = الموجود ÷ معدل بيع آخر 7 أيام.</span></div>
    ${inv.rows.sort((a, b) => a.cover - b.cover).map((r) => `<div class="box" style="padding:10px 12px"><div style="display:flex;align-items:center;gap:8px">
      <b style="flex:1;font-size:13px">${esc(r.name)} ${tag[r.status]}</b>${figBtn(inv.figures.find((f) => f.key === 'stock:' + r.sku), fmt(r.stock))}</div>
      <div class="bar" style="height:6px;background:var(--surface-2);border:1px solid var(--line);border-radius:6px;margin:6px 0;overflow:hidden"><i style="display:block;height:100%;width:${Math.min(100, (r.cover / 14) * 100)}%;background:${r.status === 'ok' ? 'var(--ok)' : r.status === 'watch' ? 'var(--warn)' : 'var(--danger)'}"></i></div>
      <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted)"><span>ينباع ${r.perDay} باليوم · يكفي ${r.cover} يوم${r.incoming ? ` · بالطريق ${r.incoming}` : ''}</span><button class="btn sm" data-a="count" data-sku="${r.sku}">جرد</button></div>
      ${S.A.count === r.sku ? `<div style="display:flex;gap:6px;margin-top:8px"><input id="countIn" type="number" placeholder="العدد الفعلي بالرف" style="flex:1;border:1.5px solid var(--line-2);border-radius:10px;padding:6px 8px"><button class="btn sm primary" data-a="saveCount" data-sku="${r.sku}">سجّل</button></div>` : ''}
    </div>`).join('')}
    <button class="ghost" data-a="sub" data-k="sup">${icon('truck', 16)} الموردين والطلبيات</button>
  </div></div>`;
}
function suppliersScreen() {
  const r = L.reorder({ incoming: incomingOf(S.orders) });
  return `${appbar('الموردين', 'طلبيات من المخزون، تنرسل للمورد بمحفظته')}<div class="scroll"><div class="pad">
    ${Object.values(SUPPLIERS).map((sp) => {
      const set = S.supSet[sp.id];
      const orders = S.orders.filter((o) => o.sid === sp.id && o.status !== 'cancelled').slice().reverse();
      const open = orders.find((o) => OPEN.includes(o.status));
      const need = r.bySup[sp.id].filter((i) => i.order > 0);
      return `<div class="box"><h4 style="display:flex;justify-content:space-between;align-items:center">${esc(sp.name)}<small class="muted" style="font-weight:400">${esc(sp.contact)} · يوصل خلال ${sp.lead} يوم</small></h4>
        <div class="toggle" style="border:0;padding-top:0"><span>طلب تلقائي لما مادة تقرب تخلص<small class="muted" style="display:block;font-size:11px">بحد أعلى ${fmt(set.cap)} د.ع للطلبية، وفوگه يطلب موافقتك</small></span><button class="sw ${set.auto ? 'on' : ''}" data-a="setAuto" data-id="${sp.id}"></button></div>
        ${set.auto ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">${[500000, 1000000, 2000000, 3000000].map((c) => `<button class="chip ${set.cap === c ? 'on' : ''}" data-a="setCap" data-id="${sp.id}" data-v="${c}">${fmt(c)}</button>`).join('')}</div>` : ''}
        ${orders.slice(0, 3).map((o) => orderCard(o)).join('')}
        ${!open && need.length ? `<div class="pnote" style="margin:6px 0">مقترح حسب المخزون: ${need.map((i) => `${esc(i.name)} ${i.order}`).join('، ')}</div><button class="btn sm primary" data-a="manualOrder" data-id="${sp.id}">أرسل هالطلبية</button>` : ''}
        ${!open && !need.length ? '<div class="pnote">المخزون من هالمورد كافي.</div>' : ''}
      </div>`;
    }).join('')}
  </div></div>`;
}
function orderCard(o) {
  const val = orderValue(o, L);
  const col = o.status === 'paid' ? 'ok' : o.status === 'rejected' ? 'bad' : o.status === 'draft' || o.status === 'delivered' ? 'warn' : 'info';
  return `<div class="note ${col}" style="flex-direction:column;gap:6px;margin-top:6px"><div style="display:flex;justify-content:space-between;width:100%"><b>${o.id}${o.auto ? ' · تلقائية' : ''}</b><span>${STATUS_AR[o.status]}</span></div>
    <span>${esc(describeOrder(o))}</span>${o.reason && o.status === 'draft' ? `<span style="font-size:11px">السبب: ${esc(o.reason)}${o.overCap ? ' · أكثر من حد الطلب التلقائي' : ''}</span>` : ''}
    ${o.note ? `<span style="font-size:11px">${esc(o.note)}</span>` : ''}
    <span class="num" style="font-size:11.5px">${o.status === 'delivered' || o.status === 'paid' ? 'الفاتورة' : 'تقريباً'}: ${fmt(val)} د.ع</span>
    ${o.status === 'draft' ? `<div style="display:flex;gap:6px;width:100%"><button class="btn sm primary" data-a="sendDraft" data-id="${o.id}">وافق وأرسل</button><button class="btn sm" data-a="cancelOrder" data-id="${o.id}">إلغاء</button></div>` : ''}
    ${o.status === 'delivered' ? `<div style="display:flex;gap:6px;width:100%"><button class="btn sm primary" data-a="payInv" data-id="${o.id}" data-ch="wallet">ادفع بالمحفظة</button><button class="btn sm" data-a="payInv" data-id="${o.id}" data-ch="cash">دفعت كاش</button></div>` : ''}
  </div>`;
}
function notebookSVG() {
  const lines = ['أبو حسين — ٢ كارتون ببسي — ١٨٠٠٠', 'أم مريم — طبقة بيض — ٥٥٠٠', 'سيد جا… — ٥ تمن — ؟؟', 'علاوي — ٢ باكيت جگاير — ٧٠٠٠'];
  return `<svg viewBox="0 0 300 200" style="width:100%;border-radius:12px;border:1px solid var(--line)"><rect width="300" height="200" fill="#fffdf4"/>${[40, 80, 120, 160].map((y) => `<line x1="10" x2="290" y1="${y + 8}" y2="${y + 8}" stroke="#bcd3ea" stroke-width="1"/>`).join('')}<line x1="270" x2="270" y1="0" y2="200" stroke="#f2b8b8"/>
    ${lines.map((l, i) => `<text x="262" y="${40 + i * 40}" font-size="13" fill="#1f3b8a" direction="rtl" text-anchor="start" font-family="'Segoe Script', 'Comic Sans MS', cursive" transform="rotate(${(i % 2 ? 0.8 : -0.6)} 150 ${40 + i * 40})" opacity="${i === 2 ? 0.55 : 0.92}">${l}</text>`).join('')}</svg>`;
}
function notebookScreen() {
  const nb = S.A.nb;
  return `${appbar('اقرأ صفحة دفتر', 'من الدفتر الورقي للدفتر الرقمي')}<div class="scroll"><div class="pad">
    ${nb.img ? `<img src="${nb.img}" style="width:100%;border-radius:12px;border:1px solid var(--line)">` : notebookSVG()}
    <div style="display:flex;gap:6px"><button class="ghost" data-a="nbSample">استخدم الصفحة التجريبية</button><button class="ghost" data-a="nbUpload">${icon('camera', 16)} صوّر صفحة</button></div>
    ${nb.busy ? '<div class="note info">جاري القراءة…</div>' : ''}${nb.err ? `<div class="note warn">${icon('info', 14)}<span>${esc(nb.err)}</span></div>` : ''}
    ${nb.entries ? `<div class="box"><h4>اللي قريته <span class="src ${nb.source === 'gemini' ? 'g' : 't'}">${nb.source === 'gemini' ? 'Gemini' : 'قراءة تجريبية جاهزة'}</span></h4><p style="margin-bottom:8px">كل حقل وياه نسبة ثقة. أقل من ${Math.round(CONF_MIN * 100)}% ينعلم بالأحمر ولازم تأكده. الحقل اللي ما انقرا يبقى فارغ، ما نخمنه.</p>
      <div style="display:flex;flex-direction:column;gap:6px">${nb.entries.map((e) => nbLine(e)).join('')}</div>
      <button class="main" style="margin-top:10px" data-a="nbSave">احفظ السطور المأكدة (${nb.entries.filter((e) => e.ok && !e.saved).length})</button></div>` : ''}
  </div></div>`;
}
const confTag = (v) => `<span class="conf ${v >= CONF_MIN ? 'hi' : 'lo'}">${Math.round((v || 0) * 100)}%</span>`;
function nbLine(e) {
  if (e.saved) return `<div class="nbline"><span>${icon('check', 14)} انحفظ</span><span>${esc(customerById(e.customer)?.name || '')} · ${fmt(e.amount)}</span></div>`;
  const l = e.line;
  return `<div class="nbline ${e.ok ? '' : 'flag'}">
    <span>الاسم ${confTag(l.customer_conf)}</span><select data-nb="${e.i}" data-f="customer"><option value="">؟</option>${CUSTOMERS.map((c) => `<option value="${c.id}" ${e.customer === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}</select>
    <span>المادة ${confTag(l.item_conf)}</span><select data-nb="${e.i}" data-f="sku"><option value="">؟</option>${PRODUCTS.map((p) => `<option value="${p.sku}" ${e.sku === p.sku ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
    <span>الكمية ${confTag(l.qty_conf)}</span><input data-nb="${e.i}" data-f="qty" type="number" value="${e.qty || ''}">
    <span>المبلغ ${confTag(l.amount_conf)}</span><input data-nb="${e.i}" data-f="amount" type="number" step="250" value="${e.amount || ''}" placeholder="؟">
  </div>`;
}

function renderA() {
  FIGS.clear();
  const A = S.A;
  let body;
  if (A.sub) body = { alerts: alertsScreen, closing: closingScreen, weekly: weeklyScreen, fx: fxScreen, inventory: inventoryScreen, sup: suppliersScreen, notebook: notebookScreen, cust: custScreen }[A.sub]();
  else body = { home: homeScreen, chat: chatScreen, book: bookScreen, debts: debtsScreen, cash: cashScreen }[A.tab]();
  const focused = document.activeElement?.id === 'chatIn';
  const app = $('#appA');
  const keep = app.querySelector('.scroll')?.scrollTop || 0;
  const sameView = app.dataset.view === (A.sub || A.tab);
  app.innerHTML = body + bnav() + (A.sheet ? sheetHTML(A.sheet) : '') + (A.toast ? toastHTML(A.toast) : '');
  app.dataset.view = A.sub || A.tab;
  if (sameView) { const sc = app.querySelector('.scroll'); if (sc) sc.scrollTop = keep; }
  const cb = document.getElementById('chatBox'); if (cb) cb.scrollTop = cb.scrollHeight;
  if (focused) { const i = document.getElementById('chatIn'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }
  statusA(!A.sub && A.tab === 'home');
}
const toastHTML = (t) => `<div class="ptoast ${t.ok ? 'ok' : ''}"><span class="ic">${icon(t.icon || 'bell', 16)}</span><span>${esc(t.text)}<small>${esc(t.sub || '')}</small></span></div>`;
function toastA(text, sub, o = {}) { S.A.toast = { text, sub, ...o }; renderA(); clearTimeout(toastA.t); toastA.t = setTimeout(() => { S.A.toast = null; renderA(); }, 3200); }
function toastB(text, sub, o = {}) { S.B.toast = { text, sub, ...o }; renderB(); clearTimeout(toastB.t); toastB.t = setTimeout(() => { S.B.toast = null; renderB(); }, o.long ? 6000 : 3200); }

// ── sheets (in phone A) ──
function sheetHTML(sh) {
  if (sh.kind === 'pin') {
    const o = S.orders.find((x) => x.id === sh.order);
    return `<div class="sheet-bg" data-a="closeSheet"><div class="sheet"><div class="grab"></div><div class="sh"><b>${icon('lock', 16)} تأكيد الدفع</b><button class="btn sm" data-a="closeSheet">إلغاء</button></div>
      <div class="sb"><p>ادفع <b class="num">${fmt(orderValue(o, L))} د.ع</b> لـ${esc(SUPPLIERS[o.sid].short)} ${sh.ch === 'wallet' ? 'من المحفظة' : 'كاش'}.</p>
      <div class="pnote">أي فلوس تطلع من المحل تحتاج رمزك، حتى لو الوكيل هو اللي جهّز العملية.</div>
      <input id="pinIn" type="password" inputmode="numeric" maxlength="4" placeholder="••••" style="width:100%;text-align:center;letter-spacing:12px;font-size:24px;border:1.5px solid var(--line-2);border-radius:12px;padding:10px;margin:10px 0">
      <button class="main" data-a="pinOk">ادفع</button><div class="pnote" style="text-align:center">للتجربة: 1234</div></div></div></div>`;
  }
  if (sh.kind === 'fig') {
    const f = sh.fig; const txs = f.ids.map((id) => L.byId(id)).filter(Boolean);
    const total = txs.reduce((a, t) => a + t.amount, 0);
    const shown = txs.slice(-40).reverse();
    return `<div class="sheet-bg" data-a="closeSheet"><div class="sheet"><div class="grab"></div><div class="sh"><b>${esc(f.label)}: ${fmt(f.value)}</b><button class="btn sm" data-a="closeSheet">سد</button></div>
      <div class="sb"><div class="pnote">هذا الرقم محسوب من ${txs.length} قيد بالدفتر${txs.length > 40 ? ' (معروض آخر 40)' : ''}:</div>
      ${shown.map((t) => `<div class="srcrow"><span>${esc(TYPE_AR[t.type])} · ${dateAr(t.date)}<small>${esc(t.customer ? customerById(t.customer)?.name + ' · ' : '')}${esc(t.note || '')} · ${t.id}</small></span><b class="num">${fmt(t.amount)}</b></div>`).join('')}
      ${total === Math.abs(f.value) ? `<div class="check">${icon('check', 14)} مجموع هالقيود = ${fmt(total)}، يطابق الرقم بالضبط.</div>` : `<div class="pnote">الرقم يطلع من هالقيود بعد حساب الكلفة أو المصاريف أو التسديدات، مو جمع مباشر لمبالغها.</div>`}</div></div></div>`;
  }
  if (sh.kind === 'tx') {
    const t = L.byId(sh.id); const c = t.customer ? customerById(t.customer) : null;
    return `<div class="sheet-bg" data-a="closeSheet"><div class="sheet"><div class="grab"></div><div class="sh"><b>${esc(TYPE_AR[t.type])} · ${fmt(t.amount)} د.ع</b><button class="btn sm" data-a="closeSheet">سد</button></div>
      <div class="sb"><div class="srcrow"><span>التاريخ</span><b>${dateAr(t.date)}</b></div><div class="srcrow"><span>الطريقة</span><b>${CH_AR[t.channel] || 'تحويل'}</b></div>
      ${c ? `<div class="srcrow"><span>الزبون</span><b>${esc(c.name)}</b></div>` : ''}${t.supplier ? `<div class="srcrow"><span>المورد</span><b>${esc(SUPPLIERS[t.supplier].name)}</b></div>` : ''}
      ${(t.items || []).filter((i) => i.qty).map((i) => `<div class="srcrow"><span>${esc(productBySku(i.sku).name)} × ${i.qty}<small>بيع ${fmt(i.price)} · كلفة ${fmt(i.cost)}</small></span><b class="num">${fmt(i.qty * i.price)}</b></div>`).join('')}
      ${t.debtRef ? `<div class="check">${icon('link', 14)} جا من رابط دفع، وتطابق تلقائياً مع دين ${t.debtRef}.</div>` : ''}
      <div class="pnote">رقم القيد: ${t.id}${t.fx ? ` · سعر الدولار يومها ${fmt(t.fx)}` : ''}</div></div></div></div>`;
  }
  if (sh.kind === 'add') {
    const d = sh.d;
    return `<div class="sheet-bg" data-a="closeSheet"><div class="sheet"><div class="grab"></div><div class="sh"><b>قيد جديد</b><button class="btn sm" data-a="closeSheet">سد</button></div>
      <div class="sb"><div class="field">النوع<select id="qa_type">${['sale', 'credit_sale', 'payment_in', 'expense'].map((t) => `<option value="${t}" ${d.type === t ? 'selected' : ''}>${TYPE_AR[t]}</option>`).join('')}</select></div>
      ${['credit_sale', 'payment_in'].includes(d.type) ? `<div class="field">الزبون<select id="qa_cust">${CUSTOMERS.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select></div>` : ''}
      ${['sale', 'credit_sale'].includes(d.type) ? `<div class="field">المادة<select id="qa_sku">${PRODUCTS.map((p) => `<option value="${p.sku}">${p.name} (${fmt(p.sell)})</option>`).join('')}</select></div><div class="field">الكمية<input id="qa_qty" type="number" min="1" value="1"></div>`
        : `<div class="field">المبلغ<input id="qa_amt" type="number" step="250"></div>`}
      ${d.type === 'expense' ? `<div class="field">على شنو<input id="qa_note" placeholder="مثلاً: أجرة نقل"></div>` : ''}
      ${d.type !== 'credit_sale' ? `<div class="field">الطريقة<select id="qa_ch"><option value="cash">كاش</option><option value="wallet">محفظة</option></select></div>` : ''}
      <button class="main" data-a="qaSave">احفظ</button></div></div></div>`;
  }
  return '';
}

// ═════════════ PHONE B: customer wallet ═════════════
function renderB() {
  $('#sbB').innerHTML = `<span>${hhmm()}</span>${sbIcons}`;
  if (S.B.mode === 'sup') return renderSupplier();
  const cid = S.B.cid, c = customerById(cid), b = L.debtBook()[cid];
  const notes = S.notes.filter((n) => n.cid === cid).slice().reverse();
  const card = (n) => {
    if (n.kind === 'confirm') return `<div class="ncard ${n.status === 'new' ? 'hl' : ''}"><div class="h"><span class="av">${icon('book', 16)}</span><b>${SHOP.name} سجّل عليك دين</b><small>${esc(n.time)}</small></div><p>${esc(n.text)} = <b>${fmt(n.amount)} د.ع</b></p>
      ${n.status === 'new' ? `<div class="acts"><button class="go" data-b="confirm" data-id="${n.id}">صحيح، أأكد</button><button data-b="dispute" data-id="${n.id}">مو صحيح</button></div>` : `<div class="state ${n.status === 'disputed' ? 'neg' : 'pos'}">${n.status === 'disputed' ? 'اعترضت على هذا الدين' : 'أكدت الدين ✓'}</div>`}</div>`;
    if (n.kind === 'reminder') return `<div class="ncard ${n.status === 'new' ? 'hl' : ''}"><div class="h"><span class="av">${icon('bell', 16)}</span><b>تذكير من ${SHOP.name}</b><small>${esc(n.time)}</small></div><p>${esc(n.text)}</p>
      ${n.status === 'new' && b.balance > 0 ? `<div class="acts"><button class="go" data-b="pay" data-amt="${b.balance}">ادفع ${fmt(b.balance)}</button><button data-b="pay" data-amt="">ادفع جزء</button></div>` : `<div class="state pos">${n.status === 'paid' ? 'انسدد ✓' : ''}</div>`}</div>`;
    return `<div class="ncard"><div class="h"><span class="av">${icon('check', 16)}</span><b>${esc(n.title || 'إيصال')}</b><small>${esc(n.time)}</small></div><p>${esc(n.text)}</p></div>`;
  };
  $('#appB').innerHTML = `<div class="scroll"><div class="whero"><small>محفظتي · ${esc(c.full)}</small><div class="bal num">${fmt(S.bal[cid])}<span>د.ع</span></div></div>
    <div class="shopdebt"><div class="top"><span class="av">${initials(SHOP.owner)}</span><span style="flex:1"><b>${SHOP.name}</b><small>${b.balance ? `بذمتك ${fmt(b.balance)} د.ع` : 'ما بذمتك شي'}</small></span>${b.balance ? `<button class="btn sm primary" data-b="pay" data-amt="${b.balance}">ادفع</button>` : ''}</div>
      ${b.open.length ? `<div style="margin-top:8px">${b.open.slice(-3).map((d) => `<div class="srcrow"><span>${dateAr(d.date)}<small>${esc(describeItems(L.byId(d.id)))}</small></span><b class="num">${fmt(d.left)}</b></div>`).join('')}</div>` : ''}</div>
    <div class="sec">الإشعارات</div><div class="list">${notes.map(card).join('') || '<div class="ncard"><p>ماكو إشعارات.</p></div>'}</div></div>
    ${S.B.sheet ? `<div class="sheet-bg" data-b="closeSheet"><div class="sheet"><div class="grab"></div><div class="sh"><b>ادفع لـ${SHOP.name}</b><button class="btn sm" data-b="closeSheet">سد</button></div>
      <div class="sb"><div class="field">المبلغ<input id="payAmt" type="number" step="250" value="${S.B.sheet.amt || ''}" placeholder="${fmt(b.balance)}"></div><div class="pnote">رصيدك ${fmt(S.bal[cid])} د.ع. الدفعة توصل للمحل ومعها رقم الدين، فتتطابق وحدها.</div>
      <button class="main" data-b="payGo">ادفع</button></div></div></div>` : ''}
    ${S.B.toast ? toastHTML(S.B.toast) : ''}`;
}
function renderSupplier() {
  const sp = SUPPLIERS[S.B.sid];
  const orders = S.orders.filter((o) => o.sid === sp.id && o.status !== 'draft' && o.status !== 'cancelled').slice().reverse();
  const card = (o) => {
    const items = o.items.map((i) => {
      const p = productBySku(i.sku);
      if (S.B.edit === o.id) return `<div class="srcrow"><span>${esc(p.name)}<small>طلب ${i.qty}</small></span><input data-sq="${i.sku}" type="number" min="0" value="${i.accepted ?? i.qty}" style="width:80px;border:1px solid var(--line-2);border-radius:8px;padding:3px 6px"></div>`;
      if (S.B.deliver === o.id) return `<div class="srcrow"><span>${esc(p.name)} × ${i.accepted ?? i.qty}<small>سعر الوحدة</small></span><input data-sp="${i.sku}" type="number" step="250" value="${i.price ?? L.currentCost(i.sku)}" style="width:90px;border:1px solid var(--line-2);border-radius:8px;padding:3px 6px"></div>`;
      return `<div class="srcrow"><span>${esc(p.name)}</span><b class="num">${i.accepted ?? i.qty}${i.accepted != null && i.accepted !== i.qty ? ` <small>من ${i.qty}</small>` : ''}</b></div>`;
    }).join('');
    let acts = '';
    if (o.status === 'sent') acts = S.B.edit === o.id ? `<div class="acts"><button class="go" data-b="supSaveEdit" data-id="${o.id}">وافق بالكميات هاي</button><button data-b="supCancelEdit">رجوع</button></div>`
      : `<div class="acts"><button class="go" data-b="supAccept" data-id="${o.id}">قبول</button><button data-b="supEdit" data-id="${o.id}">تعديل الكميات</button><button data-b="supReject" data-id="${o.id}">رفض</button></div>`;
    if (o.status === 'accepted') acts = S.B.deliver === o.id ? `<div class="acts"><button class="go" data-b="supDeliverGo" data-id="${o.id}">سلّمت، أرسل الفاتورة</button><button data-b="supCancelEdit">رجوع</button></div>` : `<div class="acts"><button class="go" data-b="supDeliver" data-id="${o.id}">جهّزت الطلبية، سلّمها</button></div>`;
    const st = { delivered: `بانتظار دفع ${fmt(orderValue(o, L))} د.ع`, paid: `وصلت الدفعة ✓ ${fmt(orderValue(o, L))} د.ع`, rejected: 'رفضت الطلبية', accepted: 'وافقت، بانتظار التسليم' }[o.status] || '';
    return `<div class="ncard ${o.status === 'sent' ? 'hl' : ''}"><div class="h"><span class="av">${icon('truck', 16)}</span><b>طلبية ${o.id} من ${SHOP.name}${o.auto ? ' <span class="tag info">تلقائية</span>' : ''}</b><small>${o.status === 'sent' ? 'جديدة' : ''}</small></div>
      <p style="white-space:pre-wrap;font-size:12px">${esc(o.text)}</p>${items}${st ? `<div class="state ${o.status === 'rejected' ? 'neg' : 'pos'}" style="margin-top:6px">${st}</div>` : ''}${acts ? `<div style="margin-top:8px">${acts}</div>` : ''}</div>`;
  };
  $('#appB').innerHTML = `<div class="scroll"><div class="whero" style="background:linear-gradient(160deg,#1f5e4a 0%,#123a2e 100%)"><small>محفظة الأعمال · ${esc(sp.name)}</small><div class="bal num">${fmt(S.supBal[sp.id])}<span>د.ع</span></div></div>
    <div class="sec">الطلبات</div><div class="list">${orders.map(card).join('') || '<div class="ncard"><p>ماكو طلبات من المحلات هسه.</p></div>'}</div></div>${S.B.toast ? toastHTML(S.B.toast) : ''}`;
}
function renderCustSel() { $('#custSel').innerHTML = `<optgroup label="الزبائن">${CUSTOMERS.map((c) => { const n = S.notes.filter((x) => x.cid === c.id && x.status === 'new').length; return `<option value="c:${c.id}" ${S.B.mode === 'cust' && S.B.cid === c.id ? 'selected' : ''}>${c.name}${n ? ` (${n})` : ''}</option>`; }).join('')}</optgroup>
  <optgroup label="الموردين">${Object.values(SUPPLIERS).map((sp) => { const n = S.orders.filter((o) => o.sid === sp.id && o.status === 'sent').length; return `<option value="s:${sp.id}" ${S.B.mode === 'sup' && S.B.sid === sp.id ? 'selected' : ''}>${sp.short}${n ? ` (${n})` : ''}</option>`; }).join('')}</optgroup>`; }

// ═════════════ PANEL ═════════════
const TABS = [['flow', 'مخطط العمل'], ['trace', 'خطوات الوكيل'], ['audit', 'سجل التدقيق'], ['events', 'أحداث المحفظة'], ['eval', 'التقييم'], ['data', 'البيانات'], ['how', 'شلون يشتغل']];
function renderPanel() {
  $('#tabs').innerHTML = TABS.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-p="tab" data-k="${k}">${l}${k === 'flow' && S.flow.fresh && S.tab !== 'flow' ? '<span class="cnt live">جديد</span>' : ''}${k === 'audit' && S.audit.length ? `<span class="cnt">${S.audit.length}</span>` : ''}${k === 'trace' && S.runs.length ? `<span class="cnt">${S.runs.length}</span>` : ''}${k === 'events' && S.events.length ? `<span class="cnt">${S.events.length}</span>` : ''}</button>`).join('');
  if (S.tab !== 'flow') flowStop(); else S.flow.fresh = false;
  if (S.flow.zoom) { const z = document.querySelector('#flowZoomBody'); if (z) z.innerHTML = flowInner(true); else S.flow.zoom = false; }
  $('#panelBody').innerHTML = { flow: panelFlow, audit: panelAudit, trace: panelTrace, events: panelEvents, eval: panelEval, data: panelData, how: panelHow }[S.tab]();
}
// ── workflow diagram ──
function flowMark(key, id, note) {
  const i = FLOWS[key].steps.findIndex((x) => x.id === id);
  const F = S.flow; F.live[key] = i; F.note[key] = note; F.key = key; F.sel = -1; F.fresh = true; flowStop();
  renderPanel();
}
function flowStop() { clearInterval(S.flow?.timer); if (S.flow) { S.flow.timer = null; } }
function flowPlay() {
  const F = S.flow; if (F.timer) { flowStop(); renderPanel(); return; }
  const n = FLOWS[F.key].steps.length; F.sel = F.sel >= n - 1 ? 0 : Math.max(0, F.sel + (F.sel < 0 ? 1 : 0)); renderPanel();
  F.timer = setInterval(() => { if (F.sel >= n - 1) { flowStop(); renderPanel(); return; } F.sel++; renderPanel(); }, 1800);
  renderPanel();
}
function flowInner(big) {
  const F = S.flow, fl = FLOWS[F.key], live = F.live[F.key];
  const cur = F.sel >= 0 ? F.sel : live;
  const st = cur >= 0 ? fl.steps[cur] : null;
  const lane = st ? LANES[st.lane] : null;
  const legend = `<div class="flegend"><span><i class="k sel"></i>الخطوة المختارة</span><span><i class="k done"></i>صارت بالتطبيق</span><span><i class="k live"></i>آخر خطوة صارت</span><span><i class="k dec"></i>قرار</span></div>`;
  return `${live >= 0 ? `<div class="flive">${icon('check', 14)}<span><b>صار هسه بالتطبيق:</b> ${esc(F.note[F.key] || '')} · وصل للخطوة ${live + 1} من ${fl.steps.length}</span></div>` : ''}
    <div class="fexp">${st ? `<div class="fexp-h"><span class="fnum" style="background:${F.sel >= 0 ? '#5b2a86' : '#e0287a'}">${cur + 1}</span><b>${esc(st.t.replace('|', ' '))}</b><span class="flane" style="color:${lane.color};border-color:${lane.color}">${lane.title}</span></div><p>${esc(st.x)}</p><small class="muted">وين تشوفها: ${esc(st.where)}</small>`
      : '<p>اضغط <b>شغّل</b> حتى تمشي الخطوات وحدة وحدة، أو اضغط أي مربع حتى تشوف شرحه. أي شي تسويه بالهاتفين يتلوّن هنا.</p>'}</div>
    <div class="fsvgwrap ${big ? 'big' : ''}">${flowSVG(F.key, { sel: F.sel, live })}</div>
    ${legend}`;
}
function panelFlow() {
  const F = S.flow, fl = FLOWS[F.key], n = fl.steps.length;
  return `<div class="flow">
    <div class="fhead"><div class="seg">${Object.entries(FLOWS).map(([k, f]) => `<button class="${F.key === k ? 'on' : ''}" data-p="flowKey" data-k="${k}">${f.title}${F.live[k] >= 0 ? ' <i class="ldot"></i>' : ''}</button>`).join('')}</div>
      <div class="fctl"><button class="btn sm" data-p="flowPrev" ${F.sel <= 0 ? 'disabled' : ''} aria-label="السابق">›</button><button class="btn sm primary" data-p="flowPlay">${F.timer ? '⏸ وقف' : '▶ شغّل'}</button><button class="btn sm" data-p="flowNext" ${F.sel >= n - 1 ? 'disabled' : ''} aria-label="التالي">‹</button>
      <button class="btn sm" data-p="flowTry">${esc(fl.try.label)}</button><button class="btn sm" data-p="flowZoom">تكبير</button></div></div>
    ${flowInner(false)}</div>`;
}
const srcTag = (s) => `<span class="src ${s === 'gemini' ? 'g' : s === 'offline' ? 'o' : 't'}">${s === 'gemini' ? 'Gemini' : s === 'offline' ? 'بدون نموذج' : 'قالب'}</span>`;
function panelTrace() {
  if (!S.runs.length) return `<div class="empty">اسأل المساعد بهاتف صاحب المحل.<br>هنا تشوف: شلون انفهم السؤال، أي أداة اشتغلت، الأرقام اللي حسبتها،<br>وهل جواب النموذج اجتاز التحقق من الأرقام.</div>`;
  return S.runs.map((r) => `<div class="run"><div class="rh"><b>«${esc(r.q)}»</b><span class="src">${r.ms} ms</span></div>
    ${r.trace.map((t) => {
      if (t.step === 'فهم السؤال') return `<div class="step"><span class="k">١. فهم السؤال</span><div>${srcTag(t.source)} ${t.ms ? `<span class="muted">${t.ms} ms</span>` : ''}${t.fallback ? ` <span class="tag unconf">رجعنا للمحلل الثابت: ${esc(t.fallback)}</span>` : ''}<pre>${esc(JSON.stringify(t.detail))}</pre></div></div>`;
      if (t.step === 'وكيل') {
        if (t.kind === 'start') return `<div class="step"><span class="k">وكيل</span><div><span class="tag info">سؤال مفتوح</span> ${esc(t.note)} · حد أقصى ${MAX_STEPS} خطوات</div></div>`;
        if (t.kind === 'tool') return `<div class="step"><span class="k">أداة</span><div>${srcTag(t.source === 'gemini' ? 'gemini' : 'offline')} ${t.thought ? `<span class="muted">«${esc(t.thought)}»</span><br>` : ''}<code>${esc(t.tool)}(${esc(JSON.stringify(t.args || {}))})</code><table class="tbl" style="margin-top:6px">${(t.figures || []).slice(0, 6).map((f) => `<tr><td>${esc(f.label)}</td><td class="num">${fmt(f.value)}</td></tr>`).join('')}</table></div></div>`;
        if (t.kind === 'blocked') return `<div class="step"><span class="k">انمنع</span><div><span class="tag late">${esc(t.tool)}</span> ${esc(t.note)}</div></div>`;
        if (t.kind === 'final') return `<div class="step"><span class="k">الجواب</span><div>${t.source === 'gemini' ? (t.accepted ? '<span class="tag ok">كل رقم رجعته أداة</span>' : `<span class="tag late">انرفض: ${esc((t.problems || [])[0] || '')}</span>`) : `<span class="tag unconf">${esc(t.note || 'سير عمل ثابت')}</span>`}</div></div>`;
        if (t.kind === 'error') return `<div class="step"><span class="k">خطأ</span><div>${esc(t.note)}</div></div>`;
        return '';
      }
      if (t.step === 'الخصوصية') return `<div class="step"><span class="k">الخصوصية</span><div><span class="tag ok">الأسماء مخفية</span> اللي وصل للنموذج: <code>${esc(t.sent)}</code></div></div>`;
      if (t.step === 'الأداة') return `<div class="step"><span class="k">٢. الحساب</span><div><code>${t.tool}(${esc(JSON.stringify(t.args || {}))})</code><table class="tbl" style="margin-top:6px">${t.figures.map((f) => `<tr><td>${esc(f.label)}</td><td class="n">${fmt(f.value)}</td><td class="muted" style="font-size:11px">${f.n} قيد</td></tr>`).join('')}</table></div></div>`;
      if (t.step === 'صياغة الجواب') return `<div class="step"><span class="k">٣. الصياغة</span><div>${srcTag(t.source)} ${t.error ? `<span class="tag late">${esc(t.error)}</span>` : t.accepted ? '<span class="tag ok">اجتاز التحقق</span>' : `<span class="tag late">انرفض</span> ${t.problems.map(esc).join('، ')}`}${t.draft ? `<pre style="direction:rtl;text-align:right;font-family:var(--font)">${esc(t.draft)}</pre>` : ''}</div></div>`;
      if (t.step === 'التحقق') return `<div class="step"><span class="k">٤. الجواب النهائي</span><div>${srcTag(t.answerSource)} ${t.ok ? '<span class="tag ok">كل رقم موجود بنتيجة الحساب</span>' : ''}</div></div>`;
      if (t.step === 'قيد') return `<div class="step"><span class="k">قيد جديد</span><div>${srcTag(t.source)}${t.fallback ? ` <span class="tag unconf">${esc(t.fallback)}</span>` : ''}<pre>${esc(JSON.stringify(t.entry))}</pre></div></div>`;
      return '';
    }).join('')}</div>`).join('');
}
function panelAudit() {
  const tiers = `<div class="tiers"><div><b>قراءة</b><span>أسئلة وتحليل: حرّة، والوكيل يقرا بس</span></div><div><b>تسجيل وإرسال</b><span>قيد أو تذكير أو طلبية: بطاقة تأكيد من التاجر</span></div><div><b>حركة فلوس</b><span>دفع لمورد: رمز PIN دائماً</span></div><div><b>تلقائي</b><span>طلبية مورد بس، وتحت حد يحدده التاجر</span></div></div>`;
  if (!S.audit.length) return `${tiers}<div class="empty">كل عملية تكتب بالدفتر أو تطلع للزبون أو المورد تنسجل هنا: منو سواها، وبأي نموذج، وبأي مستوى صلاحية. وتگدر تتراجع عنها خلال 5 دقايق.</div>`;
  const now = Date.now();
  return `${tiers}<table class="tbl audit"><tr><th>الوقت</th><th>العملية</th><th>منو</th><th>الصلاحية</th><th></th></tr>${S.audit.map((a) => `<tr class="${a.status}"><td class="num">${a.time}</td><td><b>${esc(a.action)}</b><br><small>${esc(a.detail)}</small>${a.model && a.model !== '—' ? `<br><small class="muted">${esc(a.model)}</small>` : ''}</td><td><small>${esc(a.by)}</small></td><td><small>${esc(a.tier || '')}</small></td><td>${a.status === 'undone' ? '<span class="tag late">تراجعت</span>' : a.undo && now - a.at < UNDO_MS ? `<button class="btn sm" data-p="undo" data-id="${a.id}">تراجع</button>` : ''}</td></tr>`).join('')}</table>`;
}
function panelEvents() {
  if (!S.events.length) return `<div class="empty">هنا تظهر الأحداث بين المحل والزبون: تأكيد دين، اعتراض، تذكير، تسديد برابط دفع، ومطابقة تلقائية.</div>`;
  return S.events.map((e) => `<div class="evt"><time>${e.time}</time><span>${esc(e.text)}</span></div>`).join('');
}
function panelEval() {
  const o = S.evalOff, s = S.evalShops, g = S.evalLLM;
  const pct = (a, b) => `${Math.round((a / b) * 100)}%`;
  const m = (label, a, b, note) => `<div class="metric"><small>${label}</small><b class="num">${pct(a, b)}</b><em>${a} من ${b}${note ? ' · ' + note : ''}</em></div>`;
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><div><b>قياس على بيانات معروفة الجواب</b><div class="pnote">الجواب الصحيح ينحسب بكود منفصل مباشرة من القيود، مو من أدوات المساعد.</div></div>
    <div style="display:flex;gap:6px"><button class="btn primary sm" data-p="evalOff">${o ? 'أعد' : 'شغّل'} (بدون نموذج)</button><button class="btn sm" data-p="evalLLM" ${llmStatus().ok && !S.evalBusy ? '' : 'disabled'} title="يأخذ حوالي 8 دقايق حتى ما يتجاوز حد الاستخدام المجاني">شغّل بـGemini (~8 د)</button></div></div>
  ${S.evalBusy ? `<div class="progress"><i style="width:${S.evalProg}%"></i></div><div class="pnote">جاري التشغيل بـGemini… ${S.evalProg}%</div>` : ''}
  ${o ? `<div class="subh">المساعد بدون نموذج (المحلل الثابت)</div><div class="metrics">
      ${m('أسئلة التطوير: الرقم صحيح بالضبط', o.qa.ok, o.qa.n)}${m('أسئلة محجوبة (ما انضبط عليها)', o.held.ok, o.held.n)}${m('5 صيغ لنفس السؤال', o.para.ok, o.para.n, `${o.para.consistentGroups}/${o.para.groups.length} مجموعات متسقة`)}
      ${m('يرفض لما ماكو بيانات', o.refuse.ok, o.refuse.n)}${m('تسجيل قيد من جملة', o.entries.ok, o.entries.n, `دقة الحقول ${Math.round(o.entries.fieldAcc * 100)}%`)}</div>
    ${o.held.rows.filter((r) => !r.ok).length ? `<div class="pnote">أخطاء المحلل الثابت بالأسئلة المحجوبة: ${o.held.rows.filter((r) => !r.ok).map((r) => `«${esc(r.q)}» ← ${esc(r.gotTool)}`).join('، ')}. هنا Gemini لازم يسوي الفرق.</div>` : ''}` : ''}
  ${g ? `<div class="subh">المساعد ويا Gemini (فهم + صياغة، وكل جواب لازم يحتوي الرقم الصحيح)</div><div class="metrics">
      ${m('أسئلة التطوير', g.qa.ok, g.qa.n)}${m('أسئلة محجوبة', g.held.ok, g.held.n)}${m('5 صيغ لنفس السؤال', g.para.ok, g.para.n)}${m('الرفض', g.refuse.ok, g.refuse.n)}
      <div class="metric"><small>فهمه Gemini / صاغه Gemini</small><b class="num">${g.geminiRouted}/${g.geminiWritten}</b><em>من ${g.rows.length} سؤال (الباقي رجع للثابت)</em></div></div>
    <details><summary class="pnote">كل الأجوبة</summary><table class="tbl">${g.rows.map((r) => `<tr><td>${r.ok ? '✓' : '✗'}</td><td>${esc(r.q)}</td><td style="font-size:11.5px">${esc(r.answer)}</td></tr>`).join('')}</table></details>` : ''}
  ${s ? `<div class="subh">كشف الشذوذات على ${s.seeds} محل مولّد (8 شذوذات مزروعة بكل محل)</div><div class="metrics">
      <div class="metric"><small>الدقة (Precision)</small><b class="num">${pct(s.anomalies.tp, s.anomalies.tp + s.anomalies.fp)}</b><em>${s.anomalies.fp} إنذار غلط</em></div>
      <div class="metric"><small>الاستدعاء (Recall)</small><b class="num">${pct(s.anomalies.tp, s.anomalies.tp + s.anomalies.fn)}</b><em>${s.anomalies.fn} ما انكشف</em></div>
      <div class="metric"><small>التوقع أدق من الطريقة البسيطة</small><b class="num">${s.backtest.improvement}%</b><em>غلبها بـ${s.backtest.beatNaive}/${s.seeds} محل</em></div></div>
    <table class="tbl"><tr><th>النوع</th><th>مزروع</th><th>انكشف</th><th>إنذار غلط</th></tr>${Object.entries(s.anomalies.perKind).map(([k, v]) => `<tr><td>${KIND_AR[k] || k}</td><td class="n">${v.planted}</td><td class="n">${v.found}</td><td class="n">${v.fp}</td></tr>`).join('')}</table>
    <div class="pnote" style="margin-top:8px">أضعف نقطة: «دين متأخر» ينكشف بنص الحالات، لأن زبون بطيء أصلاً ما يبين متأخر عن عادته. التوقع: معدل الخطأ اليومي ${fmt(s.backtest.maeModel)} مقابل ${fmt(s.backtest.maeNaive)} للطريقة البسيطة.</div>` : ''}
  ${!o && !s ? '<div class="empty">اضغط «شغّل».</div>' : ''}`;
}
const KIND_AR = { shrinkage: 'نقص بالجرد', duplicate_payment: 'دفعة مورد مكررة', low_day: 'يوم مبيعات واطي', price_jump: 'المورد رفع السعر', below_cost: 'مادة تنباع بخسارة', overdue: 'دين متأخر', unmatched_in: 'تحويل بدون زبون', odd_refund: 'إرجاع غريب', cash_short: 'نقص بالكاش', disputed: 'دين معترض عليه' };
function panelData() {
  const by = {}; for (const t of L.tx) by[t.type] = (by[t.type] || 0) + 1;
  const m = L.forecastModel();
  return `<div class="pnote">كل البيانات وهمية ومولّدة بكود من بذرة ثابتة: محل واحد، 90 يوم، ${CUSTOMERS.length} زبائن دين، 3 موردين، وسعر دولار يتغير يومياً.</div>
  <table class="tbl" style="margin-top:8px">${Object.entries(by).map(([k, v]) => `<tr><td>${TYPE_AR[k] || k}</td><td class="n">${v}</td></tr>`).join('')}</table>
  <div class="subh">معاملات التوقع (محسوبة من الدفتر)</div>
  <table class="tbl"><tr><td>معدل البيع حسب اليوم</td><td>${m.wdAvg.map((v, i) => `${DOW_AR[i]} ${fmt(v)}`).join(' · ')}</td></tr><tr><td>زيادة البيع أيام الرواتب</td><td class="n">×${(Math.round(m.salaryFactor * 100) / 100)}</td></tr>
    <tr><td>بضاعة الموردين أسبوعياً</td><td>${Object.entries(m.weeklyBuy).map(([k, v]) => `${SUPPLIERS[k].short} ${fmt(v)}`).join(' · ')}</td></tr></table>
  <div class="subh">آخر القيود</div><table class="tbl"><tr><th>رقم</th><th>التاريخ</th><th>النوع</th><th>الطريقة</th><th>المبلغ</th></tr>${L.tx.slice(-25).reverse().map((t) => `<tr><td class="n">${t.id}</td><td>${t.date}</td><td>${TYPE_AR[t.type]}</td><td>${CH_AR[t.channel] || '—'}</td><td class="n">${fmt(t.amount)}</td></tr>`).join('')}</table>
  <button class="btn sm" data-p="csv" style="margin-top:10px">${icon('copy', 14)} نزّل الدفتر CSV</button>`;
}
function panelHow() {
  return `<div class="arch">
    <div class="blk"><b>المحفظة هي مصدر البيانات:</b> بيع المحفظة، والتسديد برابط الدفع، ودفع الموردين تدخل الدفتر وحدها. الكاش يتسجل بجملة أو بالتسكيرة.</div><div class="arrow">↓</div>
    <div class="blk"><b>Gemini يفهم:</b> السؤال باللهجة يتحول لاستدعاء أداة وحدة بـJSON. نتحقق منه (أداة معروفة، فترة صحيحة، زبون موجود). إذا فشل، يشتغل المحلل الثابت.</div><div class="arrow">↓</div>
    <div class="blk"><b>الدفتر يحسب:</b> 11 أداة (مبيعات، ربح، ديون، زبون، مواد، مصاريف، دولار، رصيد، توقع، شذوذات، طلبية). كل رقم يطلع ومعه أرقام القيود اللي انحسب منها.</div><div class="arrow">↓</div>
    <div class="blk"><b>Gemini يشرح:</b> يصيغ الجواب باللهجة. المدقق يرفض أي رقم مو موجود بنتيجة الأداة، وإلا نستخدم القالب.</div><div class="arrow">↓</div>
    <div class="blk"><b>المخزون والموردين:</b> المخزون = الموجود + البضاعة المدفوعة − المبيوع ± الجرد. لما مادة تقرب تخلص (أقل من مدة التوصيل + يومين)، تنجهز طلبية تكفي 10 أيام. إذا الطلب التلقائي مفعّل وتحت الحد، تنرسل وحدها لمحفظة المورد، وإلا تنتظر موافقتك. المورد يقبل أو يعدّل أو يرفض، ويسلّم بفاتورة، وتدفعها بالمحفظة فتدخل الدفتر.</div><div class="arrow">↓</div>
    <div class="blk"><b>التاجر يقرر:</b> القيود تنحفظ بعد تأكيده، والتذكير والطلبية ما تنرسل إلا بموافقته، والزبون يأكد أو يعترض من محفظته.</div></div>
  <div class="subh">أنواع الأعطال وشلون نتعامل وياها</div>
  <table class="tbl"><tr><th>العطل</th><th>التعامل</th></tr>
    <tr><td>Gemini ما يرد أو يتأخر</td><td>المحلل الثابت والقوالب. كلشي يبقى يشتغل.</td></tr>
    <tr><td>Gemini يخترع رقم</td><td>المدقق يرفض الجواب ويظهر السبب بـ«خطوات الوكيل».</td></tr>
    <tr><td>سؤال عن فترة أو زبون ماكو</td><td>رفض واضح بدل تخمين.</td></tr>
    <tr><td>صورة دفتر ما تنقرا</td><td>كل حقل وياه ثقة. تحت 70% ينعلم ولازم تأكيد، والفارغ يبقى فارغ.</td></tr>
    <tr><td>كاش ما يطابق</td><td>التسكيرة تبين الفرق والأسباب المحتملة، بدون اتهام.</td></tr>
    <tr><td>زبون ينكر الدين</td><td>الدين يحتاج تأكيد من محفظته، والاعتراض يطلع تنبيه.</td></tr></table>`;
}

// ═════════════ supplier orders ═════════════
function sentOrder(o, how) {
  audit({ action: 'طلبية للمورد', detail: `${SUPPLIERS[o.sid].short} · ${describeOrder(o)}`, by: o.auto ? 'تلقائي (تحت الحد اللي حدده التاجر)' : 'التاجر', model: 'حساب بالكود (سرعة البيع)', tier: o.auto ? 'تلقائي ضمن حد' : 'إرسال · موافقة' });
  event(`انرسلت طلبية ${o.id} لـ${SUPPLIERS[o.sid].short} ${how}: ${describeOrder(o)}.`);
  toastA(o.auto ? 'انرسلت طلبية تلقائية' : 'انرسلت الطلبية', `${SUPPLIERS[o.sid].short} · ${describeOrder(o)}`, { icon: 'truck' });
  // the order lands on the supplier's phone: show that phone with the notification
  S.B.mode = 'sup'; S.B.sid = o.sid; S.B.sheet = null; S.B.edit = null; S.B.deliver = null;
  renderCustSel(); $('#custSel').value = 's:' + o.sid; setBTitle();
  toastB(`طلبية جديدة من ${SHOP.name}`, describeOrder(o), { long: true });
  flowMark('order', 'o5', `طلبية ${o.id} وصلت لـ${SUPPLIERS[o.sid].short}`);
}
function setBTitle() { $('#phoneBTitle').textContent = S.B.mode === 'sup' ? `هاتف المورد (${SUPPLIERS[S.B.sid].short})` : 'هاتف الزبون (محفظته)'; }
function supReply(o, text, warn) {
  flowMark('order', o.status === 'delivered' ? (warn ? 'o8' : 'o7') : 'o6', text);
  event(text);
  toastA(text, '', { icon: warn ? 'alert' : 'truck', ok: !warn });
  renderB(); renderCustSel();
}
function runAuto() {
  for (const o of autoCheck(L, S.orders, S.supSet)) {
    if (o.status === 'sent') sentOrder(o, `تلقائياً لأن ${o.reason}`);
    else flowMark('order', 'o4', `طلبية ${o.id} لـ${SUPPLIERS[o.sid].short} تنتظر موافقتك`), event(`طلبية ${o.id} لـ${SUPPLIERS[o.sid].short} تنتظر موافقتك${o.overCap ? ' (أكثر من حد الطلب التلقائي)' : ''}: ${o.reason}.`);
  }
}

// ═════════════ actions ═════════════
// the reminder lands on the customer's phone: show that phone with the notification
// responsibility: one reminder per customer per 7 days, so a customer is never pestered
const REMIND_EVERY_DAYS = 7;
const remindBlocked = (cid) => S.remLog[cid] && daysBetween(S.remLog[cid], TODAY) < REMIND_EVERY_DAYS;
function sendReminderTo(cid, text) {
  if (remindBlocked(cid)) { toastA('انرسل تذكير قريب', `التذكير الجاي لـ${customerById(cid).name} بعد ${dateAr(addDays(S.remLog[cid], REMIND_EVERY_DAYS))}`); return false; }
  const bal = L.debtBook()[cid].balance;
  const nid = 'R' + Date.now();
  S.notes.push({ id: nid, cid, kind: 'reminder', amount: bal, status: 'new', time: 'هسه', text });
  S.remLog[cid] = TODAY;
  audit({ action: 'تذكير برابط دفع', detail: `${customerById(cid).name} · ${fmt(bal)} د.ع`, by: 'التاجر (وافق على البطاقة)', model: 'Gemini كتب الرسالة، المدقق تأكد من المبلغ', tier: 'إرسال · بطاقة تأكيد',
    undo: () => { const n = S.notes.find((x) => x.id === nid); if (n && n.status === 'new') { S.notes = S.notes.filter((x) => x.id !== nid); delete S.remLog[cid]; renderB(); renderCustSel(); } } });
  event(`انرسل تذكير برابط دفع لـ${customerById(cid).name} (${fmt(bal)}).`);
  toastA('انرسل التذكير', `${customerById(cid).name} · ومعه زر دفع بالمحفظة`, { ok: true, icon: 'check' });
  S.B.mode = 'cust'; S.B.cid = cid; S.B.sheet = null; S.B.edit = null; S.B.deliver = null;
  renderCustSel(); $('#custSel').value = 'c:' + cid; setBTitle();
  toastB(`تذكير من ${SHOP.name}`, `بذمتك ${fmt(bal)} د.ع · اضغط «ادفع»`, { long: true });
  flowMark('debt', 'd9', `تذكير برابط دفع ${fmt(bal)} وصل لـ${customerById(cid).name}`);
}
// commands from the chat: prepare, show, and send only when the owner taps «أرسل»
async function startAction(act, source) {
  const A = S.A; const via = source === 'gemini' ? 'فهمه Gemini' : source === 'button' ? '' : 'فهمه المحلل الثابت';
  if (act.tool === 'remind') {
    const c = CUSTOMERS.find((x) => x.name === act.args?.name);
    if (!c) {
      const top = L.debts().rows.filter((r) => r.balance > 0).slice(0, 4);
      A.chat.push({ from: 'bot', act: { kind: 'pickCust', options: top.map((r) => ({ id: r.cid || r.id, name: r.name, bal: r.balance })) }, text: 'منو تريد أذكّر؟ هذولي أكثر الناس المطلوبين إلك:' }); renderA(); return;
    }
    if (remindBlocked(c.id)) { A.chat.push({ from: 'bot', text: `ذكّرت ${c.name} قبل فترة قصيرة. حتى ما تنزعج، التذكير الجاي يصير بعد ${dateAr(addDays(S.remLog[c.id], REMIND_EVERY_DAYS))}.`, meta: '<span>حد التذكير: مرة بالأسبوع</span>' }); renderA(); return; }
    const bal = L.debtBook()[c.id].balance;
    if (bal <= 0) { A.chat.push({ from: 'bot', text: `${c.name} ما عليه دين هسه، فما أكو داعي للتذكير.`, meta: via ? `<span>${via}</span>` : '' }); renderA(); return; }
    const m = { from: 'bot', act: { kind: 'remind', cid: c.id, name: c.name, bal, status: 'busy' }, meta: via };
    A.chat.push(m); A.typing = false; renderA();
    const d = await draftReminder(L, c.id, { useLLM: useLLM() });
    Object.assign(m.act, { text: d.text, source: d.source, status: 'ready' }); renderA(); return;
  }
  if (act.tool === 'order') {
    const sid = act.args?.supplier;
    if (!sid) { A.chat.push({ from: 'bot', act: { kind: 'pickSup' }, text: 'من يا مورد تريد أطلب؟' }); renderA(); return; }
    const sp = SUPPLIERS[sid];
    const open = S.orders.find((o) => o.sid === sid && OPEN.includes(o.status));
    if (open) { A.chat.push({ from: 'bot', text: `اكو طلبية مفتوحة لـ${sp.short} (${open.id}: ${STATUS_AR[open.status]}). شوفها بشاشة الموردين.`, meta: '<button data-a="sub" data-k="sup">افتح الموردين</button>' }); renderA(); return; }
    const r = L.reorder({ incoming: incomingOf(S.orders) });
    const items = r.bySup[sid].filter((i) => i.order > 0).map((i) => ({ sku: i.sku, qty: i.order }));
    if (!items.length) { A.chat.push({ from: 'bot', text: `المواد اللي تجيك من ${sp.short} كافية هسه حسب سرعة البيع، فما أحتاج أطلب.` }); renderA(); return; }
    const value = items.reduce((a, i) => a + i.qty * L.currentCost(i.sku), 0);
    A.chat.push({ from: 'bot', act: { kind: 'order', sid, name: sp.short, items, value, status: 'ready' }, meta: via }); renderA();
  }
}
function actCard(m, i) {
  const a = m.act;
  if (a.kind === 'pickCust') return `<div class="msg bot">${esc(m.text)}<div class="chips" style="margin-top:8px">${a.options.map((o) => `<button class="chip" data-a="actRem" data-i="${i}" data-id="${o.id}" ${a.done ? 'disabled' : ''}>${esc(o.name)} · ${fmt(o.bal)}</button>`).join('')}</div></div>`;
  if (a.kind === 'pickSup') return `<div class="msg bot">${esc(m.text)}<div class="chips" style="margin-top:8px">${Object.values(SUPPLIERS).map((sp) => `<button class="chip" data-a="actOrd" data-i="${i}" data-id="${sp.id}" ${a.done ? 'disabled' : ''}>${esc(sp.short)}</button>`).join('')}</div></div>`;
  const head = a.kind === 'remind' ? `تذكير لـ${esc(a.name)} برابط دفع ${fmt(a.bal)} د.ع` : `طلبية لـ${esc(a.name)} · تقريباً ${fmt(a.value)} د.ع`;
  let body = '';
  if (a.status === 'busy') body = '<p class="muted">جاري كتابة الرسالة…</p>';
  else if (a.kind === 'remind') body = a.status === 'ready' ? `<textarea id="actText${i}" rows="3" style="width:100%;border:1px solid var(--line-2);border-radius:10px;padding:6px;margin-top:6px">${esc(a.text)}</textarea>` : `<p style="white-space:pre-wrap;margin-top:6px">${esc(a.text)}</p>`;
  else body = `<div style="margin-top:6px">${a.items.map((it) => `<div class="srcrow"><span>${productBySku(it.sku).name}</span><b class="num">${it.qty}</b></div>`).join('')}</div>`;
  const foot = a.status === 'ready' ? `<div class="acts" style="margin-top:8px;display:flex;gap:6px"><button class="btn primary" data-a="actSend" data-i="${i}">${icon('check', 14)} أرسل</button><button class="btn" data-a="actCancel" data-i="${i}">إلغاء</button></div><small class="muted">ما ينرسل إلا لما تضغط «أرسل».</small>`
    : a.status === 'sent' ? `<div class="state pos" style="margin-top:8px">${icon('check', 14)} انرسل ${a.kind === 'remind' ? `ووصل إشعار لمحفظة ${esc(a.name)}` : `ووصل إشعار لهاتف ${esc(a.name)}`}</div>`
    : a.status === 'cancelled' ? '<div class="state neg" style="margin-top:8px">انلغى</div>' : '';
  return `<div class="msg bot"><b>${head}</b>${a.kind === 'remind' && a.source ? ` <span class="src ${a.source === 'gemini' ? 'g' : 't'}">${a.source === 'gemini' ? 'Gemini' : 'قالب'}</span>` : ''}${body}${foot}${m.meta ? `<div class="meta"><span>${m.meta}</span></div>` : ''}</div>`;
}

async function sendChat(text, opts = {}) {
  text = (text || '').trim(); if (!text) return;
  const A = S.A; A.draft = ''; A.chat.push({ from: 'me', text, voice: opts.voice }); A.typing = true; renderA();
  if (looksLikeEntry(text) && !detectAction(text)) {
    const e = await parseEntry(text, { useLLM: useLLM() });
    A.typing = false; A.chat.push({ from: 'bot', entry: e });
    S.runs.unshift({ q: text, ms: 0, trace: [{ step: 'قيد', source: e.source, fallback: e.fallback, entry: { type: e.type, customer: e.customer, items: e.items, amount: e.amount, channel: e.channel, missing: e.missing } }] });
  } else {
    const parts = splitQuestions(text);
    for (const q of parts) {
    if (isOpenQuestion(q) && !detectAction(q)) {
      // open question → the agent (read-only tools, up to MAX_STEPS), proposals become buttons
      const r = await agentAsk(L, q, { useLLM: useLLM() });
      A.typing = parts.length > 1 && q !== parts.at(-1);
      const src = r.answerSource === 'agent' ? `وكيل Gemini · ${r.stepsUsed} أدوات` : `سير عمل ثابت · ${r.stepsUsed} أدوات`;
      const props = (r.proposals || []).map((p) => p.type === 'remind' ? `<button data-a="remCust" data-n="${esc(p.name)}">ذكّر ${esc(p.name)}</button>` : `<button data-a="propOrd" data-id="${p.supplier}">اطلب من ${esc(p.name)}</button>`).join('');
      A.chat.push({ from: 'bot', text: (parts.length > 1 ? `«${q.replace(/؟$/, '')}»: ` : '') + r.answer, figs: r.res?.figures, meta: `<span>${src}</span><button data-a="showTrace">شنو سوّى الوكيل؟</button>${props}` });
      S.runs.unshift(r);
      flowMark('agent', 'g7', `«${q}» ${r.answerSource === 'agent' ? `جاوبه الوكيل بـ${r.stepsUsed} أدوات` : 'جاوبه سير العمل الثابت'}`);
      continue;
    }
    const r = await ask(L, q, { useLLM: useLLM() });
    if (r.action) { A.typing = false; await startAction(r.action, r.routeSource); S.runs.unshift(r); continue; }
    A.typing = parts.length > 1 && q !== parts.at(-1);
    const meta = `<span>${r.answerSource === 'gemini' ? 'صاغه Gemini' : 'جواب ثابت'} · ${r.routeSource === 'gemini' ? 'فهمه Gemini' : 'فهمه المحلل الثابت'}</span>${r.res ? '<button data-a="showTrace">كيف انحسب؟</button>' : ''}${r.route?.tool === 'forecast' ? '<button data-a="tab" data-k="cash">افتح السيولة</button>' : ''}${r.route?.tool === 'anomalies' ? '<button data-a="sub" data-k="alerts">افتح التنبيهات</button>' : ''}${r.route?.tool === 'reorder' ? '<button data-a="sub" data-k="sup">افتح الموردين</button>' : ''}${r.route?.tool === 'inventory' ? '<button data-a="sub" data-k="inventory">افتح المخزون</button>' : ''}${r.route?.tool === 'customer' && r.res?.figures?.find((f) => f.key === 'balance')?.value > 0 ? `<button data-a="remCust" data-n="${esc(r.route.args.name)}">ذكّره برابط دفع</button>` : ''}`;
    A.chat.push({ from: 'bot', text: (parts.length > 1 ? `«${q.replace(/؟$/, '')}»: ` : '') + r.answer, figs: r.res?.figures, meta });
    S.runs.unshift(r);
    if (r.res) flowMark('ask', 'q7', `«${q}» انجاوب${r.answerSource === 'gemini' ? ' بصياغة Gemini' : ' بجواب ثابت'}`);
    }
  }
  renderA(); renderPanel();
}
function entryFromCard(i) {
  const m = S.A.chat[i]; const e = m.entry; const card = document.querySelector(`.entry[data-i="${i}"]`);
  if (card) {
    const v = (k) => card.querySelector(`[data-e="${k}"]`)?.value;
    e.type = v('type') || e.type; e.customer = v('customer') || null;
    if (v('sku')) { const p = productBySku(v('sku')); const q = +v('qty') || 1; e.items = [{ sku: p.sku, qty: q, price: p.sell }]; }
    const amt = +v('amount'); e.amount = amt || (e.items?.length ? e.items.reduce((a, x) => a + x.qty * x.price, 0) : null);
    if (v('channel')) e.channel = v('channel');
  }
  return e;
}
function saveEntry(e) {
  const items = (e.items || []).map((i) => ({ ...i, cost: L.currentCost(i.sku) }));
  let t;
  if (e.type === 'credit_sale') t = L.add({ type: 'credit_sale', channel: 'credit', customer: e.customer, items, amount: e.amount, confirmed: false, note: `دين على ${customerById(e.customer).name}` });
  else if (e.type === 'sale') t = L.add({ type: 'sale', channel: e.channel || 'cash', items, amount: e.amount, note: 'بيع مسجل' });
  else if (e.type === 'payment_in') t = L.add({ type: 'payment_in', channel: e.channel || 'cash', customer: e.customer, amount: e.amount, debtRef: null, note: `تسديد ${e.channel === 'wallet' ? '' : 'كاش '}من ${customerById(e.customer).name}` });
  else if (e.type === 'expense') t = L.add({ type: 'expense', channel: e.channel || 'cash', category: e.category || 'other', amount: e.amount, note: e.note || 'مصروف' });
  if (t?.type === 'credit_sale') {
    S.notes.push({ id: 'N' + t.id, cid: t.customer, kind: 'confirm', debtId: t.id, amount: t.amount, status: 'new', time: 'هسه', text: describeItems(t) });
    event(`قيد دين ${fmt(t.amount)} على ${customerById(t.customer).name}، ووصله طلب تأكيد بمحفظته.`);
    flowMark('debt', 'd5', `دين ${fmt(t.amount)} على ${customerById(t.customer).name}، ووصله طلب تأكيد`);
    if (S.B.cid === t.customer) toastB('طلب تأكيد دين جديد', `${SHOP.name} · ${fmt(t.amount)} د.ع`); else renderCustSel();
  } else if (t) event(`قيد ${TYPE_AR[t.type]} ${fmt(t.amount)}.`);
  if (t) audit({ action: TYPE_AR[t.type], detail: `${t.customer ? customerById(t.customer).name + ' · ' : ''}${fmt(t.amount)} د.ع`, by: e.by || 'التاجر', model: e.source === 'gemini' ? 'Gemini (فهم الجملة)' : e.source === 'offline' ? 'المحلل الثابت' : '—', tier: 'تسجيل · بطاقة تأكيد',
    undo: () => { L.remove(t.id); S.notes = S.notes.filter((n) => n.debtId !== t.id); renderA(); renderB(); renderCustSel(); } });
  if (t && (t.type === 'sale' || t.type === 'credit_sale')) runAuto();
  return t;
}
function validEntry(e) {
  if (!e.type || !e.amount || e.amount <= 0) return false;
  if (['credit_sale', 'payment_in'].includes(e.type) && !e.customer) return false;
  if (['credit_sale', 'sale'].includes(e.type) && !e.items?.length) return false;
  return true;
}

document.addEventListener('click', async (ev) => {
  const a = ev.target.closest('[data-a]'), b = ev.target.closest('[data-b]'), p = ev.target.closest('[data-p]');
  if (a) {
    const k = a.dataset.a, A = S.A;
    switch (k) {
      case 'tab': A.tab = a.dataset.k; A.sub = null; A.sheet = null; renderA(); break;
      case 'sub': A.sub = a.dataset.k; A.sheet = null; if (A.sub === 'closing') A.closing = { step: 1, counted: '', exp: '', expNote: '', res: null }; renderA(); break;
      case 'back': A.sub = null; A.reminder = null; renderA(); break;
      case 'cust': A.sub = 'cust'; A.custId = a.dataset.id; A.reminder = null; renderA(); break;
      case 'fig': A.sheet = { kind: 'fig', fig: FIGS.get(a.dataset.f) }; renderA(); break;
      case 'tx': A.sheet = { kind: 'tx', id: a.dataset.id }; renderA(); break;
      case 'closeSheet': if (ev.target === a || a.tagName === 'BUTTON') { A.sheet = null; renderA(); } break;
      case 'filter': A.filter = a.dataset.k; renderA(); break;
      case 'ask': A.tab = 'chat'; A.sub = null; sendChat(a.dataset.q); break;
      case 'send': { const v = document.getElementById('chatIn')?.value; const wasHeard = !!A.heard; A.heard = null; sendChat(v, { voice: wasHeard }); break; }
      case 'showTrace': S.tab = 'trace'; renderPanel(); document.querySelector('.panelcol')?.scrollIntoView({ behavior: 'smooth' }); break;
      case 'saveEntry': { const i = +a.dataset.i; const e = entryFromCard(i); e.missing = []; if (!validEntry(e)) { toastA('القيد ناقص', 'كمّل النوع والزبون والمبلغ'); break; } saveEntry(e); S.A.chat[i].saved = true; renderA(); break; }
      case 'cancelEntry': S.A.chat[+a.dataset.i].cancelled = true; renderA(); break;
      case 'quickAdd': A.sheet = { kind: 'add', d: { type: 'sale' } }; renderA(); break;
      case 'qaSave': {
        const type = $('#qa_type').value; const e = { type, customer: $('#qa_cust')?.value || null, channel: $('#qa_ch')?.value || 'cash', note: $('#qa_note')?.value };
        if ($('#qa_sku')) { const pr = productBySku($('#qa_sku').value); const q = +$('#qa_qty').value || 1; e.items = [{ sku: pr.sku, qty: q, price: pr.sell }]; e.amount = q * pr.sell; } else e.amount = +$('#qa_amt').value;
        if (!validEntry(e)) { toastA('القيد ناقص', 'اكتب المبلغ'); break; }
        saveEntry(e); A.sheet = null; toastA('انحفظ القيد', `${TYPE_AR[type]} · ${fmt(e.amount)} د.ع`, { ok: true, icon: 'check' }); break;
      }
      case 'draftReminder': { const cid = A.custId; A.reminder = { cid, busy: true }; renderA(); const d = await draftReminder(L, cid, { useLLM: useLLM() }); A.reminder = { cid, ...d }; renderA(); break; }
      case 'sendReminder': {
        A.reminder = null; sendReminderTo(A.custId, $('#remText').value); renderA(); break;
      }
      case 'cashPay': { const cid = A.custId; const v = +$('#cashPay').value || L.debtBook()[cid].balance; saveEntry({ type: 'payment_in', channel: 'cash', customer: cid, amount: v }); toastA('انسجل التسديد', `${fmt(v)} كاش من ${customerById(cid).name}`, { ok: true, icon: 'check' }); renderB(); break; }
      case 'scen': { const sc = A.scen; if (a.dataset.k === 'collect') { const id = a.dataset.id; sc.collect = sc.collect.includes(id) ? sc.collect.filter((x) => x !== id) : [...sc.collect, id]; } else sc[a.dataset.k] = !sc[a.dataset.k]; renderA(); break; }
      case 'alertSrc': { const x = L.anomalies().items[+a.dataset.i]; A.sheet = { kind: 'fig', fig: { label: x.title, value: x.ids.reduce((s, id) => s + (L.byId(id)?.amount || 0), 0), ids: x.ids } }; renderA(); break; }
      case 'closeNext': {
        const c = A.closing;
        if (c.step === 1) { c.counted = $('#cntIn').value; if (!c.counted) { toastA('اكتب مبلغ الكاش'); break; } c.step = 2; }
        else if (c.step === 2) { c.exp = $('#expIn').value; c.expNote = $('#expNote').value; if (+c.exp > 0) { saveEntry({ type: 'expense', channel: 'cash', category: 'other', amount: +c.exp, note: c.expNote || 'مصروف من الجرار' }); } c.step = 3; }
        else if (c.step === 3) { c.res = L.reconcile({ counted: +c.counted }); c.step = 4; event(`تسكيرة: المتوقع ${fmt(c.res.expected)}، المحسوب ${fmt(c.res.counted)}، الفرق ${fmt(c.res.diff)}.`); }
        renderA(); break;
      }
      case 'closeDebt': A.sub = null; A.tab = 'chat'; A.draft = 'سجل على '; renderA(); document.getElementById('chatIn')?.focus(); break;
      case 'linkPay': { const t = L.byId(a.dataset.id); const cid = $('#um_' + t.id).value; t.customer = cid; t.note = `تسديد من ${customerById(cid).name} (ربطته يدوياً)`; event(`ربطت تحويل ${fmt(t.amount)} بـ${customerById(cid).name}.`); A.closing.res = L.reconcile({ counted: +A.closing.counted }); renderA(); renderB(); break; }
      case 'closeDay': { L.closings.at(-1).counted = +A.closing.counted; event('انسكر اليوم.'); A.sub = null; toastA('انسكر اليوم', 'نشوفك باچر', { ok: true, icon: 'check' }); break; }
      case 'copyWeekly': navigator.clipboard?.writeText(A.weeklyText).then(() => toastA('انسخت الرسالة'), () => toastA('ما گدرت أنسخ')); break;
      case 'setPrice': { const pr = productBySku(a.dataset.sku); const old = pr.sell; pr.sell = +a.dataset.v; event(`سعر ${pr.name} صار ${fmt(pr.sell)} بدل ${fmt(old)}.`); toastA('تحدّث السعر', `${pr.name}: ${fmt(pr.sell)}`, { ok: true, icon: 'check' }); break; }
      case 'setAuto': { const st = S.supSet[a.dataset.id]; st.auto = !st.auto; event(`الطلب التلقائي لـ${SUPPLIERS[a.dataset.id].short}: ${st.auto ? 'مفعّل' : 'موقوف'}.`); runAuto(); renderA(); break; }
      case 'setCap': S.supSet[a.dataset.id].cap = +a.dataset.v; runAuto(); renderA(); break;
      case 'manualOrder': { const sid = a.dataset.id; const r = L.reorder({ incoming: incomingOf(S.orders) }); const items = r.bySup[sid].filter((i) => i.order > 0).map((i) => ({ sku: i.sku, qty: i.order })); const o = makeOrder(sid, items); S.orders.push(o); sentOrder(o, 'بعد موافقتك'); renderA(); break; }
      case 'sendDraft': { const o = S.orders.find((x) => x.id === a.dataset.id); o.status = 'sent'; sentOrder(o, 'بعد موافقتك'); renderA(); break; }
      case 'cancelOrder': { const o = S.orders.find((x) => x.id === a.dataset.id); o.status = 'cancelled'; event(`لغيت طلبية ${o.id}.`); renderA(); break; }
      case 'payInv': { A.sheet = { kind: 'pin', order: a.dataset.id, ch: a.dataset.ch }; renderA(); setTimeout(() => $('#pinIn')?.focus(), 30); break; }
      case 'pinOk': {
        const sh = A.sheet; if ($('#pinIn').value !== PIN) { toastA('الرمز غلط', 'للتجربة: 1234'); break; }
        A.sheet = null;
        const o = S.orders.find((x) => x.id === sh.order); const ch = sh.ch; const amount = orderValue(o, L);
        const t = L.add({ type: 'purchase', channel: ch, supplier: o.sid, fx: L.rateOn(TODAY), amount, items: o.items.map((i) => ({ sku: i.sku, qty: i.accepted ?? i.qty, cost: i.price ?? L.currentCost(i.sku) })), note: `بضاعة من ${SUPPLIERS[o.sid].short} (طلبية ${o.id})` });
        o.status = 'paid'; o.txId = t.id; if (ch === 'wallet') S.supBal[o.sid] += amount;
        flowMark('order', 'o12', `دفعت فاتورة ${o.id} والمخزون زاد`);
        event(`دفعت فاتورة ${o.id} لـ${SUPPLIERS[o.sid].short} ${fmt(amount)} ${ch === 'wallet' ? 'بالمحفظة' : 'كاش'}، والمخزون زاد.`);
        toastA('انحفظت البضاعة بالدفتر', `المخزون زاد · ${fmt(amount)} د.ع`, { ok: true, icon: 'box' });
        audit({ action: 'دفع فاتورة مورد', detail: `${SUPPLIERS[o.sid].short} · ${fmt(amount)} د.ع ${ch === 'wallet' ? 'بالمحفظة' : 'كاش'}`, by: 'التاجر', model: '—', tier: 'حركة فلوس · رمز PIN' });
        renderA(); if (S.B.mode === 'sup' && S.B.sid === o.sid) toastB(`وصلت دفعة من ${SHOP.name}`, `${fmt(amount)} د.ع`, { ok: true }); renderB(); renderCustSel(); break;
      }
      case 'count': A.count = A.count === a.dataset.sku ? null : a.dataset.sku; renderA(); break;
      case 'saveCount': {
        const sku = a.dataset.sku; const counted = +$('#countIn').value; if ($('#countIn').value === '') break;
        const stock = L.stockOf(sku); const delta = counted - stock; const p = productBySku(sku); A.count = null;
        if (delta) { const cost = L.currentCost(sku); L.add({ type: 'adjust', channel: 'none', items: [{ sku, qty: delta, cost }], amount: Math.abs(delta) * cost, shrink: delta < 0, note: `جرد ${p.name}: ${delta < 0 ? 'ناقص' : 'زايد'} ${Math.abs(delta)}` });
          event(`جرد ${p.name}: الدفتر ${stock} والرف ${counted} (${delta > 0 ? '+' : ''}${delta}).`);
          audit({ action: 'جرد', detail: `${p.name}: ${delta > 0 ? '+' : ''}${delta}`, by: 'التاجر', model: '—', tier: 'تسجيل' }); toastA(delta < 0 ? 'اكو نقص بالمخزون' : 'تعدّل المخزون', `${p.name}: ${delta > 0 ? '+' : ''}${delta}`, { icon: 'box' }); runAuto(); }
        else toastA('المخزون مطابق', p.name, { ok: true, icon: 'check' });
        break;
      }
      case 'nbSample': { const nb = A.nb; nb.img = null; nb.err = null; nb.page = SAMPLE_PAGE; nb.source = 'sample'; nb.entries = notebookToEntries(SAMPLE_PAGE); renderA(); break; }
      case 'nbUpload': $('#fileImg').click(); break;
      case 'nbSave': {
        const nb = A.nb; let n = 0;
        for (const e of nb.entries) if (e.ok && !e.saved) { const pr = productBySku(e.sku); saveEntry({ type: 'credit_sale', customer: e.customer, items: [{ sku: pr.sku, qty: e.qty, price: pr.sell }], amount: e.amount }); e.saved = true; n++; }
        toastA(n ? `انحفظت ${n} سطور` : 'ماكو سطور مأكدة', n ? 'ووصل للزبائن طلب تأكيد' : 'صحح الحقول الحمر أول'); break;
      }
      case 'mic': startMic(); break;
      case 'heardOk': { const t = ($('#chatIn')?.value || A.heard?.text || '').trim(); A.heard = null; sendChat(t, { voice: true }); break; }
      case 'heardEdit': A.heard = null; renderA(); setTimeout(() => $('#chatIn')?.focus(), 30); break;
      case 'actRem': { const m = A.chat[+a.dataset.i]; m.act.done = true; renderA(); await startAction({ tool: 'remind', args: { name: customerById(a.dataset.id).name } }, 'button'); break; }
      case 'actOrd': { const m = A.chat[+a.dataset.i]; m.act.done = true; renderA(); await startAction({ tool: 'order', args: { supplier: a.dataset.id } }, 'button'); break; }
      case 'actSend': {
        const m = A.chat[+a.dataset.i]; const act = m.act; if (act.status !== 'ready') break;
        if (act.kind === 'remind') { act.text = document.querySelector(`#actText${a.dataset.i}`)?.value || act.text; if (sendReminderTo(act.cid, act.text) === false) { act.status = 'cancelled'; renderA(); break; } }
        else { const o = makeOrder(act.sid, act.items); S.orders.push(o); sentOrder(o, 'بطلب منك بالمساعد'); }
        act.status = 'sent'; renderA(); break;
      }
      case 'propOrd': await startAction({ tool: 'order', args: { supplier: a.dataset.id } }, 'button'); break;
      case 'remCust': await startAction({ tool: 'remind', args: { name: a.dataset.n } }, 'button'); break;
      case 'actCancel': { const m = A.chat[+a.dataset.i]; m.act.status = 'cancelled'; renderA(); break; }
    }
    return;
  }
  if (b) {
    const k = b.dataset.b, cid = S.B.cid;
    switch (k) {
      case 'confirm': case 'dispute': {
        const n = S.notes.find((x) => x.id === b.dataset.id); const t = L.byId(n.debtId);
        if (k === 'confirm') { t.confirmed = true; n.status = 'done'; event(`${customerById(cid).name} أكد دين ${fmt(t.amount)} من محفظته.`); toastA(`${customerById(cid).name} أكد الدين`, `${fmt(t.amount)} د.ع`, { ok: true, icon: 'check' }); }
        else { t.disputed = true; n.status = 'disputed'; event(`${customerById(cid).name} اعترض على دين ${fmt(t.amount)}.`); toastA(`${customerById(cid).name} اعترض على دين`, 'شوف التنبيهات', { icon: 'alert' }); }
        renderB(); renderCustSel(); break;
      }
      case 'pay': S.B.sheet = { amt: b.dataset.amt }; renderB(); break;
      case 'supAccept': { const o = S.orders.find((x) => x.id === b.dataset.id); o.status = 'accepted'; o.items.forEach((i) => { i.accepted = i.qty; }); supReply(o, `${SUPPLIERS[o.sid].short} وافق على طلبية ${o.id}، التوصيل خلال ${SUPPLIERS[o.sid].lead} يوم.`); break; }
      case 'supEdit': S.B.edit = b.dataset.id; S.B.deliver = null; renderB(); break;
      case 'supCancelEdit': S.B.edit = null; S.B.deliver = null; renderB(); break;
      case 'supSaveEdit': {
        const o = S.orders.find((x) => x.id === b.dataset.id);
        document.querySelectorAll('#appB [data-sq]').forEach((inp) => { const it = o.items.find((i) => i.sku === inp.dataset.sq); it.accepted = Math.max(0, +inp.value || 0); });
        o.status = 'accepted'; S.B.edit = null;
        const short = o.items.filter((i) => i.accepted < i.qty);
        o.note = short.length ? `توفر جزئي: ${short.map((i) => `${productBySku(i.sku).name} ${i.accepted} من ${i.qty}`).join('، ')}` : '';
        supReply(o, `${SUPPLIERS[o.sid].short} وافق على ${o.id}${o.note ? ' — ' + o.note : ''}.`); break;
      }
      case 'supReject': { const o = S.orders.find((x) => x.id === b.dataset.id); o.status = 'rejected'; supReply(o, `${SUPPLIERS[o.sid].short} رفض طلبية ${o.id}. راجع الموردين.`, true); break; }
      case 'supDeliver': S.B.deliver = b.dataset.id; S.B.edit = null; renderB(); break;
      case 'supDeliverGo': {
        const o = S.orders.find((x) => x.id === b.dataset.id);
        document.querySelectorAll('#appB [data-sp]').forEach((inp) => { const it = o.items.find((i) => i.sku === inp.dataset.sp); it.price = +inp.value || L.currentCost(it.sku); });
        const up = o.items.filter((i) => i.price > L.currentCost(i.sku) * 1.08);
        o.status = 'delivered'; S.B.deliver = null;
        if (up.length) o.note = (o.note ? o.note + ' · ' : '') + `سعر جديد: ${up.map((i) => `${productBySku(i.sku).name} ${fmt(i.price)} بدل ${fmt(L.currentCost(i.sku))}`).join('، ')}`;
        supReply(o, `${SUPPLIERS[o.sid].short} سلّم طلبية ${o.id} وأرسل فاتورة ${fmt(orderValue(o, L))} د.ع.${up.length ? ' انتبه: اكو سعر أعلى من آخر مرة.' : ''}`, !!up.length); break;
      }
      case 'closeSheet': if (ev.target === b || b.tagName === 'BUTTON') { S.B.sheet = null; renderB(); } break;
      case 'payGo': {
        const amt = +$('#payAmt').value; const book = L.debtBook()[cid];
        if (!amt || amt <= 0) break;
        if (amt > S.bal[cid]) { toastB('رصيدك ما يكفي'); break; }
        const ref = book.open[0]?.id || null;
        const t = L.add({ type: 'payment_in', channel: 'wallet', customer: cid, amount: amt, debtRef: ref, note: `تسديد من ${customerById(cid).name} (رابط دفع)` });
        S.bal[cid] -= amt; S.B.sheet = null;
        S.notes.filter((x) => x.cid === cid && x.kind === 'reminder' && x.status === 'new').forEach((x) => { x.status = 'paid'; });
        S.notes.push({ id: 'P' + t.id, cid, kind: 'receipt', title: 'دفعت بنجاح', time: 'هسه', text: `${fmt(amt)} د.ع لـ${SHOP.name}. رقم العملية ${t.id}.` });
        event(`${customerById(cid).name} دفع ${fmt(amt)} برابط الدفع، وتطابق تلقائياً مع دين ${ref || '—'}.`);
        toastA(`وصلك ${fmt(amt)} د.ع من ${customerById(cid).name}`, 'تطابق تلقائياً مع الدين ✓', { ok: true, icon: 'link' });
        flowMark('debt', 'd12', `${customerById(cid).name} دفع ${fmt(amt)} وتطابق مع الدين`);
        renderB(); renderCustSel(); break;
      }
    }
    return;
  }
  if (p) {
    switch (p.dataset.p) {
      case 'tab': S.tab = p.dataset.k; renderPanel(); break;
      case 'undo': if (undoAudit(p.dataset.id)) { toastA('تراجعت عن العملية', '', { icon: 'check' }); renderA(); } else toastA('ما يصير تتراجع', 'فاتت 5 دقايق أو العملية ما تتراجع'); renderPanel(); break;
      case 'flowKey': flowStop(); S.flow.key = p.dataset.k; S.flow.sel = -1; renderPanel(); break;
      case 'flowStep': flowStop(); S.flow.sel = +p.dataset.i; renderPanel(); break;
      case 'flowPlay': flowPlay(); break;
      case 'flowPrev': flowStop(); S.flow.sel = Math.max(0, S.flow.sel - 1); renderPanel(); break;
      case 'flowNext': flowStop(); S.flow.sel = Math.min(FLOWS[S.flow.key].steps.length - 1, S.flow.sel + 1); renderPanel(); break;
      case 'flowTry': { const t = FLOWS[S.flow.key].try; if (t.chat) { S.A.tab = 'chat'; S.A.sub = null; renderA(); sendChat(t.chat); } else { S.A.sub = t.screen; renderA(); } break; }
      case 'flowZoom': S.flow.zoom = true; $('#modalRoot').innerHTML = `<div class="modal-bg" data-m="close"><div class="modal flowmodal"><div class="mh"><h3>مخطط العمل · ${FLOWS[S.flow.key].title}</h3><button class="btn sm" data-m="close">سد</button></div><div id="flowZoomBody">${flowInner(true)}</div></div></div>`; break;
      case 'evalOff': S.evalOff = evalOffline(L); renderPanel(); await sleep(30); S.evalShops = evalShops(20); renderPanel(); break;
      case 'evalLLM': S.evalBusy = true; S.evalProg = 0; renderPanel(); try { S.evalLLM = await evalLLM(L, { pauseMs: 5000, onProgress: (i, n) => { S.evalProg = Math.round((i / n) * 100); renderPanel(); } }); } finally { S.evalBusy = false; renderPanel(); } break;
      case 'csv': {
        const rows = [['id', 'date', 'type', 'channel', 'amount', 'customer', 'supplier', 'note'], ...L.tx.map((t) => [t.id, t.date, t.type, t.channel, t.amount, t.customer ? customerById(t.customer).name : '', t.supplier ? SUPPLIERS[t.supplier].short : '', t.note || ''])];
        const blob = new Blob(['﻿' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
        const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = 'daftar-ledger.csv'; l.click(); URL.revokeObjectURL(u); break;
      }
    }
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'chatIn') S.A.draft = e.target.value;
  if (e.target.dataset.nb != null) nbEdit(e.target);
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'custSel') { const [m, id] = e.target.value.split(':'); if (m === 's') { S.B.mode = 'sup'; S.B.sid = id; } else { S.B.mode = 'cust'; S.B.cid = id; } S.B.sheet = null; S.B.edit = null; S.B.deliver = null; renderB(); setBTitle(); }
  if (e.target.id === 'qa_type') { S.A.sheet = { kind: 'add', d: { type: e.target.value } }; renderA(); }
  if (e.target.dataset.nb != null) { nbEdit(e.target); renderA(); }
  if (e.target.dataset.e === 'type') { const card = e.target.closest('.entry'); const i = +card.dataset.i; const en = entryFromCard(i); renderA(); }
  if (e.target.id === 'fileImg' && e.target.files[0]) {
    const rd = new FileReader();
    rd.onload = async () => {
      const nb = S.A.nb; nb.img = rd.result; nb.entries = null; nb.err = null;
      if (!useLLM()) { nb.err = 'قراءة الصور تحتاج Gemini. حط المفتاح من الإعدادات، أو جرّب الصفحة التجريبية.'; renderA(); return; }
      nb.busy = true; renderA();
      try { const page = await readNotebook(nb.img); nb.page = page; nb.source = 'gemini'; nb.entries = notebookToEntries(page); event(`Gemini قرا صفحة دفتر: ${page.lines.length} سطور.`); }
      catch (err) { nb.err = 'ما گدرنا نقرا الصفحة: ' + (err.message || err); }
      nb.busy = false; renderA();
    };
    rd.readAsDataURL(e.target.files[0]); e.target.value = '';
  }
});
function nbEdit(el) {
  const e = S.A.nb.entries[+el.dataset.nb]; const f = el.dataset.f;
  e[f] = f === 'qty' || f === 'amount' ? (+el.value || null) : el.value || null;
  if (f === 'qty' || f === 'sku') { const pr = productBySku(e.sku); if (pr && e.qty) e.amount = e.qty * pr.sell; }
  e.ok = !!(e.customer && e.sku && e.qty && e.amount);
  e.flags = e.ok ? [] : e.flags;
}
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'chatIn') sendChat(e.target.value); });

// voice: record WAV → Gemini transcribes with the shop's vocabulary (names, products).
// Without Gemini, fall back to the browser recogniser.
let rec = null;
async function startMic() {
  const A = S.A;
  if (rec) { const r = rec; rec = null; A.recording = false; A.transcribing = true; renderA(); const { dataUrl, seconds } = await r.stop(); return afterRecording(dataUrl, seconds); }
  if (!useLLM()) return browserMic();
  try { rec = await startRecording({ maxMs: 15000 }); A.recording = true; renderA(); toastA('ديسجل… تكلم', 'اضغط المايك مرة ثانية لما تخلص', { icon: 'mic' });
    rec.finished.then((res) => { if (rec) { rec = null; A.recording = false; A.transcribing = true; renderA(); afterRecording(res.dataUrl, res.seconds); } });
  } catch { toastA('ما گدرت أفتح المايكروفون', 'تأكد من إذن المتصفح'); }
}
async function afterRecording(dataUrl, seconds) {
  const A = S.A;
  if (seconds < 0.6) { A.transcribing = false; renderA(); toastA('التسجيل قصير', 'اضغط وتكلم، وبعدين اضغط مرة ثانية'); return; }
  try {
    const { text, ms } = await transcribe(dataUrl);
    A.transcribing = false;
    if (!text) { renderA(); toastA('ما سمعت كلام واضح', 'حاول مرة ثانية بمكان أهدأ'); return; }
    event(`تحويل الصوت لنص بـGemini (${(ms / 1000).toFixed(1)} ث): «${text}»`);
    // «سمعتك: … صح؟» — nothing is sent or saved until the owner confirms what was heard
    A.tab = 'chat'; A.sub = null; A.heard = { text, ms }; A.draft = text; renderA(); setTimeout(() => $('#chatIn')?.focus(), 30);
  } catch (e) { A.transcribing = false; renderA(); toastA('ما گدرت أحول الصوت لنص', 'جرّب مرة ثانية أو اكتب'); }
}
function browserMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toastA('المتصفح ما يدعم الصوت', 'جرّب Chrome، أو فعّل Gemini'); return; }
  const r = new SR(); r.lang = 'ar-IQ'; r.interimResults = false; r.maxAlternatives = 1;
  S.A.recording = true; renderA();
  r.onresult = (e) => { const t = e.results[0][0].transcript; S.A.recording = false; sendChat(t, { voice: true }); };
  r.onerror = () => { S.A.recording = false; toastA('ما سمعت زين', 'حاول مرة ثانية'); };
  r.onend = () => { if (S.A.recording) { S.A.recording = false; renderA(); } };
  r.start();
}

// settings
$('#settingsBtn').addEventListener('click', () => {
  const st = llmStatus();
  $('#modalRoot').innerHTML = `<div class="modal-bg" data-m="close"><div class="modal"><div class="mh"><h3>الإعدادات</h3><button class="btn sm" data-m="close">سد</button></div>
    <div class="mb"><div class="field">مفتاح Gemini API${st.keySource === 'server' ? ' (موجود بالخادم، ما تحتاج تحطه هنا)' : ''}<input id="keyIn" type="password" placeholder="AIza…" value="${esc(getKey())}" style="direction:ltr"></div>
      <div class="pnote">المفتاح ينحفظ بمتصفحك بس، وينرسل لخادمك المحلي حتى يوصله لـGemini. الأفضل تحطه بملف <code>.env</code> جنب <code>server.js</code>.</div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="useIn" ${S.useLLM ? 'checked' : ''}> استخدم Gemini (إذا ألغيته يشتغل كلشي بالوضع الاحتياطي)</label>
      <div id="keyMsg" class="pnote"></div></div>
    <div class="mf"><button class="btn primary" data-m="save">احفظ وجرّب</button><button class="btn" data-m="close">إلغاء</button></div></div></div>`;
});
$('#modalRoot').addEventListener('click', async (e) => {
  const m = e.target.closest('[data-m]'); if (!m) return;
  if (m.dataset.m === 'close' && (e.target === m || m.tagName === 'BUTTON')) { $('#modalRoot').innerHTML = ''; S.flow.zoom = false; return; }
  if (m.dataset.m === 'save') {
    setKey($('#keyIn').value); S.useLLM = $('#useIn').checked;
    $('#keyMsg').textContent = 'جاري التجربة…';
    const st = await health(true);
    if (st.ok && S.useLLM) {
      try { const { callLLM } = await import('./llm.js'); const r = await callLLM({ system: 'Reply with JSON {"ok":true}', messages: [{ role: 'user', content: 'ping' }], json: true, maxTokens: 20 }); $('#keyMsg').textContent = 'اشتغل ✓ ' + (r.model || ''); }
      catch (err) { $('#keyMsg').textContent = 'المفتاح موجود بس Gemini رد بخطأ: ' + (err.message || err); }
    } else $('#keyMsg').textContent = st.ok ? 'Gemini موقوف.' : 'ماكو مفتاح. التطبيق يشتغل بالوضع الاحتياطي.';
    renderPill();
  }
});
$('#custSel').addEventListener('change', () => {});
$('#resetBtn').addEventListener('click', () => { flowStop(); init(); boot(); });
$('#flowBtn').addEventListener('click', () => { S.tab = 'flow'; renderPanel(); document.querySelector('.panelcol')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });

function boot() {
  $('#shopPill').textContent = `${SHOP.name} · ${SHOP.city}`;
  S.B.mode = 'cust'; runAuto(); S.flow.key = 'debt'; S.flow.fresh = false;
  renderCustSel(); if (S.B.mode === 'sup') $('#custSel').value = 's:' + S.B.sid; setBTitle(); renderA(); renderB(); renderPanel(); renderPill();
}
init();
boot();
setInterval(() => { $('#sbB').firstElementChild && ($('#sbB').firstElementChild.textContent = hhmm()); $('#sbA').firstElementChild && ($('#sbA').firstElementChild.textContent = hhmm()); }, 30000);
