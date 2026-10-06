import { queryOne } from "./db-http";

/**
 * Subtitle appearance defaults.
 *
 * These live here rather than only in the Prisma schema because the overlay and
 * the caption feed must keep working for a creator who has never opened the
 * settings page — in that case there is no SubtitleConfig row yet, and treating
 * the absence as "captions are off" would silently blank the overlay on air.
 */
export const SUBTITLE_DEFAULTS = {
  font: "微軟正黑體",
  fontSize: "中 (24px)",
  textColor: "#FFFFFF",
  bgColor: "rgba(0,0,0,0.7)",
  position: "底部置中",
  enabled: true,
} as const;

export type SubtitleSettings = {
  font: string;
  fontSize: string;
  textColor: string;
  bgColor: string;
  position: string;
  enabled: boolean;
};

/** Reads the creator's settings, falling back to the defaults above. */
export async function getSubtitleSettings(userId: string): Promise<SubtitleSettings> {
  const row = await queryOne<{ font: string; fontSize: string; textColor: string; bgColor: string; position: string; enabled: boolean }>(
    'SELECT "font", "fontSize", "textColor", "bgColor", "position", "enabled" FROM "SubtitleConfig" WHERE "userId" = $1 LIMIT 1',
    [userId],
  );
  if (!row) return { ...SUBTITLE_DEFAULTS };
  return {
    font: row.font,
    fontSize: row.fontSize,
    textColor: row.textColor,
    bgColor: row.bgColor,
    position: row.position,
    enabled: row.enabled,
  };
}

/**
 * Reads the settings and writes the default row if it is missing, so that the
 * first page load persists a real record instead of leaving the table empty.
 */
export async function ensureSubtitleConfig(userId: string) {
  return queryOne(
    `INSERT INTO "SubtitleConfig" ("id","userId") VALUES ($1,$2)
     ON CONFLICT ("userId") DO NOTHING
     RETURNING *`,
    [crypto.randomUUID(), userId],
  );
}

/** Upserts the creator's subtitle settings (only the fields present). */
export async function upsertSubtitleConfig(userId: string, data: Record<string, unknown>) {
  const sets: string[] = [];
  const params: unknown[] = [userId];
  const fields = ["enabled", "font", "fontSize", "textColor", "bgColor", "position"] as const;
  for (const k of fields) {
    if (data[k] !== undefined) {
      params.push(k === "enabled" ? Boolean(data[k]) : String(data[k] ?? ""));
      sets.push(`"${k}" = EXCLUDED."${k}"`);
    }
  }
  return queryOne(
    `INSERT INTO "SubtitleConfig" ("id","userId"${Object.keys(data).length ? ", " + fields.filter((k) => data[k] !== undefined).map((k) => '"' + k + '"').join(", ") : ""})
     VALUES ($1, $2${Object.keys(data).length ? ", " + fields.filter((k) => data[k] !== undefined).map((_, i) => "$" + (i + 3)).join(", ") : ""})
     ON CONFLICT ("userId") DO UPDATE SET ${sets.length ? sets.join(", ") : "\x22id\x22 = \x22id\x22"}
     RETURNING *`,
    [crypto.randomUUID(), userId, ...params.slice(1)],
  );
}
