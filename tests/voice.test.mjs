// Voice tests: the server's speech routes against a fake xAI / Groq, plus the client's text guards.
// node tests/voice.test.mjs   (no keys, no network)
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { looksHallucinated, cleanTranscript } from '../public/js/agent.js';
import { speakable } from '../public/js/voice.js';

let fail = 0;
const check = async (name, fn) => { try { await fn(); console.log('ok ·', name); } catch (e) { fail++; console.log('FAIL ·', name, '—', e.message); } };

// ── fake upstream: records what the server sends ──
const got = [];
const fake = http.createServer((req, res) => {
  let d = []; req.on('data', (c) => d.push(c)); req.on('end', () => {
    const raw = Buffer.concat(d); got.push({ url: req.url, auth: req.headers.authorization, type: req.headers['content-type'], raw });
    if (req.url === '/tts') { res.writeHead(200, { 'content-type': 'audio/mpeg' }); return res.end(Buffer.from('ID3fake-mp3')); }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ text: req.url.startsWith('/groq') ? ' شكد بعت اليوم ' : 'ذكّر أم زينب' }));
  });
}).listen(0);
await new Promise((r) => fake.once('listening', r));
const up = `http://127.0.0.1:${fake.address().port}`;

const start = (env, port) => new Promise((res) => {
  const p = spawn(process.execPath, ['server.js'], { env: { PATH: process.env.PATH, PORT: String(port), ...env }, cwd: new URL('..', import.meta.url).pathname });
  p.stdout.once('data', () => res(p));
});
const wav = 'data:audio/wav;base64,' + Buffer.from('RIFF....WAVEfmt ').toString('base64');
const post = (port, path, b) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

// 1) no keys: health says so, /api/tts refuses → the browser voice takes over
const p1 = await start({ GEMINI_API_KEY: '', GROQ_API_KEY: '', XAI_API_KEY: '' }, 18931);
await check('no keys: no STT engines, no Grok TTS', async () => {
  const h = await (await fetch('http://127.0.0.1:18931/api/health')).json();
  assert.deepEqual(h.voice.stt, []); assert.equal(h.voice.tts, null);
  assert.equal((await post(18931, '/api/tts', { text: 'هلا' })).status, 503);
});
p1.kill();

// 2) keys set: requests reach the right endpoints with the right fields; keys stay on the server
const p2 = await start({ GROQ_API_KEY: 'gk-test', XAI_API_KEY: 'xk-test', XAI_BASE_URL: up, GROQ_BASE_URL: up + '/groq', STT_ORDER: 'grok,whisper,gemini' }, 18932);
await check('health lists engines in STT_ORDER (gemini skipped: no key)', async () => {
  const h = await (await fetch('http://127.0.0.1:18932/api/health')).json();
  assert.deepEqual(h.voice.stt, ['grok', 'whisper']); assert.equal(h.voice.tts, 'grok');
  assert.ok(!JSON.stringify(h).includes('xk-test') && !JSON.stringify(h).includes('gk-test'));
});
await check('Whisper turbo: multipart to Groq with model, language=ar and the vocabulary prompt', async () => {
  got.length = 0;
  const j = await (await post(18932, '/api/stt', { engine: 'whisper', audio: wav, prompt: 'أم زينب، ببسي' })).json();
  assert.equal(j.text, 'شكد بعت اليوم'); assert.equal(j.engine, 'whisper');
  const g = got[0]; const body = g.raw.toString();
  assert.equal(g.url, '/groq/audio/transcriptions'); assert.equal(g.auth, 'Bearer gk-test'); assert.match(g.type, /multipart\/form-data/);
  assert.match(body, /whisper-large-v3-turbo/); assert.match(body, /name="language"\r\n\r\nar/); assert.match(body, /أم زينب/); assert.match(body, /filename="speech.wav"/);
});
await check('Grok STT: multipart to xAI /stt with its model', async () => {
  got.length = 0;
  const j = await (await post(18932, '/api/stt', { engine: 'grok', audio: wav })).json();
  assert.equal(j.text, 'ذكّر أم زينب');
  assert.equal(got[0].url, '/stt'); assert.equal(got[0].auth, 'Bearer xk-test'); assert.match(got[0].raw.toString(), /grok-voice-transcribe/);
});
await check('Grok TTS: JSON to xAI /tts with an Arabic locale, audio comes back', async () => {
  got.length = 0;
  const r = await post(18932, '/api/tts', { text: 'بعت اليوم بمليون دينار' });
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  const sent = JSON.parse(got[0].raw.toString());
  assert.equal(sent.language, 'ar-AE'); assert.equal(sent.voice_id, 'ara'); assert.equal(sent.text, 'بعت اليوم بمليون دينار');
  await post(18932, '/api/tts', { text: 'بعت اليوم بمليون دينار' });
  assert.equal(got.length, 1, 'the same sentence is cached, not billed twice');
});
await check('bad input is refused', async () => {
  assert.equal((await post(18932, '/api/stt', { engine: 'whisper', audio: 'not audio' })).status, 400);
  assert.equal((await post(18932, '/api/stt', { engine: 'nope', audio: wav })).status, 400);
});
p2.kill(); fake.close();

// ── client guards ──
await check('Whisper hallucinations are rejected (stock lines, loops, run-on text)', () => {
  assert.ok(looksHallucinated('اشتركوا في القناة'));
  assert.ok(looksHallucinated('شكرا شكرا شكرا شكرا شكرا شكرا شكرا شكرا شكرا'));
  assert.ok(looksHallucinated('ا'.repeat(301)));
  assert.ok(!looksHallucinated('شكد بعت اليوم؟ وذكّر أم زينب'));
});
await check('speakable: currency read as a word, no markup, no thousands commas', () => {
  assert.equal(speakable('ربحت <b>1,411,750 د.ع</b> «اليوم»'), 'ربحت 1411750 دينار اليوم');
});
await check('transcript touch-ups still apply', () => assert.equal(cleanTranscript('شكد بالمحزن.'), 'شكد بالمخزن'));

console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
