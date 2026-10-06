// chat-settings-http.ts — 聊天室設定的 Neon HTTP 存取
import { queryOne } from "./db-http";

export interface ChatSettingsRow {
  id: string;
  userId: string;
  enabled: boolean;
  theme: string;
  maxMessages: string;
  fontSize: string;
}

export async function getChatSettings(userId: string): Promise<ChatSettingsRow | null> {
  return queryOne<ChatSettingsRow>(
    'SELECT * FROM "ChatSettings" WHERE "userId" = $1 LIMIT 1', [userId]);
}

export async function upsertChatSettings(userId: string, data: Record<string, unknown>): Promise<ChatSettingsRow | null> {
  const cols = ['"id"', '"userId"'];
  const vals: unknown[] = [crypto.randomUUID(), userId];
  const valPlaceholders: string[] = ['$1', '$2'];
  const updateSets: string[] = [];
  for (const k of ['enabled', 'theme', 'maxMessages', 'fontSize'] as const) {
    if (k in data) {
      const v = k === 'enabled' ? Boolean(data[k]) : String(data[k] ?? '');
      vals.push(v);
      cols.push(`"${k}"`);
      valPlaceholders.push(`$${vals.length}`);
      updateSets.push(`"${k}" = EXCLUDED."${k}"`);
    }
  }
  const rows = await queryOne<Record<string, unknown>>(
    updateSets.length > 0
      ? `INSERT INTO "ChatSettings" (${cols.join(', ')}) VALUES (${valPlaceholders.join(', ')})
         ON CONFLICT ("userId") DO UPDATE SET ${updateSets.join(', ')}
         RETURNING *`
      : `INSERT INTO "ChatSettings" (${cols.join(', ')}) VALUES (${valPlaceholders.join(', ')})
         ON CONFLICT ("userId") DO NOTHING
         RETURNING *`,
    vals,
  );
  return rows ? {
    id: String(rows.id), userId: String(rows.userId), enabled: Boolean(rows.enabled),
    theme: String(rows.theme ?? 'dark'), maxMessages: String(rows.maxMessages ?? ''),
    fontSize: String(rows.fontSize ?? ''),
  } : null;
}
