/**
 * Internal link checker.
 *
 * `next build` lists every real route but does not tell you whether the
 * `href`s you typed resolve to one of them -- a typo becomes a 404 that only
 * shows up when a user clicks. This walks the app source, extracts every
 * internal href, and diffs it against the routes the build reports.
 *
 * Route list is read from `.next/routes-manifest.json` when present (authoritative,
 * produced by the build); otherwise it is derived from the app directory.
 *
 *   npx tsx scripts/check-links.ts
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP = join(process.cwd(), "src", "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every route Next will serve, as `/segment` paths. */
function realRoutes(): Set<string> {
  const manifest = join(process.cwd(), ".next", "routes-manifest.json");
  const routes = new Set<string>(["/"]);

  if (existsSync(manifest)) {
    const m = JSON.parse(readFileSync(manifest, "utf8"));
    for (const r of m.dynamicRoutes ?? []) {
      routes.add(r.page.replace(/\[\.\.\..*?\]$/, "").replace(/\/+$/, "") || "/");
    }
    for (const r of m.staticRoutes ?? []) {
      routes.add(r.page.replace(/\/+$/, "") || "/");
    }
    if (routes.size > 1) return routes;
  }

  // Fallback: a page.tsx exists at this segment path.
  for (const file of walk(APP)) {
    const rel = relative(APP, file).split(sep).join("/");
    if (!rel.endsWith("page.tsx")) continue;
    const segs = rel.split("/").slice(0, -1);
    if (segs.some((s) => s.startsWith("(") || s.startsWith("@"))) continue;
    const path = "/" + segs.join("/");
    routes.add(path.replace(/\/+$/, "") || "/");
  }
  return routes;
}

const files = walk(APP);
const routes = realRoutes();

/** Does `href` land on a real route? Dynamic segments are wildcards. */
function resolves(href: string): boolean {
  let p = href.split("?")[0].split("#")[0];
  if (!p.startsWith("/")) return true; // external / mailto / relative -> skip
  p = p.replace(/\/+$/, "") || "/";

  if (routes.has(p)) return true;

  const segs = p.slice(1).split("/");
  // Match a concrete path against route patterns, e.g. /overlay/chat/[token].
  for (const r of routes) {
    const rs = r === "/" ? [] : r.slice(1).split("/");
    if (rs.length !== segs.length) continue;
    let ok = true;
    for (let i = 0; i < rs.length; i++) {
      if (rs[i].startsWith("[") || rs[i].startsWith("[[...")) continue; // wildcard
      if (rs[i] !== segs[i]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

const problems: string[] = [];
let checked = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const rel = relative(process.cwd(), file).split(sep).join("/");
  // href="/x", href={'/x'}, href={`/x`}
  for (const m of src.matchAll(/href\s*=\s*(?:\{\s*)?[`'"]([^`'"]+)[`'"]/g)) {
    const href = m[1];
    if (!href.startsWith("/")) continue;
    checked++;
    if (!resolves(href)) {
      const line = src.slice(0, m.index).split("\n").length;
      problems.push(`${rel}:${line}  ->  ${href}`);
    }
  }
}

console.log(`\nfiles scanned : ${files.length}`);
console.log(`routes known  : ${routes.size}${existsSync(join(process.cwd(), ".next", "routes-manifest.json")) ? " (from build manifest)" : " (derived from app dir)"}`);
console.log(`links checked : ${checked}\n`);

if (problems.length === 0) {
  console.log("ALL LINKS RESOLVE");
  process.exit(0);
}
console.log(`BROKEN LINKS (${problems.length}):`);
for (const p of [...new Set(problems)].sort()) console.log("  " + p);
process.exit(1);