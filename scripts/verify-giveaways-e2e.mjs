// verify-giveaways-e2e.mjs — /api/v1/giveaways 的完整驗證
//
// 這條的安全性質比 donations 更多一條：**抽獎結果**。
//
//   · `draw` 的隨機數必須在伺服器端產生（前端抽就能重複抽）
//   · `join` 必須擋停用的抽獎
//   · 所有寫入必須帶 userId（所有權）
//   · 重複加入同一個名字不應產生兩筆
import { neon } from '@neondatabase/serverless';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

// ⚠️ ESM 沒有 __dirname —— 那是 CJS 的。用 import.meta.url 推。
// ⚠️ ESM 沒有 __dirname（那是 CJS 的），而 import.meta.url 在 Windows 上
//    是 file:///C:/... 形式，需要去掉開頭的斜線。
//
//    我第一版用 PowerShell 的 -replace 寫這行，而 `$1` 被 shell 吃掉，
//    產生了一個語法錯的 regex —— 那是今晚第三次被同一件事咬。
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
const ROOT = path.resolve(HERE, '..');
const ORIGIN = 'https://zixilive.dpdns.org';
const RUN = Date.now().toString(36);
const SENTINEL = 'e2e_gw_' + RUN;

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
      [uid, 'e2e 抽獎', sentinel, sentinel + '@test.invalid', '']),
    sql.query('INSERT INTO "Session" ("id","userId","platform","createdAt") VALUES ($1,$2,$3,NOW())',
      [sid, uid, 'twitch']),
  ]);
  return { uid, sid };
}

test('★ 建立兩個測試使用者', async () => {
  const a = await seed(SENTINEL);
  const b = await seed(SENTINEL + '_o');
  A = a.uid; SA = a.sid; B = b.uid; SB = b.sid;
  console.log('      A=' + A.slice(0, 12) + '…  B=' + B.slice(0, 12) + '…');
});

test('★ 無 session 必須 401', async () => {
  const r = await call('/api/v1/giveaways');
  if (r.status !== 401) throw new Error('應 401，實際 ' + r.status);
});

test('★ add 建立抽獎，GET 回得到且 entrants 為空陣列', async () => {
  const r = await call('/api/v1/giveaways', {
    method: 'POST', cookie: `sf_session=${SA}`,
    body: { _meta: 'add', title: 'e2e 抽獎', keyword: ' E2E ' },
  });
  if (r.status !== 200) throw new Error(`應 200，實際 ${r.status}: ${r.body.slice(0, 100)}`);
  const g = r.json.giveaways[0];
  if (!g) throw new Error('沒有回傳抽獎');
  if (g.title !== 'e2e 抽獎') throw new Error('title 不符');
  // keyword 必須小寫化並 trim（原碼 .toLowerCase().slice(0,30)）
  if (g.keyword !== 'e2e') throw new Error(`keyword 應為 "e2e"，實際 ${JSON.stringify(g.keyword)}`);
  if (!Array.isArray(g.entrants) || g.entrants.length !== 0) throw new Error('entrants 應是空陣列');
  console.log('      title=' + g.title + ' keyword=' + g.keyword + ' enabled=' + g.enabled);
});

test('★ 重複 join 同一個名字不會產生兩筆（upsert 語意）', async () => {
  const g = (await sql.query('SELECT "id" FROM "Giveaway" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  for (let i = 0; i < 3; i++) {
    const r = await call('/api/v1/giveaways', {
      method: 'POST', cookie: `sf_session=${SA}`,
      body: { _meta: 'join', id: g.id, name: '小明' },
    });
    if (r.status !== 200) throw new Error('join 應 200，實際 ' + r.status);
  }
  const n = await sql.query('SELECT COUNT(*)::int n FROM "GiveawayEntrant" WHERE "giveawayId"=$1', [g.id]);
  if (n[0].n !== 1) throw new Error(`重複 join 應只有 1 筆，實際 ${n[0].n}`);
  console.log('      3 次 join → 1 筆 ✓');
});

test('★ ★ 所有權：B 不能 join/toggle/draw A 的抽獎', async () => {
  const g = (await sql.query('SELECT "id","enabled","winner" FROM "Giveaway" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  const before = await sql.query('SELECT "enabled","winner" FROM "Giveaway" WHERE "id"=$1', [g.id]);

  const t = await call('/api/v1/giveaways', {
    method: 'POST', cookie: `sf_session=${SB}`,
    body: { _meta: 'toggle', id: g.id, enabled: false },
  });
  const j = await call('/api/v1/giveaways', {
    method: 'POST', cookie: `sf_session=${SB}`,
    body: { _meta: 'join', id: g.id, name: '駭客' },
  });
  await call('/api/v1/giveaways', {
    method: 'POST', cookie: `sf_session=${SB}`,
    body: { _meta: 'draw', id: g.id },
  });

  const after = await sql.query('SELECT "enabled","winner" FROM "Giveaway" WHERE "id"=$1', [g.id]);
  if (!after.length) throw new Error('★ 抽獎被別人刪掉');
  if (after[0].enabled !== before[0].enabled) throw new Error('★ enabled 被別人改');
  if ((after[0].winner || '') !== (before[0].winner || '')) throw new Error('★ winner 被別人抽走');
  const entrants = await sql.query('SELECT "name" FROM "GiveawayEntrant" WHERE "giveawayId"=$1', [g.id]);
  if (entrants.some((e) => e.name === '駭客')) throw new Error('★ 駭客混進了別人的抽獎');
  console.log('      toggle/join/draw 都無效 ✓  （狀態碼 ' + t.status + '/' + j.status + '，但資料未變）');
});

test('★ 停用的抽獎不能 join', async () => {
  const g = (await sql.query('SELECT "id" FROM "Giveaway" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  await sql.query('UPDATE "Giveaway" SET "enabled"=false WHERE "id"=$1', [g.id]);
  const r = await call('/api/v1/giveaways', {
    method: 'POST', cookie: `sf_session=${SA}`,
    body: { _meta: 'join', id: g.id, name: '晚到的人' },
  });
  if (r.status !== 400) throw new Error(`停用後 join 應 400，實際 ${r.status}`);
  await sql.query('UPDATE "Giveaway" SET "enabled"=true WHERE "id"=$1', [g.id]);
});

test('★ draw 會把 winner 設成實際參與者之一', async () => {
  const g = (await sql.query('SELECT "id" FROM "Giveaway" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  for (const n of ['阿花', '小明', '阿志']) {
    await sql.query('INSERT INTO "GiveawayEntrant" ("id","giveawayId","name","createdAt") VALUES ($1,$2,$3,NOW()) ON CONFLICT DO NOTHING',
      [crypto.randomUUID(), g.id, n]);
  }
  const names = (await sql.query('SELECT "name" FROM "GiveawayEntrant" WHERE "giveawayId"=$1', [g.id])).map((x) => x.name);

  const r = await call('/api/v1/giveaways', {
    method: 'POST', cookie: `sf_session=${SA}`, body: { _meta: 'draw', id: g.id },
  });
  if (r.status !== 200) throw new Error('draw 應 200，實際 ' + r.status);
  const w = (await sql.query('SELECT "winner" FROM "Giveaway" WHERE "id"=$1', [g.id]))[0];
  if (!w.winner) throw new Error('winner 是空的');
  if (!names.includes(w.winner)) throw new Error(`winner=${w.winner} 不在參與者名單內`);
  console.log(`      參與者 ${names.length} 人 → winner="${w.winner}" ✓`);
});

test('★ clear 清空參與者並重置 winner', async () => {
  const g = (await sql.query('SELECT "id" FROM "Giveaway" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  const r = await call('/api/v1/giveaways', {
    method: 'POST', cookie: `sf_session=${SA}`, body: { _meta: 'clear', id: g.id },
  });
  if (r.status !== 200) throw new Error('clear 應 200，實際 ' + r.status);
  const e = await sql.query('SELECT COUNT(*)::int n FROM "GiveawayEntrant" WHERE "giveawayId"=$1', [g.id]);
  const w = (await sql.query('SELECT "winner" FROM "Giveaway" WHERE "id"=$1', [g.id]))[0];
  if (e[0].n !== 0) throw new Error('參與者沒清空');
  if (w.winner !== '') throw new Error('winner 沒重置');
  console.log('      參與者歸 0、winner="" ✓');
});

test('★ 無參與者時 draw 回 400', async () => {
  const g = (await sql.query('SELECT "id" FROM "Giveaway" WHERE "userId"=$1 LIMIT 1', [A]))[0];
  const r = await call('/api/v1/giveaways', {
    method: 'POST', cookie: `sf_session=${SA}`, body: { _meta: 'draw', id: g.id },
  });
  if (r.status !== 400) throw new Error(`應 400，實際 ${r.status}`);
});

(async () => {
  console.log('');
  console.log('════════ giveaways e2e (線上) ════════');
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
    await sql.query('DELETE FROM "GiveawayEntrant" WHERE "giveawayId" IN (SELECT "id" FROM "Giveaway" WHERE "userId"=$1)', [uid]);
    await sql.query('DELETE FROM "Giveaway" WHERE "userId"=$1', [uid]);
    await sql.query('DELETE FROM "User" WHERE "id"=$1', [uid]);
  }
  const left = await sql.query('SELECT "id" FROM "User" WHERE "username" LIKE $1', ['e2e_gw_' + RUN + '%']);
  console.log('  cleanup: ' + (left.length === 0 ? '✓ 已刪乾淨' : '★ 殘留 ' + left.length));
  if (left.length) failed++;

  console.log('');
  console.log(failed === 0 ? '  ✓ 全部通過' : '  ✗ ' + failed + ' 項失敗');
  console.log('');
  process.exit(failed ? 1 : 0);
})();