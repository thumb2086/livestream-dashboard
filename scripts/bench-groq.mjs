/**
 * Measures Groq transcription latency through the router.
 * Usage: node scripts/bench-groq.mjs [baseUrl] [apiKey] [audioPath]
 */
import fs from "node:fs";

const base = process.argv[2] || "https://vercel-router-khaki.vercel.app";
const key = process.argv[3];
const audioPath = process.argv[4];

if (!key) {
  console.error("usage: node scripts/bench-groq.mjs <baseUrl> <ak_...> [audio.wav]");
  process.exit(1);
}

const audio = audioPath ? fs.readFileSync(audioPath) : makeWav(3);

// --- health ---
const h = await fetch(`${base}/api/health`);
const hj = await h.json().catch(() => ({}));
console.log("health:", h.status, JSON.stringify(hj).slice(0, 220));

// --- models ---
const m = await fetch(`${base}/v1/models`, { headers: { Authorization: `Bearer ${key}` } });
const mj = await m.json().catch(() => ({}));
const ids = (mj.data ?? []).map((x) => x.id).filter((id) => /whisper/i.test(id));
console.log("models:", m.status, "whisper:", JSON.stringify(ids));

async function once(model, label) {
  const fd = new FormData();
  fd.append("file", new Blob([audio], { type: "audio/wav" }), "chunk.wav");
  fd.append("model", model);
  fd.append("response_format", "verbose_json");
  if (model.includes("turbo")) fd.append("language", "zh");

  const t0 = performance.now();
  const res = await fetch(`${base}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  const text = await res.text();
  const ms = Math.round(performance.now() - t0);
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {}
  console.log(
    `${label.padEnd(26)} ${model.padEnd(24)} http=${res.status} ${String(ms).padStart(5)}ms  ` +
      `text=${JSON.stringify(parsed?.text ?? text).slice(0, 90)}`
  );
  return ms;
}

console.log("\n--- latency (3s wav) ---");
await once("whisper-large-v3-turbo", "cold / turbo");
await once("whisper-large-v3-turbo", "warm / turbo");
await once("whisper-large-v3-turbo", "warm / turbo");
await once("whisper-large-v3", "warm / large-v3");

/** Minimal mono 16-bit PCM WAV so the test needs no fixtures. */
function makeWav(seconds) {
  const rate = 16000;
  const n = rate * seconds;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 1200);
    data.writeInt16LE(v, i * 2);
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVE", 8);
  head.write("fmt ", 12);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}