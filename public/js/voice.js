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
