/**
 * Joining consecutive Whisper outputs into one caption line.
 *
 * Whisper does not expose word-level timestamps through Groq, only per-segment
 * ones, and a segment usually spans the whole window. That means overlapping
 * windows re-transcribe the same words and any time-based cursor would either
 * duplicate them or drop the new tail.
 *
 * So the join happens on the text: find the longest suffix of what we already
 * emitted that is also a prefix of the new text, and drop it. A fuzzy pass
 * handles the case where the two transcriptions differ slightly (ASR is not
 * deterministic across window boundaries).
 */

/** Minimum characters before we trust an exact affix match. */
const MIN_EXACT = 4;
/** Minimum per-character agreement for the fuzzy pass. */
const MIN_FUZZY_RATIO = 0.5;

/** Length of the longest suffix of `a` that equals a prefix of `b`. */
function affixLen(a: string, b: string, floor: number): number {
  const max = Math.min(a.length, b.length);
  for (let n = max; n >= floor; n--) {
    if (a.slice(a.length - n) === b.slice(0, n)) return n;
  }
  return 0;
}

/** Fraction of agreeing characters between two same-length strings. */
function similarity(a: string, b: string): number {
  if (!a.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length;
}

/**
 * Appends `next` to `prev`, returning only the part that is genuinely new.
 * Returns "" when `next` adds nothing.
 */
export function mergeCaption(prev: string, next: string): string {
  const a = prev.trim();
  const b = next.trim();
  if (!b) return "";
  if (!a) return b;

  // Identical replay of already-shown audio.
  if (a === b || a.endsWith(b)) return "";

  // Exact affix, respecting CJK (no spaces between words).
  const exact = affixLen(a, b, MIN_EXACT);
  if (exact >= MIN_EXACT) return b.slice(exact);

  // Fuzzy affix for near-identical re-transcriptions.
  const window = Math.min(Math.floor(b.length * 0.5), 24);
  for (let n = window; n >= 2; n--) {
    const candidate = a.slice(a.length - n);
    if (candidate.length === n && n <= b.length && similarity(candidate, b.slice(0, n)) >= MIN_FUZZY_RATIO) {
      return b.slice(n);
    }
  }

  return b;
}

/**
 * Collapses a run of merged fragments into the text a viewer should read,
 * inserting a space only between two fragments that both end/start with
 * Latin letters (CJK does not use spaces).
 */
export function joinFragments(fragments: string[]): string {
  let out = "";
  for (const raw of fragments) {
    const f = raw.trim();
    if (!f) continue;
    if (!out) {
      out = f;
      continue;
    }
    const needsSpace = /[A-Za-z0-9]$/.test(out) && /^[A-Za-z0-9]/.test(f);
    out += (needsSpace ? " " : "") + f;
  }
  return out;
}