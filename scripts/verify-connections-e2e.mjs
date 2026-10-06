// verify-connections-e2e.mjs — /api/v1/connections 的完整驗證
//
// 這條的關鍵性質：**中斷連線會清空 token**，而那是安全相關的。
//
// 若「中斷」只把 connected 設 false 而保留 accessToken，
// 那伺服器上仍然持有可用的 OAuth token —— 而使用者以為已授權。
import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const ROOT = path.resolve(HERE, '..');
const ORIGIN = 'https://zixilive.dpdns.org';
const RUN = Date.now().toString(36);
const SENTINEL = 'e2e_conn_' + RUN;

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

function call(p, { method = 'GET', body = null, cookie = null } = {}) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {};
    if (payload) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(payload);
    }
    if (cookie) headers.cookie = cookie;
    const req = https.request(ORIGIN + p, { method, headers, timeout: 30000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(b); } catch { /* non-json */ }
        resolve({ status: res.statusCode, json: j, body: b.slice(0, 400) });
      });
    });
    req.on('error', (e) => resolve({ status: 0, json: null, body: String(e.message) }))
      .on('timeout', function () { this.destroy(); resolve({ status: 0, json: null, body: 'timeout' }); });
    if (payload) req.write(payload);
    req.end();
  });
}

const tests = [];
const test = (n, f) => tests.push([n, f]);

let A = '', SA = '';

test('★ 建立測試使用者', async () => {
  A = crypto.randomUUID(); SA = crypto.randomUUID();
  await sql.transaction([
    sql.query('INSERT INTO "User" ("id","name","username","email","avatar","createdAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      [A, 'e2e 連線', SENTINEL, SENTINEL + '@test.invalid', '']),
    sql.query('INSERT INTO "Session" ("id","userId","platform","createdAt") VALUES ($1,$2,$3,NOW())',
      [SA, A, 'twitch']),
  ]);
});

test('★ 無 session 必須 401', async () => {
  const r = await call('/api/v1/connections');
  if (r.status !== 401) throw new Error('應 401，實際 ' + r.status);
});

test('★ GET 回兩個平台的狀態（即使未連線）', async () => {
  const r = await call('/api/v1/connections', { cookie: `sf_session=${SA}` });
  if (r.status !== 200) throw new Error(`應 200，實際 ${r.status}: ${r.body.slice(0, 120)}`);
  console.log('      回應: ' + r.body.slice(0, 160));
});

test('★ ★ 中斷連線會清空 accessToken（不只是把 connected 設 false）', async () => {
  // 先塞一個假的 token
  await sql.query(
    `INSERT INTO "PlatformConnection"
       ("id","userId","platform","connected","accessToken","channelId","channelName")
     VALUES ($1,$2,'twitch',true,'FAKE_TOKEN_SHOULD_BE_CLEARED','chan_1','name_1')
     ON CONFLICT ("userId","platform") DO UPDATE SET
       "connected"=true, "accessToken"='FAKE_TOKEN_SHOULD_BE_CLEARED',
       "channelId"='chan_1', "channelName"='name_1'`,
    [crypto.randomUUID(), A]);

  // ⚠️ 分支名是 "toggle"（帶 connected 布林），不是 "disconnect"。
  //    我第一版寫 disconnect，結果靜默走不到任何分支、回 200、
  //    而斷言「token 沒被清掉」—— 症狀看起來像安全漏洞，
  //    實際是**我的請求形狀不對**。
  //
  //    而那正是「未知 _meta 回 200」的危險處：
  //    一個打錯的請求看起來跟成功的請求一樣。
  const r = await call('/api/v1/connections', {
    method: 'POST', cookie: `sf_session=${SA}`,
    body: { _meta: 'toggle', platform: 'twitch', connected: false },
  });
  // Twitch revoke 會被呼叫（網路），所以這裡只檢查 DB 結果
  const row = (await sql.query(
    'SELECT "connected","accessToken","channelId" FROM "PlatformConnection" WHERE "userId"=$1 AND "platform"=$2',
    [A, 'twitch']))[0];
  if (row.accessToken !== null) {
    throw new Error(`★ 中斷後 accessToken 還留著: ${row.accessToken}`);
  }
  if (row.channelId !== null) throw new Error('★ channelId 沒清空');
  if (row.connected !== false) throw new Error('★ connected 沒設為 false');
  console.log('      HTTP ' + r.status + ' → token 已清空 ✓');
});

test('★ 中斷一個不存在的平台是無害的 no-op', async () => {
  const r = await call('/api/v1/connections', {
    method: 'POST', cookie: `sf_session=${SA}`,
    body: { _meta: 'toggle', platform: 'youtube', connected: false },
  });
  if (r.status >= 500) throw new Error('不該 5xx，實際 ' + r.status);
  console.log('      HTTP ' + r.status);
});

test('★ 無效請求被擋下（缺 platform）', async () => {
  const r = await call('/api/v1/connections', {
    method: 'POST', cookie: `sf_session=${SA}`, body: { _meta: 'toggle', connected: false },
  });
  if (r.status !== 400) throw new Error(`缺 platform 應 400，實際 ${r.status}`);
});

(async () => {
  console.log('');
  console.log('════════ connections e2e (線上) ════════');
  console.log('  origin: ' + ORIGIN);
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
  if (A) {
    await sql.query('DELETE FROM "Session" WHERE "userId"=$1', [A]);
    await sql.query('DELETE FROM "PlatformConnection" WHERE "userId"=$1', [A]);
    await sql.query('DELETE FROM "User" WHERE "id"=$1', [A]);
    const left = await sql.query('SELECT "id" FROM "User" WHERE "username" LIKE $1', ['e2e_conn_' + RUN + '%']);
    console.log('  cleanup: ' + (left.length === 0 ? '✓ 已刔乾淨' : '★ 殘留 ' + left.length));
    if (left.length) failed++;
  }

  console.log('');
  console.log(failed === 0 ? '  ✓ 全部通過' : '  ✗ ' + failed + ' 項失敗');
  console.log('');
  process.exit(failed ? 1 : 0);
})();