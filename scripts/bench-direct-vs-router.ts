/**
 * A/B latency comparison: Groq direct vs the creator's groq-router.
 * Same audio, same parameters, alternating samples so drift affects both equally.
 *
 * Reads credentials from opencode's auth store when not passed explicitly.
 * Usage: npx tsx scripts/bench-direct-vs-router.ts [samples] [windowSeconds]
 */
import fs from "node:fs";

function loadOpencodeKeys() {
  const f = `${process.env.USERPROFILE}/.local/share/opencode/auth.json`;
  if (!fs.existsSync(f)) return {};
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  return { gsk: j.groq?.key, nvapi: j.nvidia?.key };
}
function loadEnvFile(file = ".env.local") {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const keys = loadOpencodeKeys();
const env = loadEnvFile();
const DIRECT_KEY = process.env.TEST_GROQ_KEY ?? keys.gsk ?? env.GROQ_API_KEY ?? "";
const ROUTER_URL = (process.env.GROQ_ROUTER_URL ?? env.GROQ_ROUTER_URL ?? "").replace(/\/+$/, "");
const ROUTER_KEY = process.env.GROQ_ROUTER_KEY ?? env.GROQ_ROUTER_KEY ?? "";

const SAMPLES = Number(process.argv[2] ?? 5);
const WINDOW = Number(process.argv[3] ?? 2.4);

if (!DIRECT_KEY) {
  console.log("no gsk_ key found (looked in env, .env.local, opencode auth.json)");
  process.exit(1);
}

const RATE = 16000;
const pcm = Buffer.alloc(RATE * WINDOW * 2);
for (let i = 0; i < RATE * WINDOW; i++) {
  pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 220 * i) / RATE) * 1500), i * 2);
}
const wav = (() => {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
})();

function form() {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "c.wav");
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("response_format", "verbose_json");
  fd.append("language", "zh");
  fd.append("temperature", "0");
  fd.append("timestamp_granularities[]", "segment");
  return fd;
}

async function time(url: string, key: string) {
  const t0 = performance.now();
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form(),
  });
  await r.text();
  return { ms: Math.round(performance.now() - t0), status: r.status };
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return {
    min: s[0],
    med: s[Math.floor(s.length / 2)],
    max: s[s.length - 1],
    avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
  };
};

async function main() {
  console.log(`window ${WINDOW}s, ${SAMPLES} samples each, alternating\n`);
  const direct: number[] = [];
  const router: number[] = [];

  // Warm both paths first so cold starts do not distort the comparison.
  await time("https://api.groq.com/openai/v1/audio/transcriptions", DIRECT_KEY);
  if (ROUTER_KEY) await time(`${ROUTER_URL}/v1/audio/transcriptions`, ROUTER_KEY);

  for (let i = 0; i < SAMPLES; i++) {
    const d = await time("https://api.groq.com/openai/v1/audio/transcriptions", DIRECT_KEY);
    direct.push(d.ms);
    let r: { ms: number; status: number } | null = null;
    if (ROUTER_KEY) {
      r = await time(`${ROUTER_URL}/v1/audio/transcriptions`, ROUTER_KEY);
      router.push(r.ms);
    }
    console.log(
      `  sample ${i + 1}: direct ${String(d.ms).padStart(5)}ms` +
        (r ? `   router ${String(r.ms).padStart(5)}ms   saving ${String(r.ms - d.ms).padStart(5)}ms` : "")
    );
  }

  const ds = stats(direct);
  console.log(`\ndirect : min ${ds.min}  median ${ds.med}  avg ${ds.avg}  max ${ds.max}`);
  if (router.length) {
    const rs = stats(router);
    console.log(`router : min ${rs.min}  median ${rs.med}  avg ${rs.avg}  max ${rs.max}`);
    const saved = rs.med - ds.med;
    console.log(`\nmedian saving: ${saved}ms  (${(saved / rs.med * 100).toFixed(0)}% faster)`);
    console.log(`perceived caption delay: ${Math.round(1200 + ds.med)}ms (was ${Math.round(1200 + rs.med)}ms)`);
  }
  void main;
}
void main();
