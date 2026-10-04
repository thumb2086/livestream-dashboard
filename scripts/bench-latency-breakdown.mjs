/**
 * Sizes the router's share of the caption latency, without needing a raw gsk_ key.
 *
 * Two measurements:
 *  1. Edge RTT to each host with an unauthenticated request (no inference), which
 *     isolates transport cost: Vercel hop vs Groq hop.
 *  2. Transcription latency as audio length grows. A fit of latency against
 *     audio duration separates the fixed overhead (transport + queueing) from
 *     the per-second inference cost, so we can tell whether the router is the
 *     bottleneck or Whisper itself is.
 *
 * Usage: node scripts/bench-latency-breakdown.mjs [baseUrl] [apiKey] [wavPath]
 */
const base = process.argv[2] || "https://vercel-router-khaki.vercel.app";
const key = process.argv[3];
if (!key) {
  console.error("usage: node scripts/bench-latency-breakdown.mjs <baseUrl> <ak_...> [speech.wav]");
  process.exit(1);
}
const wavPath = process.argv[4];

const ms = (t) => Math.round(t);
const p16 = (x) => Math.min(100, Math.max(0, Math.round(x * 100))) + "%";

// ---------------------------------------------------------------- transport
console.log("=== edge RTT (unauthenticated, no inference) ===");
for (let i = 0; i < 3; i++) {
  const t0 = performance.now();
  const r = await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer not-a-real-key` } });
  await r.text();
  console.log(`  router  attempt ${i + 1}: ${ms(performance.now() - t0).toString().padStart(5)}ms  http=${r.status}`);
}
for (let i = 0; i < 3; i++) {
  const t0 = performance.now();
  const r = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer gsk_not-a-real-key` },
  });
  await r.text();
  console.log(`  groq    attempt ${i + 1}: ${ms(performance.now() - t0).toString().padStart(5)}ms  http=${r.status}`);
}

// --------------------------------------------------------------- inference
console.log("\n=== transcription latency vs audio length ===");
console.log("audio is synthetic tone; only the timing matters here.\n");
console.log("  audio(s)   audioMs   total(ms)   per-audio-sec(ms)");

const samples = [];
for (const seconds of [0.5, 1.0, 2.0, 3.0, 5.0]) {
  const pcm = makeTone(seconds);
  const fd = new FormData();
  fd.append("file", new Blob([pcmToWav(pcm)], { type: "audio/wav" }), "c.wav");
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("response_format", "verbose_json");
  fd.append("language", "zh");
  fd.append("temperature", "0");
  fd.append("timestamp_granularities[]", "segment");

  const t0 = performance.now();
  const r = await fetch(`${base}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  await r.text();
  const total = ms(performance.now() - t0);
  const audioMs = seconds * 1000;
  samples.push({ audioMs, total });
  console.log(
    `  ${seconds.toFixed(1).padStart(6)}   ${String(audioMs).padStart(7)}   ${String(total).padStart(8)}   ${String(Math.round(total / seconds)).padStart(8)}`
  );
}

// Least squares fit: total = fixed + perSec * audioMs
const n = samples.length;
const sumX = samples.reduce((a, s) => a + s.audioMs, 0);
const sumY = samples.reduce((a, s) => a + s.total, 0);
const sumXY = samples.reduce((a, s) => a + s.audioMs * s.total, 0);
const sumXX = samples.reduce((a, s) => a + s.audioMs * s.audioMs, 0);
const perSec = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
const fixed = (sumY - perSec * sumX) / n;

console.log("\n=== fit ===");
console.log(`  fixed overhead : ${Math.round(fixed)}ms`);
console.log(`  per audio sec  : ${Math.round(perSec)}ms`);
console.log(`  at 2.4s window : ${Math.round(fixed + perSec * 2400)}ms total`);
console.log(
  `\n  fixed overhead is ${p16(fixed / (fixed + perSec * 2400))} of a 2.4s-window request;` +
    ` per-audio-second inference is ${p16((perSec * 2400) / (fixed + perSec * 2400))}.`
);

function pcmToWav(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(16000, 24);
  h.writeUInt32LE(32000, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

function makeTone(seconds) {
  const n = Math.round(16000 * seconds);
  const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++)
    b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / 16000) * 1500), i * 2);
  return b;
}
