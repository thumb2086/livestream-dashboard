// verify-donation-videos-e2e.mjs — /api/v1/donation-videos 的完整驗證
//
// 這條有 donations/giveaways 都沒有的東西：**公開的投稿端點**。
//
//   POST /api/v1/donation-videos 不需要登入 —— 任何人都能對某個創作者
//   的隊列投稿。而它有三道防護，全部要驗：
//
//   ① videoUrl 必須是 http(s)  —— 擋掉 javascript:/data: 注入 <video src>
//   ② cfg.enabled === false 時擋下 —— 創作者可以關閉投稿
//   ③ status 固定為 pending_review —— 投稿不能自己標成 approved
//
// 而審核端（PUT）有第四條：一次 owner 檢查涵蓋全部動作。
import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const ROOT = path.resolve(HERE, '..');
const ORIGIN = 'https://zixilive.dpdns.org';
const RUN = Date.now().toString(36);
const SENTINEL = 'e2e_dv_' + RUN;

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

let A = '', SA = '';
let B = '', SB = '';

async function seed(sentinel) {
  const uid = crypto.randomUUID();
  const sid = crypto.randomUUID();
  await sql.transaction([
    sql.query('INSERT INTO "User" ("id","name","username","email","avatar","createdAt") VALUES ($1,$2,$3,$4,$5,NOW())',
      [uid, 'e2e 影片', sentinel, sentinel + '@test.invalid', '']),
    sql.query('INSERT INTO "Session" ("id","userId","platform","createdAt") VALUES ($1,$2,$3,NOW())',
      [sid, uid, 'twitch']),
  ]);
  return { uid, sid };
}

test('★ 建立兩個測試使用者', async () => {
  const a = await seed(SENTINEL);
  const b = await seed(SENTINEL + '_o');
  A = a.uid; SA = a.sid; B = b.uid; SB = b.sid;
});

test('★ ★ 公開投稿：擋掉 javascript: 注入（videoUrl 驗證）', async () => {
  for (const bad of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd']) {
    const r = await call('/api/v1/donation-videos', {
      method: 'POST',
      body: { username: SENTINEL, videoUrl: bad, donorName: '測試', amount: 100 },
    });
    if (r.status !== 400) throw new Error(`videoUrl=${bad} 應 400，實際 ${r.status}`);
  }
  // https 應該通過
  const ok = await call('/api/v1/donation-videos', {
    method: 'POST',
    body: { username: SENTINEL, videoUrl: 'https://example.com/v.mp4', donorName: '測試', amount: 100 },
  });
  if (ok.status !== 201) throw new Error(`合法 videoUrl 應 201，實際 ${ok.status}: ${ok.body.slice(0, 100)}`);
  console.log('      3 種危險 URL 全擋下，https 通過 ✓');
});

test('★ 投稿固定為 pending_review（不能自己標 approved）', async () => {
  const r = await call('/api/v1/donation-videos', {
    method: 'POST',
    body: {
      username: SENTINEL, videoUrl: 'https://example.com/v2.mp4',
      donorName: '投稿', amount: 100, status: 'approved',
    },
  });
  if (r.status !== 201) throw new Error('應 201，實際 ' + r.status);
  const row = (await sql.query(
    'SELECT "status" FROM "DonationVideo" WHERE "id"=$1', [r.json.id]))[0];
  if (row.status !== 'pending_review') {
    throw new Error(`★ status 被設成 ${row.status} —— 投稿不該能自己審核自己`);
  }
  console.log('      送 status=approved 但 DB 是 pending_review ✓');
});

test('★ amount 是 Float → 必須轉 number（Neon 回字串）', async () => {
  const r = await call('/api/v1/donation-videos', {
    method: 'POST',
    body: { username: SENTINEL, videoUrl: 'https://example.com/v3.mp4', donorName: '金額', amount: 150.5 },
  });
  const row = (await sql.query('SELECT "amount" FROM "DonationVideo" WHERE "id"=$1', [r.json.id]))[0];
  if (Number(row.amount) !== 150.5) throw new Error('DB 金額不符: ' + row.amount);
  const g = await call('/api/v1/donation-videos', { cookie: `sf_session=${SA}` });
  const v = g.json.videos.find((x) => x.id === r.json.id);
  if (typeof v.amount !== 'number') {
    throw new Error(`API 回的 amount 應為 number，實際 ${typeof v.amount}（${JSON.stringify(v.amount)}）`);
  }
  console.log('      amount 型別: ' + typeof v.amount + '  值: ' + v.amount);
});

test('★ ★ 所有權：B 不能審核/刪除 A 的影片', async () => {
  const v = (await sql.query(
    'SELECT "id" FROM "DonationVideo" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  const before = await sql.query('SELECT "status" FROM "DonationVideo" WHERE "id"=$1', [v.id]);

  for (const meta of ['approve', 'reject', 'played']) {
    await call('/api/v1/donation-videos', {
      method: 'PUT', cookie: `sf_session=${SB}`,
      body: { id: v.id, _meta: meta, rejectNote: 'hijack' },
    });
  }
  const del = await call('/api/v1/donation-videos', {
    method: 'PUT', cookie: `sf_session=${SB}`, body: { id: v.id, _meta: 'delete' },
  });

  const after = await sql.query('SELECT "status" FROM "DonationVideo" WHERE "id"=$1', [v.id]);
  if (after.length === 0) throw new Error('★ 影片被別人刪掉 —— owner 檢查失效');
  if (after[0].status !== before[0].status) throw new Error('★ status 被別人改');
  console.log('      四個動作都無效 ✓  （HTTP ' + del.status + '，但資料未變）');
});

test('★ 自己的審核有效：approve', async () => {
  const v = (await sql.query(
    'SELECT "id" FROM "DonationVideo" WHERE "userId"=$1 AND "status"=$2 LIMIT 1',
    [A, 'pending_review']))[0];
  if (!v) return console.log('      （沒有 pending_review 的影片，略過）');
  const r = await call('/api/v1/donation-videos', {
    method: 'PUT', cookie: `sf_session=${SA}`, body: { id: v.id, _meta: 'approve' },
  });
  if (r.status !== 200) throw new Error('應 200，實際 ' + r.status);
  const row = (await sql.query('SELECT "status" FROM "DonationVideo" WHERE "id"=$1', [v.id]))[0];
  if (row.status !== 'approved') throw new Error('status 未變為 approved，實際 ' + row.status);
  console.log('      pending_review → approved ✓');
});

test('★ status 查詢參數過濾有效', async () => {
  const g = await call('/api/v1/donation-videos?status=approved', { cookie: `sf_session=${SA}` });
  if (g.status !== 200) throw new Error('應 200，實際 ' + g.status);
  if (!g.json.videos.every((v) => v.status === 'approved')) {
    throw new Error('過濾失效：回應裡有非 approved 的項目');
  }
  console.log('      全部為 approved ✓');
});

test('★ 創作者關閉投稿後，公開端點要擋下', async () => {
  // ⚠️ updatedAt 一定要帶：它是 @updatedAt（Prisma client-side 自動填），
  //    資料庫沒有 DEFAULT，所以 raw SQL 不給會違反 NOT NULL。
  //    這是 probe-feature-settings.cjs 實測出來的。
  await sql.query(
    'INSERT INTO "FeatureSettings" ("id","userId","featureKey","settings","updatedAt") VALUES ($1,$2,$3,$4,$5)',
    [crypto.randomUUID(), A, 'donation-video', JSON.stringify({ enabled: false }), new Date().toISOString()]);

  // 先確認寫進去了（否則 403 測不過可能是因為設定根本沒存在）
  const check = await sql.query(
    'SELECT "settings" FROM "FeatureSettings" WHERE "userId"=$1 AND "featureKey"=$2',
    [A, 'donation-video']);
  console.log('      DB 裡的設定: ' + JSON.stringify(check[0] && check[0].settings));

  const r = await call('/api/v1/donation-videos', {
    method: 'POST',
    body: { username: SENTINEL, videoUrl: 'https://example.com/v4.mp4', donorName: '關閉後', amount: 1 },
  });
  if (r.status !== 403) {
    throw new Error(`停用投稿應 403，實際 ${r.status} —— 回應: ${r.body.slice(0, 140)}`);
  }
  await sql.query('DELETE FROM "FeatureSettings" WHERE "userId"=$1', [A]);
  console.log('      403 ✓');
});

(async () => {
  console.log('');
  console.log('════════ donation-videos e2e (線上) ════════');
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
  for (const uid of [A, B]) {
    if (!uid) continue;
    await sql.query('DELETE FROM "Session" WHERE "userId"=$1', [uid]);
    await sql.query('DELETE FROM "FeatureSettings" WHERE "userId"=$1', [uid]);
    await sql.query('DELETE FROM "DonationVideo" WHERE "userId"=$1', [uid]);
    await sql.query('DELETE FROM "User" WHERE "id"=$1', [uid]);
  }
  const left = await sql.query('SELECT "id" FROM "User" WHERE "username" LIKE $1', ['e2e_dv_' + RUN + '%']);
  console.log('  cleanup: ' + (left.length === 0 ? '✓ 已刪乾淨' : '★ 殘留 ' + left.length));
  if (left.length) failed++;

  console.log('');
  console.log(failed === 0 ? '  ✓ 全部通過' : '  ✗ ' + failed + ' 項失敗');
  console.log('');
  process.exit(failed ? 1 : 0);
})();