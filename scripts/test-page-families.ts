/**
 * Structural audit of how each dashboard page gets its styling.
 *
 * Reports three things per page, because they mean different things:
 *
 *  - shell      : uses the shared overlay shell (and with which class family)
 *  - own        : page-authored classes belonging to its livio family
 *  - tailwind   : arbitrary-value utilities, which is what "not 1:1" looks like
 *
 * This is a source-level audit. A page that renders its shell through
 * `family="..."` will emit those class names at runtime even though the string
 * never appears in its own file, so `shell` and `own` are counted separately and
 * neither is treated as proof of visual parity on its own.
 *
 * Usage: npx tsx scripts/test-page-families.ts
 */
import fs from "node:fs";

/** livio family -> our page directory. */
const PAGES: { file: string; family: string }[] = [
  { file: "chat", family: "chat-settings" },
  { file: "subtitles", family: "captions-settings" },
  { file: "scoreboard", family: "overlay-settings" },
  { file: "live-viewers", family: "overlay-settings" },
  { file: "follower-alert", family: "overlay-settings" },
  { file: "stats", family: "channel-stats-settings" },
  { file: "donations", family: "donation-goal" },
  { file: "replay-analysis", family: "replay-analysis" },
  { file: "commerce", family: "commerce-admin" },
  { file: "membership", family: "member" },
  { file: "subscription", family: "subscription" },
];

function familyClasses(css: string, family: string): Set<string> {
  const out = new Set<string>();
  const re = new RegExp(`\\.${family}[a-z0-9-]*`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.add(m[0].slice(1));
  return out;
}

function sourceClasses(src: string): Set<string> {
  const out = new Set<string>();
  const re = /className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    for (const chunk of `${m[1] ?? ""} ${m[2] ?? ""} ${m[3] ?? ""}`.split(/\$\{|\}/)) {
      for (const tok of chunk.match(/[A-Za-z][A-Za-z0-9_-]*/g) ?? []) out.add(tok);
    }
  }
  return out;
}

/** Utilities that only make sense as Tailwind. */
function tailwindCount(src: string): number {
  const classes = sourceClasses(src);
  let n = 0;
  for (const c of classes) {
    if (/^(sm|md|lg|xl|2xl|dark|group|peer|flex|grid|gap|text|bg|border|rounded|p|m|w|h|min|max|gap|space|absolute|relative|sticky|hidden|items|justify|font|leading|overflow|transition|shadow|opacity|z|top|left|right|bottom|inset|translate|scale|col|row|order|pointer|whitespace|truncate|uppercase|tracking|list|divide|ring|outline|select|cursor|resize|appearance|backdrop|filter|duration|ease|delay|from|via|to|animate|will|object|aspect|placeholder|caret|accent|scroll|snap|content|box|place|items|self|justify|flex|shrink|grow|basis|line|decoration|underline|uppercase)$/.test(c)) {
      n++;
    } else if (/^(sm|md|lg|xl|2xl|hover|focus|dark|group|peer):/.test(c)) {
      n++;
    }
  }
  return n;
}

const cssDir = "public/css";
const css = fs
  .readdirSync(cssDir)
  .filter((f) => f.startsWith("dashboard.") && f.endsWith(".css"))
  .map((f) => fs.readFileSync(`${cssDir}/${f}`, "utf8"))
  .join("\n");

console.log(`stylesheet ${(css.length / 1024).toFixed(0)}KB — class family audit\n`);
console.log("page              family                  shell  own/css  tailwind  verdict");
console.log("-".repeat(88));

const rows: { file: string; family: string; shell: string; own: number; defined: number; tw: number; shellEmitsFamily: boolean; verdict: string }[] = [];

for (const { file, family } of PAGES) {
  const path = `src/app/dashboard/${file}/page.tsx`;
  if (!fs.existsSync(path)) {
    console.log(`${file.padEnd(17)} ${family.padEnd(23)} ${"-".padEnd(6)} ${"-".padEnd(8)} ${"-".padEnd(9)} page missing`);
    continue;
  }

  const src = fs.readFileSync(path, "utf8");
  const defined = familyClasses(css, family);
  const used = sourceClasses(src);

  const usesShell = /OverlaySettingsPage/.test(src);
  const familyProp = src.match(/family="([a-z0-9-]+)"/)?.[1] ?? "-";
  const own = [...used].filter((c) => defined.has(c)).length;
  const tw = tailwindCount(src);

  // The shared shell emits its class names from the `family` prop at runtime, so
  // a source scan cannot see them. Reporting 0 for those pages would understate
  // them, so they are judged on Tailwind removal plus an explicit family prop.
  const shellEmitsFamily = usesShell && familyProp !== "-" && defined.size > 0;
  const coverage = defined.size ? own / defined.size : 0;
  const verdict =
    tw > 0
      ? "tailwind only"
      : shellEmitsFamily
        ? `migrated via shell(${familyProp})`
        : coverage >= 0.5
          ? "migrated"
          : "partly migrated";

  console.log(
    `${file.padEnd(17)} ${family.padEnd(23)} ${(usesShell ? familyProp : "no").padEnd(6)} ${String(own + "/" + defined.size).padEnd(8)} ${String(tw).padStart(8)}  ${verdict}`
  );

  rows.push({ file, family, shell: usesShell ? familyProp : "no", own, defined: defined.size, tw, shellEmitsFamily, verdict });
}

console.log(`\nsummary`);
const migrated = rows.filter((r) => r.verdict.startsWith("migrated"));
const pending = rows.filter((r) => !migrated.includes(r));
console.log(`  pages audited          : ${rows.length}`);
console.log(`  using shared shell     : ${rows.filter((r) => r.shell !== "no").length}`);
console.log(`  migrated (no Tailwind left): ${migrated.length} (${migrated.map((r) => r.file).join(", ") || "none"})`);
console.log(`  still pending          : ${pending.length} (${pending.map((r) => r.file).join(", ") || "none"})`);
console.log(`\n  "own/css" counts classes this page emits that the stylesheet defines.`);
console.log(`  A page at 100% still may order its markup differently than livio —`);
console.log(`  proving visual parity needs a rendered-DOM comparison, not this script.`);

process.exit(0);
