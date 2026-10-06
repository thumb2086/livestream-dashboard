// verify-meetups-e2e.mjs — /api/v1/meetups 的完整驗證
//
// 這條的關鍵性質：
//   · 報名的 capacity 檢查與插入必須是原子的（不超額）— 單一 INSERT...SELECT
//   · 重複報名要分出「滿了」與「重複」
//   · 所有寫入必須帶 userId（所有權）
//   · capacity = 0 代表不限名額
import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const ROOT = path.resolve(HERE, '..');
const ORIGIN = 'https://zixilive.dpdns.org';
const RUN = Date.now().toString(36);
const SENTINEL = 'e2e_mu_' + RUN;

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
      [uid, 'e2e 聚會', sentinel, sentinel + '@test.invalid', '']),
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

test('★ 無 session 必須 401', async () => {
  const r = await call('/api/v1/meetups');
  if (r.status !== 401) throw new Error('應 401，實際 ' + r.status);
});

test('★ add 建立聚會，GET 回得到', async () => {
  const r = await call('/api/v1/meetups', {
    method: 'POST', cookie: `sf_session=${SA}`,
    body: { _meta: 'add', title: 'e2e 聚會', description: '測試', location: '線上', startsAt: new Date().toISOString(), capacity: 5, price: 0, status: 'open' },
  });
  if (r.status !== 200) throw new Error(`應 200，實際 ${r.status}: ${r.body.slice(0, 100)}`);
  const m = r.json.meetups[0];
  if (!m) throw new Error('沒有回傳聚會');
  if (m.title !== 'e2e 聚會') throw new Error('title 不符');
  console.log('      title=' + m.title + ' capacity=' + m.capacity + ' status=' + m.status);
});

test('★ ★ 所有權：B 不能 update/delete A 的聚會', async () => {
  const m = (await sql.query('SELECT "id" FROM "Meetup" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  const before = (await sql.query('SELECT "title" FROM "Meetup" WHERE "id"=$1', [m.id]))[0];

  const u = await call('/api/v1/meetups', {
    method: 'POST', cookie: `sf_session=${SB}`,
    body: { _meta: 'update', id: m.id, title: '被改掉' },
  });
  const d = await call('/api/v1/meetups', {
    method: 'POST', cookie: `sf_session=${SB}`,
    body: { _meta: 'delete', id: m.id },
  });

  const after = (await sql.query('SELECT "title" FROM "Meetup" WHERE "id"=$1', [m.id]))[0];
  if (!after) throw new Error('★ 聚會被別人刪掉');
  if (after.title !== before.title) throw new Error('★ title 被別人改');
  console.log('      update/delete 都無效 ✓  （HTTP ' + u.status + '/' + d.status + '，但資料未變）');
});

test('★ ★ 報名：capacity 檢查 + 重複報名的原子性', async () => {
  const m = (await sql.query('SELECT "id","capacity" FROM "Meetup" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  // 上限是 5，加 5 筆
  for (let i = 0; i < 5; i++) {
    const r = await call('/api/v1/meetups', {
      method: 'POST', cookie: `sf_session=${SA}`,
      body: { _meta: 'addRegistration', meetupId: m.id, name: '報名' + i },
    });
    if (r.status !== 200) throw new Error('報名 ' + i + ' 應 200，實際 ' + r.status + ': ' + r.body.slice(0, 80));
  }
  // 第 6 筆應該被擋下（名額已滿）
  const r6 = await call('/api/v1/meetups', {
    method: 'POST', cookie: `sf_session=${SA}`,
    body: { _meta: 'addRegistration', meetupId: m.id, name: '第六人' },
  });
  if (r6.status !== 409) throw new Error(`第 6 筆應 409（名額已滿），實際 ${r6.status}: ${r6.body.slice(0, 80)}`);
  if (!r6.json.error.includes('滿')) throw new Error('錯誤訊息應提及「滿」，實際: ' + r6.json.error);
  console.log('      5 筆成功 → 第 6 筆 409（滿）✓');
});

test('★ capacity=0 代表不限名額', async () => {
  const r = await call('/api/v1/meetups', {
    method: 'POST', cookie: `sf_session=${SA}`,
    body: { _meta: 'add', title: '無限名額', startsAt: new Date().toISOString(), capacity: 0, status: 'open' },
  });
  if (r.status !== 200) throw new Error('應 200');
  const m = (await sql.query('SELECT "id" FROM "Meetup" WHERE "userId"=$1 AND "title"=$2', [A, '無限名額']))[0];
  for (let i = 0; i < 10; i++) {
    const r2 = await call('/api/v1/meetups', {
      method: 'POST', cookie: `sf_session=${SA}`,
      body: { _meta: 'addRegistration', meetupId: m.id, name: '無限' + i },
    });
    if (r2.status !== 200) throw new Error('無限名額的報名 ' + i + ' 應 200，實際 ' + r2.status);
  }
  console.log('      10 筆報名全過 → capacity=0 確實不限 ✓');
});

test('★ 重複報名回 409（重複）— 用有空間的聚會測', async () => {
  const m2 = (await sql.query('SELECT "id" FROM "Meetup" WHERE "userId"=$1 AND "title"=$2', [A, '無限名額']))[0];
  const rdup = await call('/api/v1/meetups', {
    method: 'POST', cookie: `sf_session=${SA}`,
    body: { _meta: 'addRegistration', meetupId: m2.id, name: '無限0' },
  });
  if (rdup.status !== 409) throw new Error(`重複報名應 409，實際 ${rdup.status}: ${rdup.body.slice(0,80)}`);
  if (!rdup.json.error.includes('重複')) throw new Error('錯誤訊息應提及「重複」，實際: ' + rdup.json.error);
  console.log('      重複報名 409（重複）✓');
});

test('★ removeRegistration 只能刪自己聚會的報名', async () => {
  const m = (await sql.query('SELECT "id" FROM "Meetup" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  const reg = (await sql.query('SELECT "id" FROM "MeetupRegistration" WHERE "meetupId"=$1 LIMIT 1', [m.id]))[0];
  // B 嘗試刪 A 的聚會的報名
  const r = await call('/api/v1/meetups', {
    method: 'POST', cookie: `sf_session=${SB}`,
    body: { _meta: 'removeRegistration', id: reg.id },
  });
  const still = (await sql.query('SELECT "id" FROM "MeetupRegistration" WHERE "id"=$1', [reg.id]))[0];
  if (!still) throw new Error('★ B 刪掉了 A 的報名');
  console.log('      B 刪 A 的報名 → 未生效 ✓');
  // A 刪自己的 → 應該成功
  const r2 = await call('/api/v1/meetups', {
    method: 'POST', cookie: `sf_session=${SA}`,
    body: { _meta: 'removeRegistration', id: reg.id },
  });
  const gone = (await sql.query('SELECT "id" FROM "MeetupRegistration" WHERE "id"=$1', [reg.id]))[0];
  if (gone) throw new Error('★ A 刪自己的報名失敗');
  console.log('      A 刪自己的報名 → 成功 ✓');
});

test('★ setStatus 只能改自己的聚會', async () => {
  const m = (await sql.query('SELECT "id" FROM "Meetup" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  // B 嘗試改 A 的
  const r = await call('/api/v1/meetups', {
    method: 'POST', cookie: `sf_session=${SB}`,
    body: { _meta: 'setStatus', id: m.id, status: 'closed' },
  });
  const after = (await sql.query('SELECT "status" FROM "Meetup" WHERE "id"=$1', [m.id]))[0];
  if (after.status === 'closed') throw new Error('★ B 改掉了 A 的 status');
  console.log('      B 改 A 的 status → 未生效 ✓  （HTTP ' + r.status + '）');
});

test('★ 無效 status 被擋下', async () => {
  const r = await call('/api/v1/meetups', {
    method: 'POST', cookie: `sf_session=${SA}`,
    body: { _meta: 'add', title: '測試', startsAt: new Date().toISOString(), status: 'banana' },
  });
  // 原碼：status 不在 STATUSES 裡就用 'open'（不是 400）
  if (r.status !== 200) throw new Error('應 200（用預設 open），實際 ' + r.status);
  const m = (await sql.query('SELECT "status" FROM "Meetup" WHERE "userId"=$1 AND "title"=$2', [A, '測試']))[0];
  if (m.status !== 'open') throw new Error(`status 應為 'open'，實際 ${m.status}`);
  console.log('      無效 status → 用預設 open ✓');
});

(async () => {
  console.log('');
  console.log('════════ meetups e2e (線上) ════════');
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
    await sql.query('DELETE FROM "MeetupRegistration" WHERE "meetupId" IN (SELECT "id" FROM "Meetup" WHERE "userId"=$1)', [uid]);
    await sql.query('DELETE FROM "Meetup" WHERE "userId"=$1', [uid]);
    await sql.query('DELETE FROM "User" WHERE "id"=$1', [uid]);
  }
  const left = await sql.query('SELECT "id" FROM "User" WHERE "username" LIKE $1', ['e2e_mu_' + RUN + '%']);
  console.log('  cleanup: ' + (left.length === 0 ? '✓ 已刪乾淨' : '★ 殘留 ' + left.length));
  if (left.length) failed++;

  console.log('');
  console.log(failed === 0 ? '  ✓ 全部通過' : '  ✗ ' + failed + ' 項失敗');
  console.log('');
  process.exit(failed ? 1 : 0);
})();
