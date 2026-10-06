// check-wrangler-jsonc.cjs — 驗證 wrangler.jsonc 能不能解析，並印出關鍵欄位
//
// 為什麼要寫成檔案：`node -e "..."` 在 PowerShell 裡會吃掉 regex 的 `$`
// （`$/gm` 被當成變數插值），於是「驗證 JSON」的指令自己先壞掉。
// 今晚第三次踩到 —— 而這次的副作用是「我以為 JSON 壞了，其實是我的驗證指令壞了」。
//
// 這是今晚第 31 次「工具端錯了，症狀指向被測對象」。
const fs = require('fs');
const path = require('path');

const f = process.argv[2] || path.join(__dirname, '..', 'wrangler.jsonc');
const raw = fs.readFileSync(f, 'utf8');

// jsonc = JSON + // 行註解 + /* */ 區塊註解
const stripped = raw
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, '');

try {
  const o = JSON.parse(stripped);
  console.log('');
  console.log('  JSON parse   OK');
  console.log('  name         ' + o.name);
  console.log('  account_id   ' + (o.account_id ? o.account_id.slice(0, 12) + '…' : '(none — 會佈到錯帳號)'));
  console.log('  main         ' + o.main);
  console.log('  workers_dev  ' + o.workers_dev);
  console.log('  routes       ' + JSON.stringify((o.routes || []).map(r => r.pattern + (r.custom_domain ? ' (custom_domain)' : ''))));
  console.log('  assets       ' + JSON.stringify(o.assets && o.assets.binding));
  console.log('  durable_obj  ' + (o.durable_objects ? JSON.stringify(o.durable_objects) : '(none)'));
  console.log('  vars         ' + Object.keys(o.vars || {}).join(', '));
  const missing = ['main', 'name'].filter(k => !o[k]);
  if (missing.length) { console.log('  ★ 缺 ' + missing.join(', ')); process.exit(1); }
  console.log('');
} catch (e) {
  console.log('');
  console.log('  XX JSON parse FAILED: ' + e.message);
  const m = /position (\d+)/.exec(e.message);
  if (m) {
    const pos = Number(m[1]);
    const before = raw.slice(Math.max(0, pos - 160), pos);
    const line = raw.slice(0, pos).split('\n').length;
    console.log('     (raw 檔案第 ' + line + ' 行附近)');
    console.log('     ' + JSON.stringify(before.slice(-150)));
  }
  console.log('');
  process.exit(1);
}