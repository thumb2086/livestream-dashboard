// verify-auth-e2e.cjs — 用真 session 驗證 getOrCreateUser 在 Worker 上的完整路徑
//
// ══════════════════════════════════════════════════════════
// 為什麼需要這一層（Neon 直測不夠）
// ══════════════════════════════════════════════════════════
//
// scripts/test-account-http.cjs 直接呼叫 neon(url)，而部署的 Worker
// 走的是 db-http.ts 的 query() —— 同一個 driver，但**多一層包裝**。
//
// 而 401 只證明「未認證時的分支正確」（那條路徑不碰 DB）。
// 有認證時會真的查出 user 欄位 —— 那才會碰到：
//   · numeric 欄位回字串的轉換（followers / totalViews…）
//   · query() 對 { rows } 形狀的處理
//   · Workers 的 fetch 環境與本機 Node 的差異
//
// ⚠️ 而「沒有 session 時回 401」**完全不會**暴露上面任何一��。
//    那是我剛才驗到 401 就差點收工的地方 —— 它證明的東西比我以為的少。
//
// ── 這支怎麼拿到真 session ──────────────────────────────────
//
// 在 Neon 建一個測試 session（測試帳號 + session 列），
// 然後帶著那個 cookie 打線上 API。
// 不需要真的走 OAuth：那需要真的憑證，而我沒有。
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://zixilive.dpdns.org';
const RUN = Date.now().toString(36);
const SENTINEL = 'e2e_auth_' + RUN;

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

function get(p, cookie) {
  return new Promise((resolve) => {
    const headers = cookie ? { cookie } : {};
    https.request(ORIGIN + p, { method: 'GET', headers, timeout: 30000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', (e) => resolve({ status: 0, body: String(e.message) }))
      .on('timeout', function () { this.destroy(); resolve({ status: 0, body: 'timeout' }); })
      .end();
  });
}

const tests = [];
const test = (n, f) => tests.push([n, f]);

let USER_ID = '';
let SESSION = '';

test('★ 在 Neon 建立測試使用者 + session', async () => {
  USER_ID = crypto.randomUUID();
  SESSION = crypto.randomUUID();
  await sql.transaction([
    sql.query(
      `INSERT INTO "User" ("id","name","username","email","avatar","followers","totalViews","demoMode","createdAt")
       VALUES ($1,$2,$3,$4,'',777,12345,false,NOW())`,
      [USER_ID, 'e2e 驗證', SENTINEL, SENTINEL + '@test.invalid'],
    ),
    sql.query(
      'INSERT INTO "Session" ("id","userId","platform","createdAt") VALUES ($1,$2,$3,NOW())',
      [SESSION, USER_ID, 'twitch'],
    ),
  ]);
  console.log('      userId=' + USER_ID.slice(0, 16) + '…  session=' + SESSION.slice(0, 16) + '…');
});

test('★ 帶真 session 打 /api/v1/user（驗證 db-http 在 Worker 上）', async () => {
  const r = await get('/api/v1/user', `sf_session=${SESSION}`);
  if (r.status !== 200) throw new Error(`應 200，實際 ${r.status}: ${r.body.slice(0, 120)}`);
  let j;
  try { j = JSON.parse(r.body); } catch { throw new Error('不是 JSON: ' + r.body.slice(0, 120)); }
  if (j.error) throw new Error('回錯誤: ' + j.error);
  // 關鍵：followers/totalViews 是 Neon 回的**字串**，
  // auth-http.ts 應該轉成 number。沒轉的話前端拿到 "777" 而非 777。
  console.log('      回應欄位: ' + Object.keys(j).slice(0, 8).join(', '));
  const u = j.user || j;
  const f = u.followers !== undefined ? u.followers : j.followers;
  if (f !== undefined) {
    console.log('      followers 型別: ' + typeof f + '  值: ' + JSON.stringify(f));
    if (typeof f !== 'number') {
      throw new Error(`followers 應為 number（auth-http 有轉換），實際 ${typeof f} —— `
        + '代表轉換層沒生效或這個欄位沒走 auth-http');
    }
  }
});

test('★ 帶假 session 必須 401（不能因為查不到就放行）', async () => {
  const r = await get('/api/v1/user', 'sf_session=definitely_not_a_real_session');
  if (r.status !== 401) throw new Error(`假 session 應 401，實際 ${r.status} —— 那代表有帳號被誤認`);
});

test('★ 不帶 cookie 必須 401', async () => {
  const r = await get('/api/v1/user');
  if (r.status !== 401) throw new Error(`應 401，實際 ${r.status}`);
});

(async () => {
  console.log('');
  console.log('════════ auth e2e (線上 Worker) ════════');
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
  if (USER_ID) {
    await sql.query('DELETE FROM "Session" WHERE "userId"=$1', [USER_ID]);
    await sql.query('DELETE FROM "User" WHERE "id"=$1', [USER_ID]);
    const left = await sql.query('SELECT "id" FROM "User" WHERE "id"=$1', [USER_ID]);
    console.log('  cleanup: ' + (left.length === 0 ? '✓ 已刪乾淨' : '★ 殘留'));
    if (left.length) failed++;
  }

  console.log('');
  console.log(failed === 0 ? '  ✓ 全部通過' : '  ✗ ' + failed + ' 項失敗');
  console.log('');
  process.exit(failed ? 1 : 0);
})();