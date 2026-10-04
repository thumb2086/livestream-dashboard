import { prisma } from "./prisma";

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
  const row = await prisma.subtitleConfig.findUnique({ where: { userId } });
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
  return prisma.subtitleConfig.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}
