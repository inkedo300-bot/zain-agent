// Client for the local /api/llm proxy (Gemini). The key stays on the local server,
// or — if the user pasted one in Settings — is sent only to that local server.
let status = { checked: false, ok: false };
const KEY = 'daftar.geminiKey';
export const getKey = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
export const setKey = (k) => { try { k ? localStorage.setItem(KEY, k.trim()) : localStorage.removeItem(KEY); } catch {} status.checked = false; };
const headers = () => { const k = getKey(); return { 'content-type': 'application/json', ...(k ? { 'x-gemini-key': k } : {}) }; };

export async function health(force = false) {
  if (status.checked && !force) return status;
  try {
    const r = await fetch('/api/health', { headers: headers(), cache: 'no-store' });
    const j = await r.json();
    status = { checked: true, ok: !!j.llm, model: j.model, keySource: j.keySource };
  } catch { status = { checked: true, ok: false }; }
  return status;
}
export const llmStatus = () => status;

export async function callLLM({ system, messages, images = [], maxTokens = 700, timeoutMs = 15000, json = false, tier }) {
  const st = await health();
  if (!st.ok) throw new Error('llm_unavailable');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const r = await fetch('/api/llm', { method: 'POST', headers: headers(), signal: ctrl.signal,
      body: JSON.stringify({ system, messages, images, max_tokens: maxTokens, json, tier }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'llm_http_' + r.status);
    return { text: j.text, ms: Math.round(performance.now() - t0), model: j.model };
  } finally { clearTimeout(t); }
}
export function extractJSON(text) {
  if (!text) return null;
  const s = text.search(/[\[{]/); const e = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(text.slice(s, e + 1)); } catch { return null; }
}
