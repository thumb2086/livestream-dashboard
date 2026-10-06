// webhook-twitch-http.ts — Twitch EventSub webhook 的 Neon HTTP 存取
import { queryOne } from "./db-http";

export async function findUserByUsername(username: string): Promise<{ id: string } | null> {
  const r = await queryOne<{ id: string }>(
    'SELECT "id" FROM "User" WHERE "username" = $1 LIMIT 1', [username]);
  return r;
}

export async function upsertEventLog(data: {
  userId: string; platform: string; kind: string; externalId: string;
  actorName: string; actorId: string; message: string; amount: number;
  tier: string; months: number; payload: unknown;
}): Promise<void> {
  await queryOne(
    `INSERT INTO "EventLog" ("id","userId","platform","kind","externalId","actorName","actorId","message","amount","tier","months","payload","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     ON CONFLICT ("platform", "kind", "externalId") DO UPDATE SET "id" = "id"`,
    [
      crypto.randomUUID(), data.userId, data.platform, data.kind, data.externalId,
      data.actorName, data.actorId, data.message, data.amount, data.tier, data.months,
      JSON.stringify(data.payload),
    ],
  );
}
