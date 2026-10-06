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
console.log('  Worker: livestream-dashboard');
console.log('  值走 stdin，不進 argv、不印出。');
console.log('');

const missing = [];
const empty = [];
const done = [];
const failed = [];

for (const src of WANTED) {
  const name = RENAMES[src] || src;
  const val = env[src];

  if (val === undefined) { missing.push(src + (name !== src ? ` → ${name}` : '')); continue; }
  if (val === '') { empty.push(src + (name !== src ? ` → ${name}` : '')); continue; }

  const r = spawnSync(process.execPath,
    [WRANGLER, 'secret', 'put', name],
    { cwd: ASCII_PROJ, input: val, encoding: 'utf8', maxBuffer: 8e6, shell: false });

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
if (failed.length) {
  console.log('');
  console.log('  ✗ 失敗：' + failed.join(', '));
  process.exit(1);
}
console.log('');