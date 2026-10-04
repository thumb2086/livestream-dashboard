// Seeds feature settings so the overlays have something to render.
// Usage: node scripts/seed-feature.mjs <featureKey> <jsonFile> [baseUrl] [sessionId]
import fs from "node:fs";

const [, , key, file, base = "http://localhost:3000", sid = "dev-session-1"] = process.argv;
const settings = JSON.parse(fs.readFileSync(file, "utf8"));

const res = await fetch(`${base}/api/v1/features/${key}`, {
  method: "PUT",
  headers: {
    Cookie: `sf_session=${sid}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ settings }),
});
console.log(key, "->", res.status, (await res.text()).slice(0, 200));