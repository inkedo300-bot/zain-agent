// «دفتر» demo server — zero dependencies (Node 18+).
//   node server.js   → http://localhost:8080
// Gemini key (optional — without it everything runs in offline mode):
//   1) a .env file next to this file:   GEMINI_API_KEY=...   (and optionally GEMINI_MODEL=...)
//   2) or the environment variable GEMINI_API_KEY
//   3) or paste it in the app (⚙︎ الإعدادات) — sent only to this local server, per request.
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
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';          // fast: routing, phrasing
const MODEL_STRONG = process.env.GEMINI_MODEL_STRONG || 'gemini-flash-latest';  // images, and backup when the fast one is busy
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

const body = (req) => new Promise((res, rej) => {
  let d = ''; req.on('data', (c) => { d += c; if (d.length > 12e6) rej(new Error('too large')); });
  req.on('end', () => { try { res(JSON.parse(d || '{}')); } catch (e) { rej(e); } });
});
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
const keyFor = (req) => process.env.GEMINI_API_KEY || req.headers['x-gemini-key'] || '';

async function gemini(key, req) {
  const first = req.tier === 'strong' ? MODEL_STRONG : MODEL;
  const second = first === MODEL ? MODEL_STRONG : MODEL;
  try { return await geminiOnce(key, req, first); }
  catch (e) { if (e.retryable) return await geminiOnce(key, req, second); throw e; }
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
  const payload = JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig });
  let r, j;
  // busy model (503) or rate limit (429): retry twice with a short backoff
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: payload,
    });
    j = await r.json();
    if (r.ok || ![429, 500, 503].includes(r.status)) break;
    await new Promise((res) => setTimeout(res, 900));
  }
  if (!r.ok) { const err = new Error(j.error?.message || `gemini http ${r.status}`); err.retryable = [429, 500, 503, 404].includes(r.status); throw err; }
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!text) throw new Error('gemini empty (' + (j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || 'no text') + ')');
  return { text, modelVersion: j.modelVersion };
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/health') {
      const key = keyFor(req);
      return send(res, 200, { llm: !!key, provider: key ? 'gemini' : null, model: key ? MODEL : null, keySource: process.env.GEMINI_API_KEY ? 'server' : key ? 'browser' : null });
    }
    if (url.pathname === '/api/llm' && req.method === 'POST') {
      const key = keyFor(req);
      if (!key) return send(res, 503, { error: 'no gemini key' });
      const b = await body(req);
      const t0 = Date.now();
      const { text, modelVersion } = await gemini(key, b);
      return send(res, 200, { text, ms: Date.now() - t0, model: modelVersion || MODEL });
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
  console.log(process.env.GEMINI_API_KEY ? `Gemini: ${MODEL} (backup/images: ${MODEL_STRONG})` : 'Gemini: no server key (paste one in the app settings, or run in offline mode)');
});
