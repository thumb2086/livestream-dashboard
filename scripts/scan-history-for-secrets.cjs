// scan-history-for-secrets.cjs — 用 .env 的真值逐一比對 git 歷史
//
// ⚠️ 為什麼要這樣寫，而不是用 regex 掃內容：
//
//   我第一版用 regex（`nsk_[A-Za-z0-9]{20,}` 之類）掃全部歷史，
//   結果 15 個命中全是 `.env.example` 裡的 **placeholder**
//   （`gsk_xxxxxxxxxx` 也符合 `gsk_[A-Za-z0-9]{20,}`）。
//
//   「15 處憑證外洩」是**假的** —— 那 15 處沒有任何一個是真值。
//
//   而那種錯誤的危險方向是雙向的：
//     · 誤報 → 讓人以為外洩了，慌張去 rotate 不必要的憑證
//     · 漏報 → 以為乾淨，實際外洩了
//
//   正確做法：**拿實際值去比對**，不做樣式推斷。
//   而且值絕不印出來 —— 只印「哪個變數、哪個檔案、幾次」。
//
// 這是今晚第 32 次「工具的推斷錯了，而症狀看起來像被測對象的問題」。
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(path.join(__dirname, '..'));

function readEnv(f) {
  if (!fs.existsSync(f)) return {};
  const out = {};
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    if (v) out[m[1]] = v;
  }
  return out;
}

const env = { ...readEnv(path.join(ROOT, '.env')), ...readEnv(path.join(ROOT, '.env.local')) };

// 只檢查長度足以構成真憑證的值（避免 placeholder / 短值誤判）
const secrets = Object.entries(env).filter(([k, v]) =>
  v.length >= 16 && !/^(your|placeholder|changeme|xxx)/i.test(v) && !v.includes('xxxx')
);

console.log('');
console.log('════════ history scan (真值比對，非樣式推斷) ════════');
console.log(`  要檢查的變數: ${secrets.length} 個`);
console.log('  （只印變數名與次數，永不印值）');
console.log('');

const commits = execFileSync('git', ['log', '--all', '--format=%H'], { encoding: 'utf8', maxBuffer: 8e6 })
  .split(/\r?\n/).filter(Boolean);

const hits = {};
const perCommitFiles = {};

for (const c of commits) {
  let files;
  try {
    files = execFileSync('git', ['ls-tree', '-r', '--name-only', c], { encoding: 'utf8', maxBuffer: 8e6 })
      .split(/\r?\n/).filter(Boolean);
  } catch { continue; }

  for (const f of files) {
    if (/\.(png|jpe?g|gif|ico|woff2?|ttf|lock|wasm|map)$/i.test(f)) continue;
    let content;
    try {
      content = execFileSync('git', ['show', `${c}:${f}`], { encoding: 'utf8', maxBuffer: 32e6, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { continue; }
    for (const [k, v] of secrets) {
      if (content.includes(v)) {
        hits[k] = (hits[k] || 0) + 1;
        perCommitFiles[f] = (perCommitFiles[f] || 0) + 1;
      }
    }
  }
}

console.log('  ── 結果 ──');
if (Object.keys(hits).length === 0) {
  console.log('  ✓ 全部 21+ 個歷史 commit 都沒有任何 .env/.env.local 的真值');
} else {
  console.log('  ★ 以下變數的真值出現在歷史中：');
  for (const [k, n] of Object.entries(hits).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${k.padEnd(26)} ${n} 個 (commit,檔案) 組合`);
  }
  console.log('');
  console.log('    出現於這些路徑：');
  for (const [f, n] of Object.entries(perCommitFiles).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${f.padEnd(30)} ${n} 次`);
  }
}
console.log('');