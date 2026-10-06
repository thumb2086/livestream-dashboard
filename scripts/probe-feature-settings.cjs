// probe-feature-settings.cjs — FeatureSettings.settings 是什麼型別，回來是什麼形狀
//
// 為什麼要查：verify-donation-videos-e2e 的「創作者關閉投稿」那項失敗了，
// 而我猜測是 json 欄位的型別/回傳形狀問題 ——
// 但**猜測不���證明**，所以直接查 DB。
const { neon } = require('@neondatabase/serverless');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(path.join(__dirname, '..'));
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

(async () => {
  console.log('');
  console.log('════════ FeatureSettings.settings ════════');
  const col = await sql.query(
    "SELECT data_type, udt_name FROM information_schema.columns WHERE table_name='FeatureSettings' AND column_name='settings'");
  console.log('  欄位型別: ' + JSON.stringify(col[0]));

  const uid = 'e2e_fs_' + Date.now().toString(36);
  const userId = crypto.randomUUID();
  await sql.query(
    'INSERT INTO "User" ("id","name","username","email","avatar","createdAt") VALUES ($1,$2,$3,$4,$5,NOW())',
    [userId, 'probe', uid, uid + '@test.invalid', '']);

  // 不指定 ::jsonb cast —— 讓 driver 自己處理（與 route 的寫入方式一致）
  // ⚠️ 一定要帶 updatedAt —— 它是 @updatedAt（Prisma client-side 自動填），
  //    資料庫沒有 DEFAULT，所以 raw SQL 不給就會違反 NOT NULL。
  await sql.query(
    'INSERT INTO "FeatureSettings" ("id","userId","featureKey","settings","updatedAt") VALUES ($1,$2,$3,$4,$5)',
    [crypto.randomUUID(), userId, 'donation-video', JSON.stringify({ enabled: false }), new Date().toISOString()]);

  const back = await sql.query(
    'SELECT "settings", pg_typeof("settings") AS t FROM "FeatureSettings" WHERE "userId" = $1',
    [userId]);
  console.log('  讀回的 JS 型別: ' + typeof back[0].settings);
  console.log('  讀回的值:       ' + JSON.stringify(back[0].settings));
  console.log('  pg_typeof:       ' + back[0].t);
  console.log('  enabled 讀到:    ' + JSON.stringify(back[0].settings && back[0].settings.enabled));

  await sql.query('DELETE FROM "FeatureSettings" WHERE "userId" = $1', [userId]);
  await sql.query('DELETE FROM "User" WHERE "id" = $1', [userId]);
  console.log('  cleanup: ✓');
  console.log('');
})();