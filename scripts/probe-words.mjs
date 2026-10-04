/**
 * Checks whether Groq returns word-level timestamps, which the live captions
 * de-duplication needs (segments straddle the committed cursor and would be
 * re-emitted in full).
 * Usage: node scripts/probe-words.mjs <speech.wav> <baseUrl> <ak_...>
 */
import fs from "node:fs";

const wavPath = process.argv[2];
const base = process.argv[3];
const key = process.argv[4];

const raw = fs.readFileSync(wavPath);

for (const gran of ["segment", "word"]) {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(raw)], { type: "audio/wav" }), "speech.wav");
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("response_format", "verbose_json");
  fd.append("language", "zh");
  fd.append("temperature", "0");
  fd.append("timestamp_granularities[]", gran);

  const t0 = performance.now();
  const res = await fetch(`${base}/v1/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  const txt = await res.text();
  const ms = Math.round(performance.now() - t0);

  let j;
  try {
    j = JSON.parse(txt);
  } catch {
    console.log(`${gran.padEnd(8)} http=${res.status} ${ms}ms  non-JSON: ${txt.slice(0, 160)}`);
    continue;
  }

  const segs = j.segments ?? [];
  const words = segs.flatMap((s) => s.words ?? []);
  console.log(
    `${gran.padEnd(8)} http=${res.status} ${String(ms).padStart(5)}ms  segments=${segs.length} words=${words.length}`
  );
  if (segs.length) {
    console.log(`         segments[0]: ${JSON.stringify(segs[0]).slice(0, 180)}`);
  }
  if (words.length) {
    console.log(`         words[0..5]: ${JSON.stringify(words.slice(0, 6).map((w) => [w.word, w.start, w.end]))}`);
  }
}