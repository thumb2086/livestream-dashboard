// sync-secrets-to-cf.cjs — 把 .env / .env.local 的值設成 Cloudflare secrets
//
// ══════════════════════════════════════════════════════════
// 憑證處理的三條規則
// ══════════════════════════════════════════════════════════
//
// 1. **值走 stdin，不走 argv。**
//    `wrangler secret put NAME "value"` 會讓 value 出現在
//    process command line —— 而 Windows 的 process list 是任何本機行程
//    都讀得到的。用 stdin（不給值）就只會出現在管道裡。
//
// 2. **不印值。** 只印名稱與長度。
//    憑證印出來就等於把它寫進 session 檔案 —— 而 session 檔案會留存。
//    （這是今晚給 OAuth client secret 的同一條規則。）
//
// 3. **不寫進任何檔案。** wrangler secret put 進的是 Cloudflare 的
//    secret store，不會落地成檔案，所以 wrangler.jsonc 可以安全 commit。
//
// ── 來源對應 ─────────────────────────────────────────────
//
// .env      → 生產用的憑證（Neon / Twitch / YouTube / chat key）
// .env.local → 本機開發用的額外憑證（Groq / ZIXI_CLIENT_SECRET…）
//
// 兩者都拿來設 Cloudflare secrets —— 因為 Cloudflare 的
// 「preview 與 production 共用同一組 secrets」，沒有分離機制。
// 所以本機開發用的那些也必須進去，否則線上會少功能。
//
// ⚠️ 因此本機與線上共用同一組憑證。若日後要分離，
//    需要 wrangler environments，那是另一件事。
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(path.join(__dirname, '..'));
const ASCII_PROJ = 'C:\\Users\\CPXru\\AppData\\Local\\Temp\\opencode\\ze-ascii\\proj';
const WRANGLER = path.join(ASCII_PROJ, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

// ⚠️ 目標 Worker 必須**顯式**指定，不依賴 cwd。
//
// 2026-10-06：這個腳本原本只寫 `cwd: ASCII_PROJ`，而那個 junction 指向
// **zixi-earth**。所以 15 個 dashboard 的憑證全被推到了 zixi-earth。
//
// 症狀極難診斷，因為三件事同時成立：
//   · 設定「成功」（exit 0，沒有任何錯誤）
//   · dashboard 的 secret 清單是 []
//   · dashboard 的 DB 路由回 500（DATABASE_URL 不存在）
//
// 而最容易誤判的方向是「Neon 或 D1 出問題」——
// 因為症狀是「查不到資料」，那看起來像資料庫而不是設定。
//
// 為什麼 --config 而不只用 --name：
//   --name 只指定 Worker 名稱，account_id 仍來自 cwd 的設定檔；
//   而這個 token 底下有 **3 個** Cloudflare 帳號。兩個都要明確。
const CFG = path.join(ROOT, 'wrangler.jsonc');
const WORKER = 'livestream-dashboard';

// ── vars 與 secret 不能同名 ─────────────────────────────────
//
// Cloudflare 拒絕建立與 `vars` 同名的 secret（API 直接 500）。
//
// 而 ZIXI_CLIENT_ID 正好在 wrangler.jsonc 的 vars 裡 —— 而且它**本來就
// 不是機密**（OAuth 的 client id 是公開的，只有 client_secret 是）。
//
// 所以正確做法是：讀出 vars、跳過它們、並說明為什麼跳。
// 而不是把它當「設定失敗」—— 那會讓人以為憑證不完整。
function readWranglerVars() {
  try {
    const raw = fs.readFileSync(CFG, 'utf8');
    const stripped = raw
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, '');
    return Object.keys(JSON.parse(stripped).vars || {});
  } catch (e) {
    console.log('  ★ 讀不到 wrangler.jsonc 的 vars：' + String(e.message).slice(0, 120));
    console.log('    寧可停下來，也不要在不知道 vars 的情況下盲設。');
    process.exit(1);
  }
}

function readEnvFile(f) {
  if (!fs.existsSync(f)) return {};
  const out = {};
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const env = { ...readEnvFile(path.join(ROOT, '.env')), ...readEnvFile(path.join(ROOT, '.env.local')) };

// 改名對應：舊名 → 新名（因為程式碼改了）
const RENAMES = {
  // check-tx 從 BaseScan 改成 Etherscan（合約在 Ethereum Sepolia）
  BASESCAN_API_KEY: 'ETHERSCAN_API_KEY',
};

// 明確要設的（值必須存在於 .env / .env.local）
const WANTED = [
  'DATABASE_URL',
  'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_EVENTSUB_SECRET',
  'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET',
  'CHAT_WORKER_KEY',
  'GROQ_API_KEY', 'GROQ_ROUTER_URL', 'GROQ_ROUTER_KEY', 'GROQ_DIRECT_FIRST',
  'PAYMENT_ENCRYPTION_KEY',
  'ZIXI_CLIENT_ID', 'ZIXI_CLIENT_SECRET', 'ZIXI_ADMIN_SESSION',
  'BASESCAN_API_KEY',
];

console.log('');
console.log('════════ sync secrets to Cloudflare Workers ════════');
console.log('  Worker:    ' + WORKER);
console.log('  config:    ' + CFG);
console.log('  值走 stdin，不進 argv、不印出。');
console.log('');

const missing = [];
const empty = [];
const done = [];
const failed = [];

const VAR_NAMES = readWranglerVars();
const inVars = [];
const skippedAsVar = [];

for (const src of WANTED) {
  const name = RENAMES[src] || src;
  const val = env[src];

  if (val === undefined) { missing.push(src + (name !== src ? ` → ${name}` : '')); continue; }
  if (val === '') { empty.push(src + (name !== src ? ` → ${name}` : '')); continue; }
  if (VAR_NAMES.includes(name)) {
    // Cloudflare 不允許 secret 與 var 同名，而這些值本來就不是機密
    inVars.push(name);
    skippedAsVar.push(name);
    continue;
  }

  const r = spawnSync(process.execPath,
    [WRANGLER, 'secret', 'put', name, '--name', WORKER, '--config', CFG],
    { input: val, encoding: 'utf8', maxBuffer: 8e6, shell: false });

  const ok = r.status === 0;
  if (ok) {
    done.push(name);
    console.log(`  ✓ ${name.padEnd(28)} (${val.length} chars)`);
  } else {
    failed.push(name);
    const msg = ((r.stdout || '') + (r.stderr || '')).replace(/\s+/g, ' ').trim();
    console.log(`  ✗ ${name.padEnd(28)} ${msg.slice(0, 110)}`);
  }
}

console.log('');
console.log(`  設定完成 ${done.length} / ${WANTED.length}`);
if (missing.length) {
  console.log('');
  console.log('  ⚠️ .env 裡沒有（未設定，線上會缺功能）：');
  for (const m of missing) console.log('     · ' + m);
}
if (empty.length) {
  console.log('');
  console.log('  ⚠️ 值是空字串（跳過 —— 設成空 secret 比不設更難排查）：');
  for (const e of empty) console.log('     · ' + e);
}
if (skippedAsVar.length) {
  console.log('');
  console.log('  ○ 已在 wrangler.jsonc 的 vars 裡，不重複設為 secret：');
  for (const n of skippedAsVar) {
    console.log('     · ' + n + '  （Cloudflare 不允許同名；且它本來就不是機密）');
  }
}
if (failed.length) {
  console.log('');
  console.log('  ✗ 失敗：' + failed.join(', '));
  process.exit(1);
}

// ── 驗證：確認真的落在正確的 Worker 上 ──────────────────────
//
// 這一步是必要的，不是「禮貌」。
//
// 2026-06-06 的實際案例：腳本 exit 0、沒有任何錯誤訊息，
// 但 15 個憑證全都推到**另一個** Worker。
// 而「另一個 Worker 多了不該有的 secret」沒有任何症狀 ——
// 它只在「缺少 secret 時那個 Worker 的 DB 路由回 500」時才會浮現，
// 而那看起來像資料庫問題。
//
// 所以這裡用 `secret list --name` 反查，確認「設定後讀得到」。
// 而 secret list 不會印值（Cloudflare 只回 name + type），
// 所以這一步不會洩漏任何東西。
console.log('');
console.log('  ── 驗證（secret list 不會回傳值）──');
const listed = spawnSync(process.execPath,
  [WRANGLER, 'secret', 'list', '--name', WORKER, '--config', CFG],
  { encoding: 'utf8', maxBuffer: 8e6, shell: false });

let onWorker = [];
try {
  onWorker = JSON.parse(listed.stdout || '[]').map((s) => s.name);
} catch { /* 解析失敗就當空，稍後會報數量不符 */ }

// 變數名不能與上半部的 missing（.env 裡沒有的變數）撞名 ——
// 否則 `const` 會在同個 scope 直接報 "already been declared"。
const unreadable = done.filter((n) => !onWorker.includes(n));
console.log(`  ${WORKER} 上的 secret 數: ${onWorker.length}`);
console.log(`  剛才設定的 ${done.length} 個之中讀不到: ${unreadable.length}` +
  (unreadable.length ? '  → ' + unreadable.join(', ') : ''));

if (unreadable.length) {
  console.log('');
  console.log('  ★ 有 secret 設定後讀不到 —— 不要假設它成功了。');
  process.exit(1);
}
console.log('  ✓ 全部讀得到');
console.log('');