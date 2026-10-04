// Dev helper: enables every overlay for the signed-in account and prints the
// Browser Source URLs. Run with:  node scripts/enable-overlays.mjs [baseUrl] [sessionId]
const base = process.argv[2] || "http://localhost:3000";
const sid = process.argv[3] || "dev-session-1";
const cookie = `sf_session=${sid}`;

const j = async (url, init) => {
  const res = await fetch(base + url, {
    ...init,
    headers: { Cookie: cookie, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
};

const { sources } = await j("/api/v1/obs");
const enabled = [];
for (const s of sources) {
  if (!s.enabled) {
    await j("/api/v1/obs", {
      method: "POST",
      body: JSON.stringify({ _meta: "toggle", id: s.id, enabled: true }),
    });
  }
  enabled.push(s);
}

console.log(`token source: ${base}\n`);
for (const s of enabled) {
  console.log(`${s.key.padEnd(16)} ${s.url}`);
}

console.log("\n--- overlay render check ---");
for (const s of enabled) {
  try {
    const res = await fetch(s.url);
    const body = await res.text();
    const ok = res.ok && body.includes("<!DOCTYPE html>");
    console.log(
      `${ok ? "PASS" : "FAIL"} ${s.key.padEnd(16)} http=${res.status} bytes=${body.length}`
    );
  } catch (e) {
    console.log(`FAIL ${s.key.padEnd(16)} ${e.message}`);
  }
}

console.log("\n--- overlay-data check ---");
for (const s of enabled) {
  const key = s.key;
  const res = await fetch(`${base}/api/v1/overlay-data/${key}?token=${s.token}`);
  const txt = await res.text();
  console.log(`${res.ok ? "PASS" : "FAIL"} ${key.padEnd(16)} http=${res.status} ${txt.slice(0, 110)}`);
}