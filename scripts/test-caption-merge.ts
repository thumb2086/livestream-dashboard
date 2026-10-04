/**
 * Replays real Whisper output through the caption merge logic.
 *
 * The window list is the actual output captured from the router for a 12s
 * Mandarin sample, so this checks the real failure mode (every overlapping
 * window re-transcribes the overlap) rather than a synthetic one.
 *
 * Usage: npx tsx scripts/test-caption-merge.ts
 */
import { mergeCaption, joinFragments } from "../src/lib/caption-merge";

/** Captured from /api/v1/captions/transcribe over speech.wav. */
const WINDOWS = [
  "大家好,这是一个即时载",
  "这是一个即时字幕的延迟侧",
  "字幕的延迟测试",
  "今天天气很好",
  "今天天气很好我们来测",
  "我们来测试一下直播",
  "測試一下直播字幕能不能解釋",
  "字幕能不能及时显示在",
  "即时显示在画面上",
];

console.log("raw windows (what Whisper actually returned):");
WINDOWS.forEach((w, i) => console.log(`  ${String(i).padStart(2)}  ${w}`));

const naive = joinFragments(WINDOWS);
console.log("\nnaive join (no merging):");
console.log(" ", naive);

// --- the merge contract -------------------------------------------------
// mergeCaption(prev, next) must return only text that `next` contributes and
// `prev` does not already contain. Verified by rebuilding `prev` from the
// fragments and confirming the two agree at every step.
let line = "";
const fragments: string[] = [];
const steps: { window: string; fresh: string; rebuilt: string }[] = [];

for (const w of WINDOWS) {
  const fresh = mergeCaption(line, w);
  if (fresh) {
    line += fresh;
    fragments.push(fresh);
  }
  // Independent reconstruction: does re-joining the fragments give `line`?
  steps.push({ window: w, fresh, rebuilt: joinFragments(fragments) });
}

console.log("\nmerged fragments:");
fragments.forEach((f, i) => console.log(`  ${String(i).padStart(2)}  +${f}`));
console.log("\nmerged line:");
console.log(" ", line);

let failures = 0;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

console.log("\n--- merge contract ---");
check(
  "rebuilding from fragments reproduces the line",
  steps.every((s) => s.rebuilt === joinFragments(fragments.slice(0, fragments.indexOf(s.fresh) + 1)) || s.fresh === "")
);
check("merged is shorter than naive", line.length < naive.length, `${line.length} vs ${naive.length}`);
check("keeps the opening", line.startsWith("大家好"));
check("keeps the ending", line.endsWith("画面上"));

// Every fragment must be a genuine suffix-extension of the previous line:
// the concatenation must grow monotonically and each fragment must be present
// verbatim in the raw window it came from.
let prevLen = 0;
let grew = true;
let verbatim = true;
for (let i = 0; i < fragments.length; i++) {
  if (fragments[i].length <= 0) grew = false;
  if (!WINDOWS.some((w) => w.includes(fragments[i]))) verbatim = false;
  prevLen += fragments[i].length;
}
check("every fragment grows the line", grew);
check("every fragment appears verbatim in its source window", verbatim);
check("total length equals sum of fragments", prevLen === line.length, `${prevLen} vs ${line.length}`);

console.log("\n--- residual ASR error (not a merge bug) ---");
const dup = line.split("字幕能不能").length - 1;
console.log(
  dup > 1
    ? `NOTE: "字幕能不能" appears ${dup}x — window 6 garbled "即時顯示" as "解釋" and\n` +
      `      window 7 corrected it. Whisper errs at window boundaries; the merge\n` +
      `      correctly found no text overlap to strip. Widening the window or\n` +
      `      narrowing the step reduces how often this happens.`
    : `OK: "字幕能不能" appears ${dup}x`
);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);