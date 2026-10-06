// verify-overlay-e2e.cjs — overlay 端到端驗證（用 Neon 裡的真實 token）
//
// ══════════════════════════════════════════════════════════
// 這支驗的是 OBS 的完整路徑
// ══════════════════════════════════════════════════════════
//
// OBS 做的事：
//   1. 開 http://<overlay>/<key>/<token>  → 拿到 HTML
//   2. HTML 裡的 setInterval 輪詢
//      /api/v1/overlay-data/<key>?token=<token>  → 拿 JSON
//
// 而第 2 步過去壞過兩次：
//   · Prisma WASM → 500
//   · （遷移前）打的是 /api/v1/chat/messages，用 session cookie，
//     而 OBS 沒有 cookie → 永遠 401，且被 `if(!d.messages)return` 靜默吞掉
//
// 所以驗證要涵蓋**兩段**，而且第 2 段要用**真 token** ——
// 用假 token 只能證明「端點活著」，證明不了「資料真的回來」。
//
// ── 為什麼用「建立測試 source」而不是既有 source ────────
//
// 若拿既有的 source 測，我會在別人的 overlay 上動手。
// 而這個測試只讀不寫 —— 所以用一個明確命名的測試 source，
// 測完刪掉。
//
// ⚠️ 刪除是必要的：留著一個假的 source 會出現在某個人的
//    overlay 設定清單裡，而那看起來像真的。
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://zixilive.dpdns.org';
const TEST_TAG = 'e2e_overlay_probe';
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

function get(pathname) {
  return new Promise((resolve) => {
    https.request(ORIGIN + pathname, { method: 'GET', timeout: 25000 }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', (e) => resolve({ status: 0, body: String(e.message) }))
      .on('timeout', function () { this.destroy(); resolve({ status: 0, body: 'timeout' }); })
      .end();
  });
}

/**
 * 剝除 JS 註解，但保留字串內容。
 *
 * ⚠️ 為什麼要保留字串：route 裡的 HTML 是 template literal，
 *    而 script 區段裡有 '/api/v1/overlay-data/chat?token=' 這種字串 ——
 *    若連字串一起清掉，就會把「真正在輪詢的那行」也刪掉，
 *    然後斷言又會報「沒有用對端點」。
 *
 * 所以這裡只去註解，不動字串 —— 而那正是「註解裡的字串」
 * 與「程式碼裡的字串」唯一能分開的地方。
 *
 * ⚠️ 而這段說明本身的寫法也有陷阱：我第一版寫「（// 與 slash-star slash-star）」
 *    用文字描述區塊註解的開頭，結果那個字面序列裡含有真正的註解終止符，
 *    把自己的 JSDoc 提前關掉了 —— node 直接報 Invalid or unexpected token。
 *    描述語法時不能直接寫出終止符。
 */
function stripJsComments(src) {
  let out = '';
  let i = 0;
  let str = null; // 目前是否在字串裡，以及是什麼引號
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (str) {
      out += c;
      if (c === '\\') { out += n ?? ''; i += 2; continue; }
      if (c === str) str = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { str = c; out += c; i++; continue; }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    out += c;
    i++;
  }
  return out;
}

const tests = [];
const test = (n, f) => tests.push([n, f]);

let TOKEN = '';
let USER_ID = '';
let SOURCE_ID = '';

test('★ 建立帶真實 token 的測試 OBS source', async () => {
  const users = await sql.query('SELECT "id", "name" FROM "User" ORDER BY "createdAt" ASC LIMIT 1');
  if (!users.length) throw new Error('Neon 裡沒有任何 User —— 無法建立測試 source');
  USER_ID = users[0].id;

  TOKEN = 'e2e' + crypto.randomBytes(12).toString('hex');
  SOURCE_ID = 'e2e_' + crypto.randomBytes(8).toString('hex');

  // ⚠️ OBSSource **沒有 createdAt**。
  //   我憑印象寫了它，而 INSERT 直接報
  //   「column "createdAt" of relation "OBSSource" does not exist」。
  //
  //   欄位只有 id / userId / sourceKey / name / token / enabled
  //   （照 prisma/schema.prisma）。
  //
  //   這是今晚第二次「猜欄位名」—— 第一次是在 overlay-data 改了
  //   donor/title/url/meta，那次因為下游讀的是別的名字而較早暴露。
  //   這次是 INSERT，錯的欄位會讓整個測試「建立失敗」，
  //   而症狀是「測試紅了」而不是「測試測錯的東西」。
  for (const key of ['chat', 'channel-stats', 'scoreboard', 'live-viewers']) {
    await sql.query(
      `INSERT INTO "OBSSource" ("id", "userId", "sourceKey", "name", "token", "enabled")
       VALUES ($1, $2, $3, $4, $5, true)`,
      [SOURCE_ID + '_' + key, USER_ID, key, TEST_TAG, TOKEN]
    );
  }
  console.log('      userId=' + USER_ID + '  token=' + TOKEN.slice(0, 14) + '…  建立 4 個 source');
});

test('★ 假 token 必須 404（不是 200 也不是 500）', async () => {
  const r = await get('/api/v1/overlay-data/chat?token=definitely_not_a_real_token');
  if (r.status !== 404) throw new Error(`假 token 應 404，實際 ${r.status}`);
});

test('★ 缺 token 必須 401', async () => {
  const r = await get('/api/v1/overlay-data/chat');
  if (r.status !== 401) throw new Error(`缺 token 應 401，實際 ${r.status}`);
});

test('★ overlay 頁面用真 token 回 HTML（含輪詢）', async () => {
  for (const key of ['chat', 'stats', 'scoreboard', 'live-viewers']) {
    const r = await get(`/overlay/${key}/${TOKEN}`);
    if (r.status !== 200) throw new Error(`overlay/${key} 應 200，實際 ${r.status}`);
    if (!/<!DOCTYPE html>/i.test(r.body)) throw new Error(`overlay/${key} 沒回 HTML`);
    if (!/setInterval/.test(r.body)) throw new Error(`overlay/${key} 的 HTML 沒有輪詢`);
  }
  console.log('      4 條頁面都回 HTML 且含輪詢');
});

test('★ chat 頁面的輪詢必須用 token 授權的端點', async () => {
  // 這是那個**先於遷移就存在**的 bug：
  // chat 過去打 /api/v1/chat/messages（session cookie），
  // 而 OBS 沒有 cookie → 永遠 401，且被靜默吞掉。
  //
  // ⚠️ 只比對 <script> 區段，不比對整個 HTML ——
  //    我第一版比對整頁，而頁面裡**我自己寫的說明註解**
  //    含有 '/api/v1/chat/messages' 這段字，於是斷言報
  //    「仍在打舊端點」，而程式碼其實已經改好了。
  //
  //    症狀與前幾次同型：**測試端錯了，而訊息指向被測對象。**
  const r = await get(`/overlay/chat/${TOKEN}`);
  const script = /<script>([\s\S]*?)<\/script>/.exec(r.body);
  if (!script) throw new Error('HTML 裡找不到 <script> 區段');

  // ⚠️⚠️ **先剝除 JS 註解，再比對。**
  //
  //    我在這個檔案的 route 裡寫了說明註解，第一行就是：
  //        // 2026-10-06：從 /api/v1/chat/messages 改成 /api/v1/overlay-data/chat。
  //    而那個註解會被原樣編譯進 <script> 裡 —— 所以整個 script 區段
  //    **確實**含有 '/api/v1/chat/messages'，而程式碼早就改好了。
  //
  //    線上實測（scripts/probe-chat-html.cjs）：
  //        script 含 chat/messages     : true   ← 來自註解
  //        script 含 overlay-data/chat : true   ← 真正的程式碼
  //
  //    這是今晚**第四次**「測試端錯了，症狀指向被測對象」：
  //      ① fake DB 回 null 而我以為是被測對象算錯
  //      ② regex 沒剝註解，抓到我自己寫的說明
  //      ③ 貪婪 regex 跨過兩個 script 標籤
  //      ④ 這次：script 區段含註解
  //
  //    而前三次我都是先懷疑被測對象。
  //    所以這裡的修法不是「放寬斷言」，是**比對更精確的東西**。
  const js = stripJsComments(script[1]);

  if (/\/api\/v1\/chat\/messages/.test(js)) {
    throw new Error(
      'chat 的 <script> 仍在打 /api/v1/chat/messages —— 那是 session cookie 授權，\n' +
      '     而 OBS 的瀏覽器沒有 cookie，所以它永遠拿不到資料。'
    );
  }
  if (!/\/api\/v1\/overlay-data\/chat\?token=/.test(js)) {
    throw new Error('chat 的 <script> 沒有用 /api/v1/overlay-data/chat?token= 輪詢');
  }
  if (!r.body.includes(TOKEN)) throw new Error('HTML 裡沒有嵌入 token —— 輪詢會 401');
  console.log('      輪詢用 overlay-data + token 已嵌入 ✓（已排除註解）');
});

test('★ 剝除器本身有效（不然上面兩條都是空結果）', () => {
  // 對照組：剝除器壞掉的話，「chat 沒有用舊端點」會變成永遠成立。
  const dirty = [
    "// 從 /api/v1/chat/messages 改成 X",
    "var a = 1; /* 區塊裡的 chat/messages */",
    "var url = '/api/v1/overlay-data/chat?token=' + t;",
  ].join('\n');
  const clean = stripJsComments(dirty);
  if (/\/api\/v1\/chat\/messages/.test(clean)) throw new Error('剝除器沒清掉行註解');
  if (/區塊裡的 chat\/messages/.test(clean)) throw new Error('剝除器沒清掉區塊註解');
  if (!/\/api\/v1\/overlay-data\/chat\?token=/.test(clean)) {
    throw new Error('剝除器把字串內容也清掉了 —— 那會讓斷言誤報');
  }
  console.log('      註解清掉、字串保留 ✓');
});

test('★ 輪詢端點用真 token 回 JSON 資料', async () => {
  for (const key of ['chat', 'channel-stats', 'scoreboard', 'live-viewers']) {
    const r = await get(`/api/v1/overlay-data/${key}?token=${TOKEN}`);
    if (r.status !== 200) throw new Error(`overlay-data/${key} 應 200，實際 ${r.status}`);
    let j;
    try { j = JSON.parse(r.body); } catch {
      throw new Error(`overlay-data/${key} 回的不是 JSON: ${r.body.slice(0, 90)}`);
    }
    if (j.error) throw new Error(`overlay-data/${key} 回錯誤: ${j.error}`);
    if (typeof j.enabled !== 'boolean') {
      throw new Error(`overlay-data/${key} 缺 enabled 欄位: ${r.body.slice(0, 90)}`);
    }
  }
  console.log('      4 個 key 都回合法 JSON 資料');
});

test('★ 停用的 source 必須 404（不能洩漏資料）', async () => {
  await sql.query('UPDATE "OBSSource" SET "enabled" = false WHERE "token" = $1', [TOKEN]);
  const r = await get(`/api/v1/overlay-data/chat?token=${TOKEN}`);
  if (r.status !== 404) throw new Error(`停用後應 404，實際 ${r.status}`);
  await sql.query('UPDATE "OBSSource" SET "enabled" = true WHERE "token" = $1', [TOKEN]);
  console.log('      停用 → 404 ✓（不會洩漏 overlay 資料）');
});

(async () => {
  console.log('');
  console.log('════════ overlay end-to-end (線上) ════════');
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

  // ── 清理 ──
  console.log('');
  try {
    await sql.query('DELETE FROM "OBSSource" WHERE "token" = $1', [TOKEN]);
    console.log(`  cleanup: 已刪除測試 source（token ${TOKEN.slice(0, 10)}…）`);
    const left = await sql.query('SELECT "id" FROM "OBSSource" WHERE "name" = $1', [TEST_TAG]);
    console.log(`  殘留測試 source: ${left.length} 個${left.length ? ' ★ 沒清乾淨' : ' ✓'}`);
  } catch (e) {
    console.log('  ★ 清理失敗: ' + String(e.message).slice(0, 90));
    failed++;
  }

  console.log('');
  console.log(failed === 0 ? '  ✓ 全部通過' : '  ✗ ' + failed + ' 項失敗');
  console.log('');
  process.exit(failed ? 1 : 0);
})();