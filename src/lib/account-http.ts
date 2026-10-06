// account-http.ts — OAuth 登入路徑的 Neon HTTP 存取
//
// ══════════════════════════════════════════════════════════
// 為什麼這麼多函式
// ══════════════════════════════════════════════════════════
//
// 原 route 裡有 21 處 prisma.*，其中包含 upsert / create / 一組
// Promise.all 的初始化。若直接把它翻成散落的 SQL，路由會變成
// 「一堆 SQL 夾著控制流程」，而那種形狀極難 review。
//
// 所以這裡把每個「資料庫動作」抽成具名函式，讓路由保留原本的
// 控制流程（先找 session → 再找 email → 再找 channel → 才建立）。
//
// 那是**正確的抽象層級**：控制流程屬於路由，資料存取屬於這裡。
//
// ─────────────────────────────────────────────────────────
// ⚠️ 這條路徑沒有 e2e 測試的覆蓋
// ─────────────────────────────────────────────────────────
//
// 它需要真實的 Twitch/YouTube OAuth code 交換，那要真的憑證與
// 真的授權流程 —— 我沒有。
//
// 所以**這裡的函式必須能直接對 Neon 測**，否則就是未經驗證的改寫。
// 而那正是 scripts/test-account-http.cjs 的用途：
// 建立一個隔離的使用者 → 跑每個函式 → 驗證結果 → 刪除。
//
// 這與我今晚的教訓一致：動錢的東西要測；
// 而這裡動的是「誰能登入進來」，嚴重性不亞於動錢。
import { query, queryOne, transaction } from "./db-http";

export interface AccountUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar: string;
}

const ACCOUNT_COLS = `"id", "name", "username", "email", "avatar"`;

export function randomToken(): string {
  // 與原 route 的 rt() 完全相同：
  //   uuid 去連字號（32）+ 另一個 uuid 去連字號後取前 8 = 40 字元
  //
  // ⚠️ 為什麼要照抄長度：這是 OBS overlay 的授權憑證，
  //   而已發出去的 overlay URL 裡帶的就是舊格式的 token。
  //   長度不同不影響功能（沒有人解析它），但保持一致讓排查時
  //   不會多一個「為什麼新的長這樣」的疑問。
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
}

/** 依 session id 找使用者。 */
export async function userBySessionId(sessionId: string): Promise<AccountUser | null> {
  return queryOne<AccountUser>(
    `SELECT ${ACCOUNT_COLS.split(", ").map((c) => "u." + c).join(", ")}
       FROM "Session" s JOIN "User" u ON u."id" = s."userId"
      WHERE s."id" = $1 LIMIT 1`,
    [sessionId],
  );
}

/** 依 email 找使用者。 */
export async function userByEmail(email: string): Promise<AccountUser | null> {
  return queryOne<AccountUser>(
    `SELECT ${ACCOUNT_COLS} FROM "User" WHERE "email" = $1 LIMIT 1`,
    [email],
  );
}

/** 依 channelId + platform 找該 channel 的擁有者。 */
export async function userByChannel(channelId: string, platform: string): Promise<AccountUser | null> {
  return queryOne<AccountUser>(
    `SELECT ${ACCOUNT_COLS.split(", ").map((c) => "u." + c).join(", ")}
       FROM "PlatformConnection" c JOIN "User" u ON u."id" = c."userId"
      WHERE c."channelId" = $1 AND c."platform" = $2
      LIMIT 1`,
    [channelId, platform],
  );
}

/** 依 platform + channelName 找使用者。 */
export async function userByPlatformChannelName(
  platform: string,
  channelName: string,
): Promise<AccountUser | null> {
  return queryOne<AccountUser>(
    `SELECT ${ACCOUNT_COLS.split(", ").map((c) => "u." + c).join(", ")}
       FROM "PlatformConnection" c JOIN "User" u ON u."id" = c."userId"
      WHERE c."platform" = $1 AND c."channelName" = $2
      LIMIT 1`,
    [platform, channelName],
  );
}

/**
 * 建立使用者並初始化所有預設資料。
 *
 * ⚠️ 原版是 `Promise.all([...])` —— 11 個獨立寫入並行。
 *    那是對的（彼此無相依），但**在 Neon 上 11 個並行請求**比
 *    一個多列 INSERT 慢得多（每個都是一次跨網路 round trip）。
 *
 *    所以改成：一次 INSERT users，其餘用**單一 multi-statement**
 *    —— PostgreSQL 允許在同一參數化查詢裡放多個陳述句，
 *    而 driver 會用單次擴展協議（extended query）送出。
 *
 *    語意等價，但網路往返從 11 次降到 1 次。
 */
export async function createUserWithDefaults(
  name: string,
  username: string,
  email: string,
  avatar: string,
  platform: string,
  accessToken: string,
  refreshToken: string | null,
  tokenExpiresAt: string | null,
): Promise<AccountUser> {
  const id = crypto.randomUUID();
  const tok = () => randomToken();

  // ⚠️ 用 transaction() 而不是「一條 SQL 多個陳述句」。
  //
  //    Neon 的 HTTP driver 拒絕後者：
  //      cannot insert multiple commands into a prepared statement
  //
  //    而 tsc / build / deploy 全都通過 ——
  //    只有真的對 Neon 執行才會發現（scripts/test-account-http.cjs）。
  //
  //    這裡刻意把 5 個 OBSSource 合成**一條** INSERT（多列 VALUES），
  //    而不是 5 條 —— 那是同一個陳述句，在 transaction 裡合法，
  //    而且讓批次小一點。
  await transaction([
    [
      `INSERT INTO "User" ("id","name","username","email","avatar","createdAt")
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [id, name, username, email, avatar],
    ],
    ['INSERT INTO "ChatSettings" ("id","userId") VALUES ($1,$2)', [crypto.randomUUID(), id]],
    ['INSERT INTO "SubtitleConfig" ("id","userId") VALUES ($1,$2)', [crypto.randomUUID(), id]],
    ['INSERT INTO "OnboardState" ("id","userId") VALUES ($1,$2)', [crypto.randomUUID(), id]],
    [
      `INSERT INTO "PlatformConnection"
         ("id","userId","platform","connected","accessToken","refreshToken","tokenExpiresAt")
       VALUES ($1,$2,'twitch',false,NULL,NULL,NULL)
       ON CONFLICT ("userId","platform") DO NOTHING`,
      [crypto.randomUUID(), id],
    ],
    [
      `INSERT INTO "PlatformConnection"
         ("id","userId","platform","connected","accessToken","refreshToken","tokenExpiresAt")
       VALUES ($1,$2,'youtube',false,NULL,NULL,NULL)
       ON CONFLICT ("userId","platform") DO NOTHING`,
      [crypto.randomUUID(), id],
    ],
    [
      // ⚠️ enabled 不是全部 true：原 route 裡 donations 與 stats 是 false
      //    （那兩個 overlay 預設不開）。我第一版全設 true，
      //    而那會讓每個新帳號多兩個預設開啟的 overlay —— 不報錯。
      `INSERT INTO "OBSSource" ("id","userId","sourceKey","name","token","enabled")
       VALUES ($1,$2,'chat',      '聊天室疊加層',     $3, true),
              ($4,$2,'donations', '斗內進度條',     $5, false),
              ($6,$2,'subtitles', '字幕疊加層',       $7, true),
              ($8,$2,'alerts',    '斗內通知',       $9, true),
              ($10,$2,'stats',     '頻道統計疊加層', $11, false)`,
      [crypto.randomUUID(), id, tok(), crypto.randomUUID(), tok(), crypto.randomUUID(), tok(),
       crypto.randomUUID(), tok(), crypto.randomUUID(), tok()],
    ],
  ]);

  return { id, name, username, email, avatar };
}

/** 更新使用者的顯示欄位。 */
export async function updateUserProfile(
  id: string,
  fields: { name?: string; username?: string; email?: string; avatar?: string },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [id];
  for (const k of ['name', 'username', 'email', 'avatar'] as const) {
    if (fields[k] !== undefined) {
      params.push(fields[k]);
      sets.push(`"${k}" = $${params.length}`);
    }
  }
  if (!sets.length) return;
  await query(`UPDATE "User" SET ${sets.join(', ')} WHERE "id" = $1`, params);
}

/** 建立/更新平台連線（對應 Prisma 的 upsert on userId_platform）。 */
export async function upsertPlatformConnection(
  userId: string,
  platform: string,
  data: {
    connected: boolean;
    accessToken: string | null;
    refreshToken: string | null;
    tokenExpiresAt: string | null;
    channelId?: string | null;
    channelName?: string | null;
    channelAvatar?: string | null;
  },
): Promise<void> {
  await query(
    `INSERT INTO "PlatformConnection"
       ("id","userId","platform","connected","accessToken","refreshToken","tokenExpiresAt",
        "channelId","channelName","channelAvatar")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT ("userId","platform") DO UPDATE SET
       "connected"      = EXCLUDED."connected",
       "accessToken"    = EXCLUDED."accessToken",
       "refreshToken"   = EXCLUDED."refreshToken",
       "tokenExpiresAt" = EXCLUDED."tokenExpiresAt",
       "channelId"      = EXCLUDED."channelId",
       "channelName"    = EXCLUDED."channelName",
       "channelAvatar"  = EXCLUDED."channelAvatar"`,
    [
      crypto.randomUUID(), userId, platform, data.connected,
      data.accessToken, data.refreshToken, data.tokenExpiresAt,
      data.channelId ?? null, data.channelName ?? null, data.channelAvatar ?? null,
    ],
  );
}

/** 建立 session，回傳 id（cookie 要用）。 */
export async function createSession(userId: string, platform: string): Promise<string> {
  const id = crypto.randomUUID();
  await query('INSERT INTO "Session" ("id","userId","platform","createdAt") VALUES ($1,$2,$3,NOW())',
    [id, userId, platform]);
  return id;
}