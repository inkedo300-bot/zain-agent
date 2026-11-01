// «دفتر» demo server — zero dependencies (Node 18+).
//   node server.js   → http://localhost:8080
// Gemini key (optional — without it everything runs in offline mode):
//   1) a .env file next to this file:   GEMINI_API_KEY=...   GROQ_API_KEY=... (optional)
//   2) or the environment variable GEMINI_API_KEY
//   3) or paste it in the app (⚙︎ الإعدادات) — sent only to this local server, per request.
// Voice keys (optional): XAI_API_KEY (Grok voice), GROQ_API_KEY (also runs Whisper large-v3). Server-side only.
import http from 'node:http';
import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('./', import.meta.url));
const envFile = join(HERE, '.env');
if (existsSync(envFile)) for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const ROOT = join(HERE, 'public');
const LOGS = join(HERE, 'logs');
const PORT = +process.env.PORT || 8080;
// Model setup (see README «النماذج»):
//   fast   → routing, phrasing, the agent loop      (Groq if GROQ_API_KEY is set, else Gemini Flash-Lite)
//   media  → voice and images                        (Gemini Flash-Lite: 500 requests/day on the free tier)
//   strong → reading a photographed notebook page    (Gemini Flash: only ~20/day free, so used sparingly)
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
const MODEL_STRONG = process.env.GEMINI_MODEL_STRONG || 'gemini-flash-latest';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const TEXT_PROVIDER = process.env.LLM_TEXT_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'gemini');
// Voice (see README «الصوت»):
//   speech → text: Whisper large-v3 (on Groq) → Gemini (knows the shop's names) → Grok STT (xAI), order set by STT_ORDER
//   text → speech: Grok TTS (xAI). There is no Iraqi locale, so the Gulf one (closest to Basra speech) is the default.
//   Without XAI_API_KEY the browser's own Arabic voice reads the answers.
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-large-v3';
const XAI_STT_MODEL = process.env.XAI_STT_MODEL || 'grok-voice-transcribe-2.0';
const XAI_VOICE = process.env.XAI_VOICE || 'ara';
const XAI_TTS_LANG = process.env.XAI_TTS_LANG || 'ar-AE';
const XAI_BASE = process.env.XAI_BASE_URL || 'https://api.x.ai/v1';
const GROQ_BASE = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
const STT_ORDER = (process.env.STT_ORDER || 'whisper,gemini,grok').split(',').map((x) => x.trim()).filter(Boolean);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

const body = (req) => new Promise((res, rej) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 12e6) rej(new Error('too large')); });
  req.on('end', () => { try { res(JSON.parse(d || '{}')); } catch (e) { rej(e); } });
});
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const keyFor = (req) => process.env.GEMINI_API_KEY || req.headers['x-gemini-key'] || '';
const groqKey = () => process.env.GROQ_API_KEY || '';
const xaiKey = () => process.env.XAI_API_KEY || '';
// which speech-to-text engines can run right now, in the configured order
const sttEngines = (req) => STT_ORDER.filter((e) => (e === 'gemini' && keyFor(req)) || (e === 'grok' && xaiKey()) || (e === 'whisper' && groqKey()));

// usage counters (shown in /api/health) and a small response cache: the same prompt
// during a demo or an eval re-run does not spend the free quota twice
const usage = {};
const count = (m) => { usage[m] = (usage[m] || 0) + 1; };
const cache = new Map();
const CACHE_MAX = 400, CACHE_MS = 60 * 60 * 1000;
const cacheKey = (b) => (b.images?.length ? null : JSON.stringify([b.system, b.messages, b.json, b.tier, b.max_tokens]));

// free-tier pacing: stay under each model's requests-per-minute instead of hitting 429s.
// A call waits (up to 18 s) for a free slot; if none comes it moves on to the next provider.
const RPM = { [MODEL]: +process.env.GEMINI_RPM || 13, [MODEL_STRONG]: 4, [GROQ_MODEL]: +process.env.GROQ_RPM || 28, [WHISPER_MODEL]: 18, [XAI_STT_MODEL]: 30, 'xai-tts': 30 };
const recent = {};
async function slot(m) {
  const lim = RPM[m] || 10, until = Date.now() + 18000;
  for (;;) {
    const now = Date.now();
    recent[m] = (recent[m] || []).filter((t) => now - t < 60000);
    if (recent[m].length < lim) { recent[m].push(now); return true; }
    const wait = 60000 - (now - recent[m][0]) + 50;
    if (now + wait > until) return false;
    await new Promise((r) => setTimeout(r, Math.min(wait, 1500)));
  }
}

// one entry point for every model call: picks the provider by task, falls back on errors
async function llm(req, b) {
  const ck = b.nocache ? null : cacheKey(b);
  if (ck && cache.has(ck)) { const c = cache.get(ck); if (Date.now() - c.at < CACHE_MS) return { ...c.v, cached: true }; cache.delete(ck); }
  const gKey = keyFor(req), qKey = groqKey();
  const hasMedia = (b.images || []).length > 0;
  const plan = [];
  if (!hasMedia && b.tier !== 'strong' && TEXT_PROVIDER === 'groq' && qKey) plan.push(['groq', GROQ_MODEL]);
  if (gKey) {
    if (b.tier === 'strong') plan.push(['gemini', MODEL_STRONG], ['gemini', MODEL]);
    else plan.push(['gemini', MODEL], ['gemini', MODEL_STRONG]);
  }
  if (!hasMedia && qKey && !plan.some((p) => p[0] === 'groq')) plan.push(['groq', GROQ_MODEL]);
  if (!plan.length) { const e = new Error('no model key'); e.status = 503; throw e; }
  let last;
  for (const [prov, m] of plan) {
    if (!(await slot(m))) { last = Object.assign(new Error('rate limit (paced)'), { retryable: true, quota: true }); continue; }
    try {
      const out = prov === 'groq' ? await groqOnce(qKey, b, m) : await geminiOnce(gKey, b, m);
      count(prov + ':' + m);
      const v = { text: out.text, model: out.modelVersion || m, provider: prov };
      if (ck) { cache.set(ck, { at: Date.now(), v }); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }
      return v;
    } catch (e) {
      last = e; if (!e.retryable) throw e;
      // a per-minute or per-day limit on the fast model is not a reason to burn Flash's ~20/day
      if (e.quota && prov === 'gemini' && m === MODEL && b.tier !== 'strong') { const i = plan.findIndex((p) => p[1] === MODEL_STRONG); if (i > -1) plan.splice(i, 1); }
    }
  }
  throw last;
}

// Groq speaks the OpenAI chat format (text only here)
async function groqOnce(key, { system, messages, max_tokens = 800, json = false }, m) {
  const payload = JSON.stringify({ model: m, temperature: 0.2, max_tokens,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((x) => ({ role: x.role === 'assistant' ? 'assistant' : 'user', content: x.content }))],
    ...(json ? { response_format: { type: 'json_object' } } : {}) });
  let r, j;
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: payload });
    j = await r.json().catch(() => ({}));
    if (r.ok || ![429, 500, 503].includes(r.status)) break;
    await new Promise((res) => setTimeout(res, 1200));
  }
  if (!r.ok) { const err = new Error(j.error?.message || `groq http ${r.status}`); err.retryable = [429, 500, 503, 404, 400].includes(r.status); throw err; }
  const text = j.choices?.[0]?.message?.content || '';
  if (!text) { const err = new Error('groq empty'); err.retryable = true; throw err; }
  return { text, modelVersion: 'groq/' + m };
}

async function geminiOnce(key, { system, messages, images = [], max_tokens = 800, json = false }, m) {
  const contents = messages.map((msg, i) => {
    const parts = [{ text: msg.content }];
    if (i === messages.length - 1 && msg.role === 'user') for (const u of images) {
      const mm = /^data:(.+?);base64,(.*)$/.exec(u); if (mm) parts.unshift({ inline_data: { mime_type: mm[1], data: mm[2] } });
    }
    return { role: msg.role === 'assistant' ? 'model' : 'user', parts };
  });
  const generationConfig = { temperature: 0.2, maxOutputTokens: max_tokens };
  if (json) generationConfig.responseMimeType = 'application/json';
  if (/2\.5-flash/.test(m)) generationConfig.thinkingConfig = { thinkingBudget: 0 }; // faster answers for a live demo
  else if (m === MODEL_STRONG && !/2\.5/.test(m)) generationConfig.thinkingConfig = { thinkingLevel: 'low' };
  const payload = JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig });
  let r, j;
  // busy model (503) or rate limit (429): retry twice with a short backoff
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: payload,
    });
    j = await r.json();
    if (r.ok || ![500, 503].includes(r.status)) break;
    await new Promise((res) => setTimeout(res, 900));
  }
  if (!r.ok) { const err = new Error(j.error?.message || `gemini http ${r.status}`); err.retryable = [429, 500, 503, 404].includes(r.status); err.quota = r.status === 429; if (/PerDay/.test(JSON.stringify(j))) err.message = 'daily quota: ' + err.message; throw err; }
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) { const err = new Error('gemini empty (' + (j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || 'no text') + ')'); err.retryable = true; throw err; }
  return { text, modelVersion: j.modelVersion };
}

// ── voice ──
const audioFile = (dataUrl) => {
  const m = /^data:(audio\/[\w.+-]+)(?:;[^,]*)?;base64,(.*)$/.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error('bad audio'), { status: 400 });
  const ext = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' }[m[1]] || 'wav';
  return { blob: new Blob([Buffer.from(m[2], 'base64')], { type: m[1] }), name: 'speech.' + ext };
};
async function sttOnce(engine, { audio, prompt }) {
  const { blob, name } = audioFile(audio);
  const f = new FormData();
  let url, key, m;
  if (engine === 'whisper') {
    url = GROQ_BASE + '/audio/transcriptions'; key = groqKey(); m = WHISPER_MODEL;
    f.append('model', m); f.append('language', 'ar'); f.append('temperature', '0'); f.append('response_format', 'verbose_json');
    // Whisper reads up to ~224 tokens of prompt: the shop's words steer spelling toward them
    if (prompt) f.append('prompt', String(prompt).slice(0, 400));
  } else if (engine === 'grok') {
    url = XAI_BASE + '/stt'; key = xaiKey(); m = XAI_STT_MODEL;
    f.append('model', m);
  } else throw Object.assign(new Error('unknown engine'), { status: 400 });
  if (!key) throw Object.assign(new Error('no key for ' + engine), { status: 503 });
  f.append('file', blob, name);
  if (!(await slot(m))) throw Object.assign(new Error('rate limit (paced)'), { status: 429 });
  const r = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + key }, body: f });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || j.error || `${engine} http ${r.status}`), { status: 502 });
  count(engine + ':' + m);
  // verbose_json gives per-segment confidence: drop segments Whisper itself marks as silence or as a
  // repetition loop (high compression ratio), the usual source of made-up text on dialect audio
  const segs = Array.isArray(j.segments) ? j.segments : null;
  const keep = segs?.filter((x) => !(x.no_speech_prob > 0.6 && x.avg_logprob < -0.5) && !(x.compression_ratio > 2.4));
  const text = segs ? keep.map((x) => x.text).join(' ').replace(/\s+/g, ' ').trim() : (j.text || '').trim();
  return { text, model: m, ...(segs ? { dropped: segs.length - keep.length } : {}) };
}
const ttsCache = new Map();
async function ttsOnce(text) {
  const ck = XAI_VOICE + '|' + XAI_TTS_LANG + '|' + text;
  if (ttsCache.has(ck)) return ttsCache.get(ck);
  if (!(await slot('xai-tts'))) throw Object.assign(new Error('rate limit (paced)'), { status: 429 });
  const r = await fetch(XAI_BASE + '/tts', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + xaiKey() },
    body: JSON.stringify({ text, voice_id: XAI_VOICE, language: XAI_TTS_LANG, text_normalization: true, output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 64000 } }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(j.error?.message || j.error || `grok tts http ${r.status}`), { status: 502 }); }
  const buf = Buffer.from(await r.arrayBuffer());
  count('xai:tts');
  ttsCache.set(ck, buf); if (ttsCache.size > 60) ttsCache.delete(ttsCache.keys().next().value);
  return buf;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/health') {
      const key = keyFor(req), q = groqKey();
      const textProv = TEXT_PROVIDER === 'groq' && q ? 'groq' : key ? 'gemini' : q ? 'groq' : null;
      return send(res, 200, { llm: !!(key || q), provider: textProv, model: textProv === 'groq' ? GROQ_MODEL : key ? MODEL : null,
        media: key ? MODEL : null, providers: { gemini: !!key, groq: !!q }, usage,
        keySource: process.env.GEMINI_API_KEY || q ? 'server' : key ? 'browser' : null,
        voice: { stt: sttEngines(req), tts: xaiKey() ? 'grok' : null, ttsVoice: xaiKey() ? XAI_VOICE : null, ttsLang: XAI_TTS_LANG, whisper: WHISPER_MODEL } });
    }
    if (url.pathname === '/api/stt' && req.method === 'POST') {
      const b = await body(req);
      const t0 = Date.now();
      try { const out = await sttOnce(b.engine, b); return send(res, 200, { ...out, engine: b.engine, ms: Date.now() - t0 }); }
      catch (e) { return send(res, e.status || 500, { error: String(e.message || e) }); }
    }
    if (url.pathname === '/api/tts' && req.method === 'POST') {
      if (!xaiKey()) return send(res, 503, { error: 'no XAI_API_KEY' });
      const b = await body(req);
      const text = String(b.text || '').trim().slice(0, 1500);
      if (!text) return send(res, 400, { error: 'no text' });
      try { const buf = await ttsOnce(text); res.writeHead(200, { 'content-type': 'audio/mpeg', 'content-length': buf.length, 'cache-control': 'no-store' }); return res.end(buf); }
      catch (e) { return send(res, e.status || 500, { error: String(e.message || e) }); }
    }
    if (url.pathname === '/api/llm' && req.method === 'POST') {
      if (!keyFor(req) && !groqKey()) return send(res, 503, { error: 'no model key' });
      const b = await body(req);
      const t0 = Date.now();
      const out = await llm(req, b);
      return send(res, 200, { ...out, ms: Date.now() - t0 });
    }
    if (url.pathname === '/api/log' && req.method === 'POST') {
      const b = await body(req);
      await mkdir(LOGS, { recursive: true });
      await appendFile(join(LOGS, 'events.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...b }) + '\n');
      return send(res, 200, { ok: true });
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (!p || p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) return send(res, 403, { error: 'forbidden' });
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') return send(res, 404, { error: 'not found' });
    send(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, () => {
  console.log(`دفتر يشتغل → http://localhost:${PORT}`);
  console.log(process.env.GEMINI_API_KEY ? `Gemini: ${MODEL} (notebook photos: ${MODEL_STRONG})` : 'Gemini: no server key (paste one in the app settings, or run in offline mode)');
  console.log(groqKey() ? `Groq: ${GROQ_MODEL} (text tasks: ${TEXT_PROVIDER}), speech: ${WHISPER_MODEL}` : 'Groq: no key (optional)');
  console.log(xaiKey() ? `xAI Grok voice: TTS ${XAI_VOICE} (${XAI_TTS_LANG}), STT ${XAI_STT_MODEL}` : 'xAI: no key (optional; answers are read by the browser voice)');
});
