/**
 * Checks whether Groq's transcriptions endpoint returns per-segment timestamps
 * through the router, which the overlapping-window dedupe depends on.
 * Usage: node scripts/probe-segments.mjs <baseUrl> <ak_...>
 */
const base = process.argv[2];
const key = process.argv[3];

const wav = makeWav(3);
const fd = new FormData();
fd.append("file", new Blob([wav], { type: "audio/wav" }), "chunk.wav");
fd.append("model", "whisper-large-v3-turbo");
fd.append("response_format", "verbose_json");
fd.append("language", "zh");
fd.append("temperature", "0");
fd.append("timestamp_granularities[]", "segment");

const t0 = performance.now();
const res = await fetch(`${base}/v1/audio/transcriptions`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}` },
  body: fd,
});
const text = await res.text();
console.log(`http=${res.status}  ${Math.round(performance.now() - t0)}ms`);

try {
  const j = JSON.parse(text);
  console.log("top-level keys:", Object.keys(j).join(", "));
  console.log("text:", JSON.stringify(j.text));
  console.log("language:", j.language, " duration:", j.duration);
  if (Array.isArray(j.segments)) {
    console.log(`segments: ${j.segments.length}`);
    console.log(JSON.stringify(j.segments.slice(0, 3), null, 2));
  } else {
    console.log("segments: NONE -> no word/segment timestamps available");
  }
} catch {
  console.log("non-JSON response:", text.slice(0, 400));
}

function makeWav(seconds) {
  const rate = 16000;
  const n = rate * seconds;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / rate) * 1200), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}