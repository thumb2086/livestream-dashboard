/**
 * Reads scoreboard data from a published Google Sheet.
 *
 * Uses the public CSV export endpoint (`gviz/tq?tqx=out:csv`) rather than the
 * Sheets API, because that needs no API key and no billing — the sheet only has
 * to be shared as "anyone with the link can view".
 */

const CSV_TIMEOUT_MS = 8000;

/**
 * Pulls the spreadsheet id out of any of the URL shapes Google hands out:
 * /spreadsheets/d/<ID>/edit#gid=0, ?id=<ID>, or the bare id itself.
 */
export function extractSheetId(input: string): string {
  const url = input.trim();
  if (!url) return "";

  const fromPath = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromPath) return fromPath[1];

  const fromQuery = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (fromQuery) return fromQuery[1];

  // A bare id looks like this and nothing else.
  if (/^[a-zA-Z0-9-_]{20,}$/.test(url)) return url;

  return "";
}

function csvUrl(sheetId: string, range: string): string {
  const q = new URLSearchParams({ tqx: "out:csv" });
  if (range && range.trim() && range.trim().toLowerCase() !== "a1:z1000") q.set("range", range.trim());
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/gviz/tq?${q}`;
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF tolerant. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      // handled by the \n branch
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export type SheetSource = {
  spreadsheetUrl: string;
  sheetName: string;
  namesRange: string;
  scoresRange: string;
};

export type SheetParticipant = { id: string; name: string; score: number };

/**
 * Fetches names and scores from the sheet and zips them into participants.
 * Returns null when the sheet cannot be read, so callers can fall back to the
 * manual list instead of showing an empty scoreboard.
 */
export async function fetchSheetParticipants(
  source: SheetSource
): Promise<{ participants: SheetParticipant[] } | { error: string }> {
  const sheetId = extractSheetId(source.spreadsheetUrl);
  if (!sheetId) return { error: "無法從網址解析出試算表 ID" };

  const namesRange = source.namesRange?.trim() || "A1:A1";
  const scoresRange = source.scoresRange?.trim() || "A1:A1";

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), CSV_TIMEOUT_MS);

  let namesCsv = "";
  let scoresCsv = "";
  try {
    // Both ranges come from the same sheet, so fetch them together.
    const [n, s] = await Promise.all([
      fetch(csvUrl(sheetId, namesRange), { signal: ac.signal, cache: "no-store" }),
      fetch(csvUrl(sheetId, scoresRange), { signal: ac.signal, cache: "no-store" }),
    ]);

    if (!n.ok) return { error: `讀取名稱範圍失敗（HTTP ${n.status}），請確認試算表已設為「知道連結的人可檢視」` };
    if (!s.ok) return { error: `讀取分數範圍失敗（HTTP ${s.status}）` };

    namesCsv = await n.text();
    scoresCsv = await s.text();
  } catch (e: any) {
    return { error: e?.name === "AbortError" ? "讀取 Google Sheet 逾時" : `讀取 Google Sheet 失敗：${e?.message || e}` };
  } finally {
    clearTimeout(timer);
  }

  // A non-2xx sheet often returns an HTML sign-in page instead of CSV.
  if (/^\s*<|<!DOCTYPE html/i.test(namesCsv)) {
    return { error: "Google 回傳的是 HTML 而非 CSV，通常代表試算表未公開或需要登入" };
  }

  const names = parseCsv(namesCsv).map((r) => r.map((c) => c.trim()));
  const scores = parseCsv(scoresCsv).map((r) => r.map((c) => c.trim()));

  // A names range of one row but many columns means one competitor per column,
  // so transpose it to match the common "E71:G71" layout.
  const norm = (m: string[][]) => (m.length === 1 && m[0].length > 1 ? [m[0]] : m);

  const nameRows = norm(names).flatMap((r) => r.filter(Boolean));
  const scoreCells = norm(scores).flat().map((c) => Number(String(c).replace(/[^\d.\-]/g, "")));

  const participants: SheetParticipant[] = [];
  for (let i = 0; i < nameRows.length; i++) {
    const name = nameRows[i].trim();
    if (!name) continue;
    const raw = scoreCells[i];
    participants.push({
      id: `sheet-${i + 1}`,
      name,
      score: Number.isFinite(raw) ? raw : 0,
    });
  }

  if (participants.length === 0) return { error: "讀到了資料但沒有有效的名稱，請檢查名稱範圍" };
  return { participants };
}
