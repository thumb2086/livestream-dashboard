// probe-id-defaults.cjs — 這些表的 id 欄位有沒有資料庫層的預設值？
//
// 為什麼要查：prisma/schema.prisma 寫的是 @default(cuid())，
// 而那是 **Prisma 的 client-side 預設** —— 由 Prisma 在送 INSERT 前
// 生成，不是資料庫的 DEFAULT。
//
// 所以我改用 raw SQL 之後，若省略 id 欄位，可能會插入 NULL 或失敗。
//
// 而如果我改成自己給 crypto.randomUUID()，那 id 的**格式**就從
// cuid 變成 uuid —— 那是行為改變，必須確認沒有東西依賴那個格式。
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
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

const TABLES = ['User', 'Session', 'ChatSettings', 'SubtitleConfig', 'OnboardState',
  'PlatformConnection', 'OBSSource'];

(async () => {
  console.log('');
  console.log('════════ id 欄位的 DB 層預設 ════════');
  for (const t of TABLES) {
    const r = await sql.query(
      `SELECT column_name, is_nullable, column_default, data_type
         FROM information_schema.columns
        WHERE table_name = $1 AND column_name = 'id'`,
      [t],
    );
    const row = r[0];
    console.log(
      `  ${t.padEnd(20)} ${row ? (row.column_default ?? '(無預設)') : '?'}`
      + `  nullable=${row ? row.is_nullable : '?'}`,
    );
  }
  console.log('');
  console.log('  ── 現有 id 的實際長度（看是否真的是 cuid）──');
  for (const t of ['User', 'OBSSource', 'Session']) {
    const r = await sql.query(`SELECT "id" FROM "${t}" LIMIT 3`);
    for (const row of r) {
      console.log(`    ${t.padEnd(12)} len=${String(row.id).length}  ${String(row.id).slice(0, 26)}`);
    }
  }
  console.log('');
})();