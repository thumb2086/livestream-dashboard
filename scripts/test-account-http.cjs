// test-account-http.cjs — 直接對 Neon 測 OAuth 登入路徑的資料存取
//
// ══════════════════════════════════════════════════════════
// 為什麼需要這個
// ══════════════════════════════════════════════════════════
//
// auth/callback 是**登入入口**，而它需要真實的 Twitch/YouTube OAuth code
// 交換才能走完 —— 那要真的憑證與真的授權流程，我沒有。
//
// 所以「改寫過、tsc 過、build 過」**不等於**「它能用」。
// 而登入壞掉的症狀是用戶看到 callback_failed，
// 那看起來像憑證問題而不是資料庫問題 —— 極難診斷。
//
// 這支測的第一件事就是回報一個 tsc/build 都抓不到的錯誤：
//
//   cannot insert multiple commands into a prepared statement
//
// Neon 的 HTTP driver 拒絕 prepared statement 裡的多個陳述句。
// 而我第一版正是那樣寫的（6 個 INSERT 用分號隔開）。
// 它過了型別檢查、過了 build、過了 deploy —— 只有真的執行才炸。
//
// ⚠️ 這支測 SQL 語句；它**不**證明 Worker 環境能跑 ——
//   那要部署後的 HTTP 驗證（兩個不同的失效模式）。
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RUN = Date.now().toString(36);
const SENTINEL = 'e2e_acct_' + RUN;

function env(name) {
  for (const f of ['.env', '.env.local']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    const m = new RegExp('^' + name + '=(.*)$', 'm').exec(fs.readFileSync(p, 'utf8'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}
const sql = neon(env('DATABASE_URL') || '');

const rt = () =>
  crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8);

const tests = [];
const test = (n, f) => tests.push([n, f]);

let USER_ID = '';
let SESSION_ID = '';

test('★ 建立使用者 + 預設資料（用 transaction，不是多陳述句）', async () => {
  USER_ID = crypto.randomUUID();
  await sql.transaction([
    sql.query(
      'INSERT INTO "User" ("id","name","username","email","avatar","createdAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      [USER_ID, 'e2e 名稱', SENTINEL, 'e2e_' + RUN + '@test.invalid', ''],
    ),
    sql.query('INSERT INTO "ChatSettings" ("id","userId") VALUES ($1,$2)', [crypto.randomUUID(), USER_ID]),
    sql.query('INSERT INTO "SubtitleConfig" ("id","userId") VALUES ($1,$2)', [crypto.randomUUID(), USER_ID]),
    sql.query('INSERT INTO "OnboardState" ("id","userId") VALUES ($1,$2)', [crypto.randomUUID(), USER_ID]),
    sql.query(
      `INSERT INTO "PlatformConnection" ("id","userId","platform","connected")
       VALUES ($1,$2,'twitch',false) ON CONFLICT ("userId","platform") DO NOTHING`,
      [crypto.randomUUID(), USER_ID],
    ),
    sql.query(
      `INSERT INTO "PlatformConnection" ("id","userId","platform","connected")
       VALUES ($1,$2,'youtube',false) ON CONFLICT ("userId","platform") DO NOTHING`,
      [crypto.randomUUID(), USER_ID],
    ),
    sql.query(
      `INSERT INTO "OBSSource" ("id","userId","sourceKey","name","token","enabled")
       VALUES ($1,$2,'chat','聊天室疊加層',$3,true),
              ($4,$2,'donations','斗內進度條',$5,false),
              ($6,$2,'subtitles','字幕疊加層',$7,true),
              ($8,$2,'alerts','斗內通知',$9,true),
              ($10,$2,'stats','頻道統計疊加層',$11,false)`,
      [crypto.randomUUID(), USER_ID, rt(), crypto.randomUUID(), rt(), crypto.randomUUID(), rt(),
       crypto.randomUUID(), rt(), crypto.randomUUID(), rt()],
    ),
  ]);
  const n = await sql.query('SELECT "id" FROM "User" WHERE "id" = $1', [USER_ID]);
  if (n.length !== 1) throw new Error('使用者沒被建立');
  console.log('      userId=' + USER_ID.slice(0, 18) + '…  transaction 成功');
});

test('★ 預設資料齊全：3 設定 + 2 平台 + 5 OBS', async () => {
  const r = await sql.query(
    `SELECT
       (SELECT COUNT(*)::int FROM "ChatSettings"     WHERE "userId"=$1) AS chat,
       (SELECT COUNT(*)::int FROM "SubtitleConfig"   WHERE "userId"=$1) AS sub,
       (SELECT COUNT(*)::int FROM "OnboardState"     WHERE "userId"=$1) AS onb,
       (SELECT COUNT(*)::int FROM "PlatformConnection" WHERE "userId"=$1) AS conn,
       (SELECT COUNT(*)::int FROM "OBSSource"        WHERE "userId"=$1) AS obs`,
    [USER_ID],
  );
  const c = r[0];
  const want = { chat: 1, sub: 1, onb: 1, conn: 2, obs: 5 };
  for (const [k, v] of Object.entries(want)) {
    if (Number(c[k]) !== v) throw new Error(`${k} 應為 ${v}，實際 ${c[k]}`);
  }
  console.log('      3 + 2 + 5 全齊 ✓');
});

test('★ enabled 預設值：donations 與 stats 必須 false', async () => {
  const r = await sql.query(
    'SELECT "sourceKey","enabled" FROM "OBSSource" WHERE "userId"=$1 ORDER BY "sourceKey"', [USER_ID]);
  const got = Object.fromEntries(r.map((x) => [x.sourceKey, x.enabled]));
  // 這個是我改寫時差點改錯的地方 —— 全設 true 會讓每個新帳號
  // 多兩個預設開啟的 overlay，而那不會報錯。
  if (got.donations !== false) throw new Error('donations 應為 false，實際 ' + got.donations);
  if (got.stats !== false) throw new Error('stats 應為 false，實際 ' + got.stats);
  for (const k of ['chat', 'subtitles', 'alerts']) {
    if (got[k] !== true) throw new Error(`${k} 應為 true，實際 ${got[k]}`);
  }
  console.log('      donations=false, stats=false, 其餘 true ✓');
});

test('★ OBS token 唯一且長度 40', async () => {
  const r = await sql.query('SELECT "token" FROM "OBSSource" WHERE "userId"=$1', [USER_ID]);
  const t = r.map((x) => x.token);
  if (new Set(t).size !== 5) throw new Error('token 有重複');
  for (const x of t) if (x.length !== 40) throw new Error('token 長度應為 40，實際 ' + x.length);
  console.log('      5 個唯一，長度 40 ✓');
});

test('★ upsert 第二次覆寫而非新增', async () => {
  const before = await sql.query(
    'SELECT COUNT(*)::int n FROM "PlatformConnection" WHERE "userId"=$1', [USER_ID]);
  const ups = (tok, chan) => sql.query(
    `INSERT INTO "PlatformConnection"
       ("id","userId","platform","connected","accessToken","channelId","channelName")
     VALUES ($1,$2,'twitch',true,$3,$4,$5)
     ON CONFLICT ("userId","platform") DO UPDATE SET
       "connected"=EXCLUDED."connected", "accessToken"=EXCLUDED."accessToken",
       "channelId"=EXCLUDED."channelId", "channelName"=EXCLUDED."channelName"`,
    [crypto.randomUUID(), USER_ID, tok, chan, 'n_' + chan]);
  await ups('tok_first', 'chan_1');
  await ups('tok_second', 'chan_2');
  const after = await sql.query(
    'SELECT COUNT(*)::int n FROM "PlatformConnection" WHERE "userId"=$1', [USER_ID]);
  if (Number(after[0].n) !== Number(before[0].n)) {
    throw new Error(`upsert 新增了列：${before[0].n} → ${after[0].n}`);
  }
  const row = await sql.query(
    'SELECT "accessToken","channelName" FROM "PlatformConnection" WHERE "userId"=$1 AND "platform"=$2',
    [USER_ID, 'twitch']);
  if (row[0].accessToken !== 'tok_second' || row[0].channelName !== 'n_chan_2') {
    throw new Error('沒有覆寫：' + JSON.stringify(row[0]));
  }
  console.log('      仍一列且值已更新 ✓');
});

test('★ session 的 JOIN 讀回（getOrCreateUser 的核心查詢）', async () => {
  SESSION_ID = crypto.randomUUID();
  await sql.query(
    'INSERT INTO "Session" ("id","userId","platform","createdAt") VALUES ($1,$2,$3,NOW())',
    [SESSION_ID, USER_ID, 'twitch']);
  const r = await sql.query(
    `SELECT u."id", u."username" FROM "Session" s JOIN "User" u ON u."id" = s."userId"
      WHERE s."id" = $1 LIMIT 1`, [SESSION_ID]);
  if (r.length !== 1) throw new Error('JOIN 讀不到');
  if (r[0].username !== SENTINEL) throw new Error('讀到錯誤的使用者');
  console.log('      JOIN 讀回 ✓');
});

test('★ channelName 為 NULL 的連線現況（舊漏洞的曝險面）', async () => {
  const r = await sql.query(
    `SELECT COUNT(*)::int n FROM "PlatformConnection" WHERE "channelName" IS NULL`);
  console.log(`      channelName 為 NULL 的既有連線: ${r[0].n}`);
  console.log('      → 舊程式碼 where:{channelName:null} 會撈到其中一個 = 身分冒用');
});

(async () => {
  console.log('');
  console.log('════════ account-http direct test ════════');
  console.log('  sentinel: ' + SENTINEL);
  console.log('');

  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('  ✓ ' + name); }
    catch (e) {
      failed++;
      console.log('  ✗ ' + name);
      console.log('    ' + (e.message || e).toString().replace(/\n/g, '\n    '));
    }
  }

  console.log('');
  if (USER_ID) {
    for (const t of ['Session', 'OBSSource', 'PlatformConnection', 'ChatSettings',
      'SubtitleConfig', 'OnboardState']) {
      await sql.query(`DELETE FROM "${t}" WHERE "userId"=$1`, [USER_ID]);
    }
    await sql.query('DELETE FROM "User" WHERE "id"=$1', [USER_ID]);
    const left = await sql.query('SELECT "id" FROM "User" WHERE "id"=$1', [USER_ID]);
    console.log('  cleanup: ' + (left.length === 0 ? '✓ 已刪乾淨' : '★ 殘留 ' + left.length + ' 列'));
    if (left.length) failed++;
  }

  console.log('');
  console.log(failed === 0 ? '  ✓ 全部通過' : '  ✗ ' + failed + ' 項失敗');
  console.log('');
  process.exit(failed ? 1 : 0);
})();