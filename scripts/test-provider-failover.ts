/**
 * Exercises the caption provider chain against real endpoints: which provider
 * serves a request, and when the chain falls over to the other one.
 *
 * Providers are injected rather than stubbed, so the failure modes exercised are
 * the ones that matter in production — a dead endpoint, a rejected credential,
 * and a healthy fallback.
 *
 * Usage: npx tsx scripts/test-provider-failover.ts
 */
import fs from "node:fs";
import { transcribePcm, providerOrder, type Provider } from "../src/lib/captions-groq";

/** tsx does not load .env.local, so pull the router credential in by hand. */
function loadEnvFile(file = ".env.local") {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, "");
    if (v && !v.startsWith("[") && !process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnvFile();

const router = providerOrder().find((p) => p.id === "router");
if (!router) {
  console.log("GROQ_ROUTER_URL / GROQ_ROUTER_KEY not set; skipping.");
  process.exit(0);
}

const ROUTER: Provider = { id: "router", url: router.url, key: router.key };
/** Port 9 (discard) is closed, so connecting fails immediately. */
const DEAD: Provider = { id: "direct", url: "http://127.0.0.1:9/openai/v1", key: "gsk_unused" };
/** Real Groq endpoint, credential that will be rejected with 401. */
const REJECTED: Provider = { id: "direct", url: "https://api.groq.com/openai/v1", key: "gsk_not-a-real-key" };

/** 2s of tone: enough to clear the caller's silence gate, not real speech. */
const pcm = Buffer.alloc(16000 * 2 * 2);
for (let i = 0; i < 16000 * 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 6) * 1500), i * 2);

async function attempt(providers: Provider[]) {
  const t0 = performance.now();
  try {
    const r = await transcribePcm(pcm, { language: "zh", timeoutMs: 20000 }, providers);
    return {
      outcome: "ok" as const,
      provider: r.provider,
      attempts: r.attempts,
      fellBackFrom: r.fellBackFrom ?? null,
      failReason: r.failReason ?? null,
      upstreamMs: r.latencyMs,
      roundMs: Math.round(performance.now() - t0),
      segments: r.segments.length,
    };
  } catch (e: any) {
    return {
      outcome: "error" as const,
      message: String(e?.message ?? e),
      status: typeof e?.status === "number" ? e.status : null,
      roundMs: Math.round(performance.now() - t0),
    };
  }
}

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

async function main() {
  console.log("=== router only (the path that exists today) ===");
  const a = await attempt([ROUTER]);
  console.log(" ", JSON.stringify(a));
  check("served by the router", a.outcome === "ok" && a.provider === "router", a.outcome === "ok" ? a.provider : a.message);
  check("took one attempt", a.outcome === "ok" && a.attempts === 1, String(a.attempts));

  console.log("\n=== direct unreachable, router behind it ===");
  const b = await attempt([DEAD, ROUTER]);
  console.log(" ", JSON.stringify(b));
  check("falls back to the router", b.outcome === "ok" && b.provider === "router");
  check("reports where it fell back from", b.fellBackFrom === "direct", String(b.fellBackFrom));
  check("took two attempts", b.attempts === 2, String(b.attempts));

  console.log("\n=== direct reachable but credential rejected (401) ===");
  const c = await attempt([REJECTED, ROUTER]);
  console.log(" ", JSON.stringify(c));
  check("surfaces the error", c.outcome === "error", c.outcome === "ok" ? "unexpectedly succeeded" : c.message);
  check("does not waste a router call", c.outcome === "error" && c.status === 401, `status ${c.status}`);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
