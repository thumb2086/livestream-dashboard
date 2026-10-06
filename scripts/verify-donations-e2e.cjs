// verify-donations-e2e.cjs — /api/v1/donations 的完整驗證（真 session + POST）
//
// 為什麼這條要測得比別的細
//
// 它的 POST 分支有**真正的資料寫入**，而且有兩條安全相關的性質：
//
//   ① deleteGoal / updateGoal 的 where 裡有 userId → 那是**所有權檢查**。
//      若只 where id，任何登入者都能改別人的斗內目標。
//      而原始碼用 deleteMany/updateMany 且**不檢查 affected rows**，
//      所以「刪掉別人的」與「刪掉不存在的」外觀完全相同 ——
//      這代表外洩不會被發現。
//
//   ② updateUser 刻意**不**寫 donationTotal / donationDonors
//      （那是防偽造的點）。
//
// 而這些性質在 Neon 直測裡驗不到 —— 因為直測繞過了路由的
// 授權檢查。所以必須打線上。
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://zixilive.dpdns.org';
const RUN = Date.now().toString(36);
const SENTINEL = 'e2e_don_' + RUN;

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
        resolve({ status: res.statusCode, json: j, body: b.slice(0, 300) });
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

let USER_ID = '';
let OTHER_ID = '';
let SESSION = '';
let OTHER_SESSION = '';

async function seed(sentinel, demoMode) {
  const uid = crypto.randomUUID();
  const sid = crypto.randomUUID();
  await sql.transaction([
    sql.query(
      `INSERT INTO "User" ("id","name","username","email","avatar","demoMode","donationMinAmount","donationTotal","donationDonors","createdAt")
       VALUES ($1,$2,$3,$4,'',$5,50,999,7,NOW())`,
      [uid, 'e2e 斗內', sentinel, sentinel + '@test.invalid', demoMode],
    ),
    sql.query('INSERT INTO "Session" ("id","userId","platform","createdAt") VALUES ($1,$2,$3,NOW())',
      [sid, uid, 'twitch']),
  ]);
  return { uid, sid };
}

test('★ 建立兩個測試使用者（A 有 demoMode，B 沒有）', async () => {
  const a = await seed(SENTINEL, true);
  const b = await seed(SENTINEL + '_other', false);
  USER_ID = a.uid; SESSION = a.sid;
  OTHER_ID = b.uid; OTHER_SESSION = b.sid;
  console.log('      A=' + USER_ID.slice(0, 14) + '…(demo)  B=' + OTHER_ID.slice(0, 14) + '…');
});

test('★ GET 帶真 session 回目標與設定', async () => {
  const r = await call('/api/v1/donations', { cookie: `sf_session=${SESSION}` });
  if (r.status !== 200) throw new Error(`應 200，實際 ${r.status}: ${r.body.slice(0, 100)}`);
  if (!Array.isArray(r.json.goals)) throw new Error('goals 不是陣列');
  // 這些數字來自 Neon（numeric → 字串 → num() 轉換）
  if (typeof r.json.totalReceived !== 'number') {
    throw new Error(`totalReceived 應為 number，實際 ${typeof r.json.totalReceived}（${JSON.stringify(r.json.totalReceived)}）`);
  }
  if (r.json.totalReceived !== 999) throw new Error('totalReceived 應為 999，實際 ' + r.json.totalReceived);
  if (r.json.donorCount !== 7) throw new Error('donorCount 應為 7，實際 ' + r.json.donorCount);
  console.log('      goals=[] totalReceived=' + r.json.totalReceived + ' donorCount=' + r.json.donorCount);
});

test('★ 無 session 必須 401', async () => {
  const r = await call('/api/v1/donations');
  if (r.status !== 401) throw new Error('應 401，實際 ' + r.status);
});

test('★ addGoal 後 goals 有一筆且 current=0', async () => {
  const r = await call('/api/v1/donations', {
    method: 'POST', cookie: `sf_session=${SESSION}`,
    body: { _meta: 'addGoal', title: 'e2e 目標', goal: 500, emoji: '🧪' },
  });
  if (r.status !== 200) throw new Error(`應 200，實際 ${r.status}: ${r.body.slice(0, 100)}`);
  const g = r.json.goals[0];
  if (!g) throw new Error('沒有回傳目標');
  if (g.current !== 0) throw new Error('current 應為 0，實際 ' + JSON.stringify(g.current));
  if (g.title !== 'e2e 目標' || g.goal !== 500) throw new Error('欄位不符: ' + JSON.stringify(g));
  console.log('      ' + g.title + ' goal=' + g.goal + ' current=' + g.current + ' sortOrder=' + g.sortOrder);
});

test('★ ★ 所有權：B 不能改 A 的目標', async () => {
  const goal = (await sql.query('SELECT "id" FROM "DonationGoal" WHERE "userId"=$1 LIMIT 1', [USER_ID]))[0];
  if (!goal) throw new Error('找不到目標');

  const before = await sql.query('SELECT "title","goal" FROM "DonationGoal" WHERE "id"=$1', [goal.id]);

  // B 嘗試 update 與 delete A 的目標
  const up = await call('/api/v1/donations', {
    method: 'POST', cookie: `sf_session=${OTHER_SESSION}`,
    body: { _meta: 'updateGoal', id: goal.id, title: '被 hijack', goal: 9999 },
  });
  const del = await call('/api/v1/donations', {
    method: 'POST', cookie: `sf_session=${OTHER_SESSION}`,
    body: { _meta: 'deleteGoal', id: goal.id },
  });
  // 兩個都是 200（因為原始碼不檢查 affected rows）—— 那是繼承的行為。
  // 重點是**資料有沒有被改掉**。
  const after = await sql.query('SELECT "title","goal" FROM "DonationGoal" WHERE "id"=$1', [goal.id]);
  if (after.length === 0) throw new Error('★ 目標被別人刪除了 —— 所有權檢查失效');
  if (after[0].title !== before[0].title || Number(after[0].goal) !== Number(before[0].goal)) {
    throw new Error('★ 目標被別人改了 —— 所有權檢查失效');
  }
  console.log('      B 的 update/delete 沒有影響 A 的目標 ✓');
  console.log('      （註：兩個呼叫都回 200，因為原始碼不檢查 affected rows ——');
  console.log('        那是繼承行為，不是外洩。但也代表外洩不會自己浮現。）');
  console.log('      update 狀態=' + up.status + '  delete 狀態=' + del.status);
});

test('★ simulate 需要 demoMode（B 應該 403）', async () => {
  const r = await call('/api/v1/donations', {
    method: 'POST', cookie: `sf_session=${OTHER_SESSION}`,
    body: { _meta: 'simulate', amount: 50 },
  });
  if (r.status !== 403) throw new Error(`非 demoMode 應 403，實際 ${r.status}`);
});

test('★ simulate（A）建立測試斗內且推進目標但不超過 goal', async () => {
  const goal = (await sql.query('SELECT "id","current","goal" FROM "DonationGoal" WHERE "userId"=$1 LIMIT 1', [USER_ID]))[0];
  const before = Number(goal.current);

  const r = await call('/api/v1/donations', {
    method: 'POST', cookie: `sf_session=${SESSION}`,
    body: { _meta: 'simulate', amount: 999999 },
  });
  if (r.status !== 200) throw new Error(`應 200，實際 ${r.status}: ${r.body.slice(0, 120)}`);

  const donation = await sql.query(
    'SELECT "txHash","amount","status","token" FROM "ZixiDonation" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',
    [USER_ID]);
  if (!donation.length) throw new Error('沒有建立測試斗內紀錄');
  if (donation[0].txHash !== 'TEST') throw new Error('txHash 必須是 TEST 標記，實際 ' + donation[0].txHash);
  if (Number(donation[0].amount) !== 999999) throw new Error('金額不符');

  const g2 = (await sql.query('SELECT "current","goal" FROM "DonationGoal" WHERE "id"=$1', [goal.id]))[0];
  if (Number(g2.current) !== Number(g2.goal)) {
    throw new Error(`目標應被填滿但不超過：current=${g2.current} goal=${g2.goal}`);
  }
  console.log(`      txHash=TEST amount=999999  目標 ${before} → ${g2.current}（goal=${g2.goal}）`);
});

test('★ updateUser 不可偽造 donationTotal', async () => {
  const r = await call('/api/v1/donations', {
    method: 'POST', cookie: `sf_session=${SESSION}`,
    body: { _meta: 'updateUser', totalReceived: 999999, donorCount: 999, minAmount: 30, soundEffect: 'ding' },
  });
  if (r.status !== 200) throw new Error('應 200，實際 ' + r.status);
  const row = await sql.query('SELECT "donationTotal","donationDonors" FROM "User" WHERE "id"=$1', [USER_ID]);
  if (Number(row[0].donationTotal) !== 999) {
    throw new Error(`★ donationTotal 被偽造成 ${row[0].donationTotal} —— 防偽造的點破了`);
  }
  if (Number(row[0].donationDonors) !== 7) throw new Error('donationDonors 被偽造');
  console.log('      送 totalReceived=999999 但 DB 仍是 999 ✓');
});

(async () => {
  console.log('');
  console.log('════════ donations e2e (線上) ════════');
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
  for (const uid of [USER_ID, OTHER_ID]) {
    if (!uid) continue;
    await sql.query('DELETE FROM "Session" WHERE "userId"=$1', [uid]);
    await sql.query('DELETE FROM "DonationGoal" WHERE "userId"=$1', [uid]);
    await sql.query('DELETE FROM "ZixiDonation" WHERE "userId"=$1', [uid]);
    await sql.query('DELETE FROM "User" WHERE "id"=$1', [uid]);
  }
  const left = await sql.query('SELECT "id" FROM "User" WHERE "username" LIKE $1', ['e2e_don_' + RUN + '%']);
  console.log('  cleanup: ' + (left.length === 0 ? '✓ 已刪乾淨' : '★ 殘留 ' + left.length));
  if (left.length) failed++;

  console.log('');
  console.log(failed === 0 ? '  ✓ 全部通過' : '  ✗ ' + failed + ' 項失敗');
  console.log('');
  process.exit(failed ? 1 : 0);
})();