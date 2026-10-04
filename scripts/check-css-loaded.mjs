/**
 * Confirms the dashboard stylesheet is actually served and loaded on a page,
 * since a page can carry perfect class names and still render unstyled if the
 * CSS bundle never arrives.
 *
 * Usage: node scripts/check-css-loaded.mjs [dashboardPath]
 */
const base = process.argv[3] || "http://localhost:3000";
const path = process.argv[2] || "/dashboard/chat";

const res = await fetch(base + path, { headers: { Cookie: "sf_session=dev-session-1" } });
const html = await res.text();

const links = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
const preloads = [...html.matchAll(/<link[^>]*rel="preload"[^>]*as="style"[^>]*href="([^"]+)"/g)].map((m) => m[1]);

console.log(`GET ${path} -> ${res.status}, ${html.length} bytes`);
console.log(`stylesheet links: ${links.length}`);
for (const l of links) console.log(`  ${l}`);
if (preloads.length) {
  console.log(`style preloads: ${preloads.length}`);
  for (const l of preloads) console.log(`  ${l}`);
}

const scopeIdx = html.indexOf("data-livecore-entry");
console.log(`\nscope attribute present: ${scopeIdx >= 0}`);
if (scopeIdx >= 0) console.log(`  …${html.slice(Math.max(0, scopeIdx - 50), scopeIdx + 50).replace(/\s+/g, " ")}…`);

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const all = [...links, ...preloads];
check("stylesheet is linked", all.length > 0, `${all.length} url(s)`);

// Confirm the family actually exists inside one of the served bundles.
let familyHit = null;
for (const url of all.filter((u) => u.includes("/css/"))) {
  const full = url.startsWith("http") ? url : base + url;
  const css = await fetch(full).then((r) => r.text());
  const n = (css.match(/\.chat-settings/g) || []).length;
  if (n > 0) familyHit = { url, n, total: css.length };
  console.log(`  ${url} -> ${(css.length / 1024).toFixed(0)}KB, .chat-settings occurrences: ${n}`);
}
check("served CSS contains .chat-settings rules", !!familyHit, familyHit ? `${familyHit.n} in ${familyHit.url}` : "not found");

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
