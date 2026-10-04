/**
 * Benchmarks Cloudflare Workers AI Whisper against Groq direct on identical audio.
 *
 * Workers AI is a remote binding (the model runs on Cloudflare's side, the Worker
 * only forwards), so this measures the network round trip plus inference, which
 * is exactly the number that decides whether it beats Groq.
 *
 * Usage: npx tsx scripts/bench-workers-ai.ts [samples] [windowSeconds]
 */
import fs from "node:fs";

function envFrom(file: string) {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const cfEnv = envFrom(`${process.env.USERPROFILE}/.opencode/cloudflare/.env`);
const projectEnv = envFrom(".env.local");
const CF_TOKEN = process.env.CF_API_TOKEN ?? cfEnv.CF_API_TOKEN ?? "";
const GROQ_KEY = projectEnv.GROQ_API_KEY ?? "";

if (!CF_TOKEN) {
  console.log("no CF_API_TOKEN found (~/.opencode/cloudflare/.env)");
  process.exit(1);
}

const SAMPLES = Number(process.argv[2] ?? 5);
const WINDOW = Number(process.argv[3] ?? 2.4);

async function main() {
  // --- resolve account ---
  const accRes = await fetch("https://api.cloudflare.com/client/v4/accounts", {
    headers: { Authorization: `Bearer ${CF_TOKEN}` },
  });
  const accJson = await accRes.json();
  if (!accRes.ok || !accJson.success) {
    console.log(`token check failed: ${JSON.stringify(accJson.errors).slice(0, 200)}`);
    process.exit(1);
  }
  const account = accJson.result[0];
  console.log(`account: ${account.name} (${account.id})`);

  // --- audio ---
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

  const url = `https://api.cloudflare.com/client/v4/accounts/${account.id}/ai/run/@cf/openai/whisper-large-v3-turbo`;

  async function callWorkersAi(json: boolean) {
    const t0 = performance.now();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        ...(json ? { "Content-Type": "application/json" } : { "Content-Type": "application/octet-stream" }),
      },
      body: json ? JSON.stringify({ audio: wav.toString("base64"), language: "zh" }) : new Uint8Array(wav),
    });
    const text = await res.text();
    return { ms: Math.round(performance.now() - t0), status: res.status, text };
  }

  async function callGroq() {
    if (!GROQ_KEY) return null;
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "c.wav");
    fd.append("model", "whisper-large-v3-turbo");
    fd.append("response_format", "verbose_json");
    fd.append("language", "zh");
    fd.append("temperature", "0");
    fd.append("timestamp_granularities[]", "segment");
    const t0 = performance.now();
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GROQ_KEY}` },
      body: fd,
    });
    const text = await res.text();
    return { ms: Math.round(performance.now() - t0), status: res.status, text };
  }

  // Probe which request shape Workers AI accepts, and whether it streams back.
  const probe = await callWorkersAi(false);
  if (probe.status !== 200) {
    const probeJson = await callWorkersAi(true);
    console.log(`binary body -> ${probe.status}  ${probe.text.slice(0, 140).replace(/\n/g, " ")}`);
    console.log(`json body   -> ${probeJson.status}  ${probeJson.text.slice(0, 240).replace(/\n/g, " ")}`);
    process.exit(probeJson.status === 200 ? 0 : 1);
  }
  console.log(`binary body accepted, sample response: ${probe.text.slice(0, 200).replace(/\n/g, " ")}\n`);

  const ai: number[] = [];
  const groq: number[] = [];

  await callWorkersAi(false); // warm
  if (GROQ_KEY) await callGroq();

  for (let i = 0; i < SAMPLES; i++) {
    const a = await callWorkersAi(false);
    if (a.status === 200) ai.push(a.ms);
    const g = await callGroq();
    if (g?.status === 200) groq.push(g.ms);
    console.log(
      `  sample ${i + 1}: workers-ai ${String(a.ms).padStart(5)}ms` +
        (g ? `   groq ${String(g.ms).padStart(5)}ms` : "")
    );
  }

  const stat = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return { min: s[0], med: s[Math.floor(s.length / 2)], avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length), max: s[s.length - 1] };
  };

  console.log("");
  if (ai.length) {
    const s = stat(ai);
    console.log(`workers-ai : min ${s.min}  median ${s.med}  avg ${s.avg}  max ${s.max}`);
  } else console.log("workers-ai : no successful samples");
  if (groq.length) {
    const s = stat(groq);
    console.log(`groq direct: min ${s.min}  median ${s.med}  avg ${s.avg}  max ${s.max}`);
    if (ai.length) {
      const a = stat(ai).med;
      const g = stat(groq).med;
      console.log(`\nworkers-ai is ${g - a >= 0 ? "slower by" : "faster by"} ${Math.abs(g - a)}ms (median)`);
      console.log(`perceived: ${Math.round(1200 + a)}ms vs ${Math.round(1200 + g)}ms`);
    }
  }
  console.log(`\nnote: with 2.4s windows every 1.2s, each second of audio is billed twice.`);
  console.log(`      whisper-large-v3-turbo costs 46.63 neurons/audio-minute;`);
  console.log(`      the free 10,000 neurons/day is ~214 audio-min = ~1.7h of stream.`);
}

void main();
