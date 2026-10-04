// Dev helper: verifies the caption path the OBS overlay actually reads —
// /api/v1/captions/segments (polling) and /api/v1/captions/stream (SSE).
// Note the overlay does NOT use /api/v1/overlay-data/captions.
//
// Usage: node scripts/check-caption-pipeline.mjs [baseUrl] [sessionId]
const base = process.argv[2] || "http://localhost:3000";
const cookie = `sf_session=${process.argv[3] || "dev-session-1"}`;

const j = async (url, init) => {
  const res = await fetch(base + url, {
    ...init,
    headers: { Cookie: cookie, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 60);
  }
  return { status: res.status, body };
};

let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

const { sources } = (await j("/api/v1/obs")).body;
const cap = sources.find((s) => s.key === "captions");
if (!cap) {
  console.log("FAIL  captions overlay source missing — run: node scripts/enable-overlays.mjs");
  process.exit(1);
}
const token = new URL(cap.url).pathname.split("/").pop();
console.log(`overlay: ${cap.url}\n`);

const MARK = `caption-check-${Date.now()}`;

const stream = await fetch(`${base}/api/v1/captions/stream?token=${token}`);
// Only read the body on failure — a healthy SSE stream never ends, so
// awaiting text() on it would hang forever.
const failure = stream.status === 200 ? "" : await stream.text();
check("SSE stream is open (not disabled)", stream.status === 200, `status ${stream.status} ${failure.slice(0, 40)}`);

// Start collecting SSE frames in the background: the stream stays open, so
// awaiting it before posting would deadlock.
let sse = "";
let stopReading = false;
const sseDone = stream.status === 200
  ? (async () => {
      const reader = stream.body.getReader();
      const dec = new TextDecoder();
      while (!stopReading) {
        const { value, done } = await reader.read();
        if (done) return;
        sse += dec.decode(value);
        if (sse.includes(MARK)) return;
      }
    })().catch(() => {})
  : Promise.resolve();

await j("/api/v1/captions/segments", {
  method: "POST",
  body: JSON.stringify({ text: MARK, speaker: "host", status: "final" }),
});
await j("/api/v1/captions/segments", {
  method: "POST",
  body: JSON.stringify({ text: `${MARK}-second`, speaker: "host", status: "final" }),
});

const seg = await j(`/api/v1/captions/segments?token=${token}`);
const pollHit = JSON.stringify(seg.body).includes(MARK);

await Promise.race([sseDone, new Promise((r) => setTimeout(r, 3000))]);
stopReading = true;

const pollPayload = JSON.stringify(seg.body);
const sseHit = sse.includes(MARK);

console.log(`polling payload: ${pollPayload.slice(0, 220)}\n`);
check("polling endpoint returns the new segment", pollHit);
check("SSE broadcast delivered the new segment", sseHit);

const html = await (await fetch(cap.url)).text();
check("overlay HTML is served", html.includes("/api/v1/captions/stream"), "overlay subscribes to SSE");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
