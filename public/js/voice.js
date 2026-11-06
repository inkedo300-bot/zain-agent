// Voice capture: record the microphone as 16 kHz mono WAV (a format Gemini accepts),
// so speech is transcribed by Gemini with the shop's own vocabulary (names, products)
// instead of the browser's generic recogniser.
export async function startRecording({ maxMs = 15000, onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, noiseSuppression: true, echoCancellation: true, autoGainControl: true } });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(d));
    if (onLevel) { let m = 0; for (let i = 0; i < d.length; i += 64) m = Math.max(m, Math.abs(d[i])); onLevel(m); }
  };
  src.connect(proc); proc.connect(ctx.destination);
  let done;
  const finished = new Promise((res) => { done = res; });
  const timer = setTimeout(() => stop(), maxMs);
  async function stop() {
    clearTimeout(timer);
    proc.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop());
    const rate = ctx.sampleRate; await ctx.close();
    const pcm = merge(chunks);
    const wav = encodeWav(downsample(pcm, rate, 16000), 16000);
    const url = await blobToDataURL(new Blob([wav], { type: 'audio/wav' }));
    done({ dataUrl: url, seconds: pcm.length / rate });
    return finished;
  }
  return { stop, finished };
}
function merge(chunks) { const n = chunks.reduce((a, c) => a + c.length, 0); const out = new Float32Array(n); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } return out; }
function downsample(buf, from, to) {
  if (from === to) return buf;
  const ratio = from / to, len = Math.floor(buf.length / ratio), out = new Float32Array(len);
  for (let i = 0; i < len; i++) { const s = Math.floor(i * ratio), e = Math.min(buf.length, Math.floor((i + 1) * ratio)); let sum = 0; for (let j = s; j < e; j++) sum += buf[j]; out[i] = sum / Math.max(1, e - s); }
  return out;
}
function encodeWav(samples, rate) {
  const b = new ArrayBuffer(44 + samples.length * 2), v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  let o = 44; for (const x of samples) { const c = Math.max(-1, Math.min(1, x)); v.setInt16(o, c < 0 ? c * 0x8000 : c * 0x7fff, true); o += 2; }
  return b;
}
const blobToDataURL = (blob) => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });

// Speech → text on the server's other engines: 'grok' (xAI) or 'whisper' (Whisper large-v3 on Groq).
export async function sttRemote(engine, dataUrl, prompt) {
  const r = await fetch('/api/stt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engine, audio: dataUrl, prompt }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'stt_http_' + r.status);
  return j;
}

// Text → speech. The browser's Iraqi voice comes first: Microsoft Edge offers every page Microsoft's natural
// «باسل» and «رنا» (Arabic – Iraq), free and without a key. Then Grok (xAI) when the server has a key (its closest
// accent is the Gulf one), then any other Arabic voice the browser has. Chrome on Windows has no Arabic voice at all,
// so there the answer is not read rather than read with an English voice. Only one answer plays at a time.
let current = null;
export function stopSpeaking() {
  if (current) { current.cancel(); current = null; }
  try { window.speechSynthesis?.cancel(); } catch {}
}
export const isSpeaking = () => !!current;
// what the ear needs, not the eye: currency and symbols as words, no markup
export function speakable(text) {
  return String(text || '').replace(/<[^>]+>/g, ' ').replace(/[«»"*_#]/g, '').replace(/د\.ع/g, 'دينار')
    .replace(/(\d),(?=\d{3})/g, '$1').replace(/\s+/g, ' ').trim().slice(0, 1200);
}
// the best Arabic voice in a list: Iraqi first («باسل» for a man's voice, «رنا» for a woman's), natural (online) before
// installed, then the Gulf accents closest to Basra, then any Arabic. null when there is none.
const NEAR = ['ar-kw', 'ar-bh', 'ar-sa', 'ar-ae', 'ar-qa', 'ar-om'];
export function chooseVoice(voices, { who = 'male', iraqiOnly = false } = {}) {
  const lang = (v) => String(v.lang || '').replace('_', '-').toLowerCase();
  const ar = (voices || []).filter((v) => /^ar(-|$)/.test(lang(v)));
  const natural = (v) => (/natural|online|neural/i.test(v.name) || v.localService === false ? 1 : 0);
  const best = (list) => [...list].sort((x, y) => natural(y) - natural(x))[0] || null;
  const iq = ar.filter((v) => lang(v) === 'ar-iq');
  if (iq.length) {
    const named = iq.filter((v) => (who === 'female' ? /رنا|rana/i : /باسل|bassel/i).test(v.name));
    return best(named.length ? named : iq);
  }
  if (iraqiOnly) return null;
  for (const l of NEAR) { const v = best(ar.filter((x) => lang(x) === l)); if (v) return v; }
  return best(ar);
}
// the browser's voices arrive a moment after the page loads (Edge fetches its online ones)
export async function browserVoices(waitMs = 2500) {
  const synth = typeof window !== 'undefined' && window.speechSynthesis;
  if (!synth) return [];
  if (synth.getVoices().length) return synth.getVoices();
  await new Promise((res) => { synth.addEventListener('voiceschanged', res, { once: true }); setTimeout(res, waitMs); });
  return synth.getVoices();
}
// for Settings: is there an Iraqi voice here, or at least an Arabic one?
export async function voiceStatus(who = 'male') {
  const vs = await browserVoices();
  return { iraqi: chooseVoice(vs, { who, iraqiOnly: true })?.name || null, arabic: chooseVoice(vs, { who })?.name || null };
}
export async function speak(text, { engine = null, who = 'male', onEnd } = {}) {
  stopSpeaking();
  const t = speakable(text); if (!t) return null;
  let cancelled = false;
  const me = { engine: null, voice: null, cancel: () => { cancelled = true; } };
  current = me;
  const done = () => { if (current === me) current = null; onEnd?.(); };
  const voices = await browserVoices();
  if (cancelled) return null;
  const iraqi = chooseVoice(voices, { who, iraqiOnly: true });
  if (engine === 'grok' && !iraqi) {
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: t }) });
      if (!r.ok) throw new Error('tts_http_' + r.status);
      const url = URL.createObjectURL(await r.blob());
      if (cancelled) { URL.revokeObjectURL(url); return null; }
      const a = new Audio(url);
      me.engine = 'grok';
      me.cancel = () => { cancelled = true; a.pause(); URL.revokeObjectURL(url); };
      a.onended = () => { URL.revokeObjectURL(url); done(); };
      await a.play();
      return me;
    } catch { if (cancelled) return null; /* fall through to the browser voice */ }
  }
  const synth = window.speechSynthesis, v = iraqi || chooseVoice(voices, { who });
  if (!synth || !v) { done(); return null; }
  const u = new SpeechSynthesisUtterance(t);
  u.voice = v; u.lang = v.lang; u.rate = 1;
  me.engine = 'browser'; me.voice = v.name;
  me.cancel = () => { cancelled = true; synth.cancel(); };
  u.onend = done; u.onerror = done;
  synth.speak(u);
  return me;
}
