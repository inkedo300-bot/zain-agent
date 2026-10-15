// ─────────────────────────────────────────────────────────────
// Privacy before the model: customer names and phone numbers never reach the LLM.
//   mask()   «ذكّر أم زينب»          → «ذكّر C2»
//   unmask() «C2 مطلوبة 67,500»      → «أم زينب مطلوبة 67,500»
// The ledger and the UI keep the real names; only the text sent to the model is masked.
// Exceptions (documented in the README): voice recordings and notebook photos are
// sent as they are, because a recording or a photo cannot be masked before reading it.
// ─────────────────────────────────────────────────────────────
import { CUSTOMERS, SUPPLIERS } from './data.js';

const ALEF = '[اأإآ]', TA = '[هة]', YA = '[يى]';
// whole words only (an optional و/ف/ب/ل/ك in front is allowed: «لأم زينب»)
const AR = '\\u0621-\\u064A\\u066E-\\u06D3'; // Arabic letters only (not ؟ ، ؛)
const word = (re) => `(?<=(?:^|[^${AR}])[وفبلك]?)${re}(?![${AR}])`;
const flex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[اأإآ]/g, ALEF).replace(/[هة]/g, TA).replace(/[يى]/g, YA);

// every way a customer is written (short name, full name), longest first so «أم زينب» wins over «زينب»
const ENTRIES = CUSTOMERS.flatMap((c) => [...new Set([c.full, c.name].filter(Boolean))].map((n) => ({ n, code: c.id })))
  .sort((a, b) => b.n.length - a.n.length)
  .map((e) => ({ ...e, re: new RegExp(word(flex(e.n)), 'g') }));
// supplier contact people (the businesses themselves are not personal data)
const CONTACTS = Object.values(SUPPLIERS).map((s) => ({ n: s.contact, code: s.id + '-contact', re: new RegExp(word(flex(s.contact)), 'g') }));
const PHONE = /(?:\+?964|0)7\d{2}[\s-]?\d{3}[\s-]?\d{4}/g;

export const codeOf = (cid) => cid;
export const nameOfCode = (code) => CUSTOMERS.find((c) => c.id === code)?.name || null;
export const CUSTOMER_CODES = CUSTOMERS.map((c) => c.id);

export function mask(text) {
  if (text == null) return text;
  let s = String(text);
  for (const e of ENTRIES) s = s.replace(e.re, e.code);
  for (const e of CONTACTS) s = s.replace(e.re, e.code);
  return s.replace(PHONE, '[هاتف]');
}
export function unmask(text) {
  if (text == null) return text;
  let s = String(text);
  for (const sp of Object.values(SUPPLIERS)) s = s.split(sp.id + '-contact').join(sp.contact);
  // C10 before C1
  for (const c of [...CUSTOMERS].sort((a, b) => b.id.length - a.id.length)) s = s.replace(new RegExp(c.id + '(?![0-9])', 'g'), c.name);
  return s;
}
// any customer name left in a string that is about to be sent? (used by the tests)
export const leaks = (text) => CUSTOMERS.filter((c) => [c.name, c.full].filter(Boolean).some((n) => new RegExp(flex(n)).test(text))).map((c) => c.name);
