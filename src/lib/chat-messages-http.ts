// chat-messages-http.ts — 聊天訊息的 Neon HTTP 存取
//
// 覆蓋 /api/v1/chat/messages（6 處 Prisma）。
import { query, queryOne } from "./db-http";

export interface ChatMessageRow {
  id: string;
  userId: string;
  platform: string;
  userName: string;
  message: string;
  avatarUrl: string;
  isOwner: boolean;
  createdAt: string | Date;
}

function rowToMsg(r: Record<string, unknown>): ChatMessageRow {
  return {
    id: String(r.id), userId: String(r.userId), platform: String(r.platform ?? ''),
    userName: String(r.userName ?? ''), message: String(r.message ?? ''),
    avatarUrl: String(r.avatarUrl ?? ''), isOwner: Boolean(r.isOwner),
    createdAt: r.createdAt instanceof Date ? r.createdAt : String(r.createdAt ?? ''),
  };
}

export async function findConnectionByPlatformAndChannel(platform: string, channelName: string): Promise<{ userId: string } | null> {
  const r = await queryOne<{ userId: string }>(
    'SELECT "userId" FROM "PlatformConnection" WHERE "platform" = $1 AND "channelName" = $2 LIMIT 1',
    [platform, channelName],
  );
  return r;
}

export async function clearChatMessages(userId: string, names?: string[]): Promise<number> {
  let sql = 'DELETE FROM "ChatMessage" WHERE "userId" = $1';
  const params: unknown[] = [userId];
  if (names && names.length > 0) {
    params.push(names);
    sql += ` AND "userName" = ANY($${params.length}::text[])`;
  }
  const r = await query<{ id: string }>(sql + ' RETURNING "id"', params);
  return r.length;
}

export async function createChatMessage(data: {
  userId: string; platform: string; userName: string; message: string;
  avatarUrl?: string; isOwner?: boolean; createdAt?: Date | string;
}): Promise<ChatMessageRow | null> {
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO "ChatMessage" ("id","userId","platform","userName","message","avatarUrl","isOwner","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      crypto.randomUUID(), data.userId, data.platform, data.userName, data.message,
      data.avatarUrl ?? "", data.isOwner ?? false, data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
    ],
  );
  return rows[0] ? rowToMsg(rows[0]) : null;
}

export async function listChatMessages(userId: string, since?: Date | string, take = 100): Promise<ChatMessageRow[]> {
  let sql = 'SELECT * FROM "ChatMessage" WHERE "userId" = $1';
  const params: unknown[] = [userId];
  if (since) {
    params.push(new Date(since).toISOString());
    sql += ` AND "createdAt" > $${params.length}`;
  }
  sql += ' ORDER BY "createdAt" ASC LIMIT $' + (params.length + 1);
  params.push(take);
  const rows = await query<Record<string, unknown>>(sql, params);
  return rows.map(rowToMsg);
}
