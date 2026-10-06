// probe-chat-html.cjs — 抓線上 overlay/chat 的實際 HTML，看輪詢到底打哪
//
// 為什麼要這個：verify-overlay-e2e.cjs 報「chat 仍在打 /api/v1/chat/messages」，
// 而原始碼裡明確寫的是 overlay-data/chat。
//
// 兩者矛盾時不要選一個相信 —— **去抓真正送出去的東西**。
// 前面我已經因為「猜測哪邊對」浪費了兩輪。
//
// 這支建立一個真 token、抓 HTML、把 <script> 區段原樣印出來。
// 唯讀（除了建立/刪除測試 source）。
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://zixilive.dpdns.org';
const RUN = Date.now().toString(36);

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

function get(p) {
  return new Promise((resolve) => {
    https.request(ORIGIN + p, { timeout: 25000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', (e) => resolve({ status: 0, body: String(e.message) })).end();
  });
}

(async () => {
  console.log('');
  console.log('════════ probe chat overlay HTML ════════');
  const users = await sql.query('SELECT "id" FROM "User" ORDER BY "createdAt" ASC LIMIT 1');
  const uid = users[0].id;
  const token = 'e2e' + crypto.randomBytes(12).toString('hex');
  const sid = 'e2e_' + crypto.randomBytes(8).toString('hex');
  await sql.query(
    `INSERT INTO "OBSSource" ("id","userId","sourceKey","name","token","enabled")
     VALUES ($1,$2,'chat',$3,$4,true)`,
    [sid, uid, 'probe_' + RUN, token],
  );

  try {
    const r = await get(`/overlay/chat/${token}`);
    console.log(`  HTTP ${r.status}  body ${r.body.length} bytes`);
    console.log('');

    const scripts = [...r.body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    console.log(`  <script> 區段數: ${scripts.length}`);
    console.log('');

    scripts.forEach((s, i) => {
      console.log(`  ── script #${i} ──`);
      // 印出所有含 fetch 的行，以及所有含 /api/ 的行
      for (const line of s.split('\n')) {
        if (/\/api\/|fetch\(|overlay-data|chat\/messages/.test(line)) {
          console.log('    ' + line.trim().slice(0, 150));
        }
      }
      console.log('');
    });

    console.log('  ── 全文判斷 ──');
    console.log('    整個 HTML 含 /api/v1/chat/messages : ' + /\/api\/v1\/chat\/messages/.test(r.body));
    console.log('    整個 HTML 含 overlay-data/chat       : ' + /\/api\/v1\/overlay-data\/chat/.test(r.body));
    console.log('    script 區段含 chat/messages          : ' + scripts.some((s) => /\/api\/v1\/chat\/messages/.test(s)));
    console.log('    script 區段含 overlay-data/chat      : ' + scripts.some((s) => /\/api\/v1\/overlay-data\/chat/.test(s)));
    console.log('');
    console.log('  ── token 是否嵌在 HTML 裡 ──');
    console.log('    含本次 token : ' + r.body.includes(token));
    console.log('');
  } finally {
    await sql.query('DELETE FROM "OBSSource" WHERE "id" = $1', [sid]);
    console.log('  cleanup: 已刪除測試 source');
  }
  console.log('');
})();