/**
 * Full live-captions simulation with real speech: cuts a WAV into the same
 * overlapping windows the browser sends, walks the committed cursor forward and
 * assembles the transcript, reporting per-window latency.
 *
 * Usage: node scripts/test-captions-speech.mjs <speech.wav> [baseUrl] [sessionId]
 */
import fs from "node:fs";

const wavPath = process.argv[2];
const base = process.argv[3] || "http://localhost:3000";
const sid = process.argv[4] || "dev-session-1";
const cookie = `sf_session=${sid}`;

const RATE = 16000;
const WINDOW_MS = 2400;
const STEP_MS = 1200;

const pcm16k = readWavAsPcm16k(wavPath);
const totalMs = Math.round((pcm16k.length / 2 / RATE) * 1000);
console.log(`source: ${wavPath}`);
console.log(`audio : ${(totalMs / 1000).toFixed(1)}s @ ${RATE}Hz mono`);

let committed = 0;
const pieces = [];
const latencies = [];

for (let start = 0; start + STEP_MS * 2 <= totalMs; start += STEP_MS) {
  const from = Math.floor((start / 1000) * RATE);
  const to = Math.min(pcm16k.length / 2, Math.floor(((start + WINDOW_MS) / 1000) * RATE));
  if (to - from < RATE * 0.6) break;
  const slice = pcm16k.subarray(from * 2, to * 2);

  const q = new URLSearchParams({
    startMs: String(start),
    sinceMs: String(Math.round(committed)),
    language: "zh",
    model: "whisper-large-v3-turbo",
  });

  const t0 = performance.now();
  const res = await fetch(`${base}/api/v1/captions/transcribe?${q}`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/octet-stream" },
    body: slice,
  });
  const j = await res.json().catch(() => ({}));
  const round = Math.round(performance.now() - t0);

  if (j.skipped) {
    console.log(`  window @${String(start).padStart(6)}ms  skipped(${j.reason})  ${String(round).padStart(5)}ms`);
    continue;
  }
  if (j.error) {
    console.log(`  window @${String(start).padStart(6)}ms  ERROR ${j.error}`);
    continue;
  }

  latencies.push(j.latencyMs);
  for (const s of j.segments ?? []) {
    pieces.push({ t: s.startMs, text: s.text });
    committed = Math.max(committed, s.endMs);
  }
  console.log(
    `  window @${String(start).padStart(6)}ms  ${String(round).padStart(5)}ms  ` +
      `segs=${(j.segments ?? []).length}  ${JSON.stringify(j.text ?? "").slice(0, 70)}`
  );
}

console.log("\n--- assembled transcript ---");
console.log(pieces.map((p) => p.text).join(""));
console.log("\n--- stats ---");
console.log(`windows transcribed : ${latencies.length}`);
if (latencies.length) {
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
  console.log(`upstream latency    : avg ${avg}ms  min ${Math.min(...latencies)}ms  max ${Math.max(...latencies)}ms`);
  console.log(`perceived delay     : ~${STEP_MS}ms (step) + ${avg}ms (upstream) ≈ ${STEP_MS + avg}ms`);
}

/** Reads a mono/stereo 16-bit PCM WAV and resamples to 16kHz mono. */
function readWavAsPcm16k(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF") throw new Error("not a RIFF wav");

  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString("ascii", pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === "fmt ") fmt = { channels: b.readUInt16LE(pos + 10), rate: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
    else if (id === "data") data = b.subarray(pos + 8, pos + 8 + size);
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error("missing fmt/data chunk");
  if (fmt.bits !== 16) throw new Error(`expected 16-bit PCM, got ${fmt.bits}`);

  const frames = Math.floor(data.length / 2 / fmt.channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < fmt.channels; c++) s += data.readInt16LE((i * fmt.channels + c) * 2) / 32768;
    mono[i] = s / fmt.channels;
  }

  const ratio = fmt.rate / RATE;
  const outN = Math.floor(mono.length / ratio);
  const out = Buffer.alloc(outN * 2);
  for (let i = 0; i < outN; i++) {
    const p = i * ratio;
    const i0 = Math.floor(p);
    const i1 = Math.min(mono.length - 1, i0 + 1);
    const t = p - i0;
    const v = Math.max(-1, Math.min(1, mono[i0] * (1 - t) + mono[i1] * t));
    out.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  return out;
}