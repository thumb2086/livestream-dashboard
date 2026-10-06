// onboard-state-http.ts — Onboarding 狀態的 Neon HTTP 存取
import { queryOne } from "./db-http";

export interface OnboardStateRow {
  id: string;
  userId: string;
  step1: boolean;
  step2: boolean;
  step3: boolean;
  step4: boolean;
}

export async function getOnboardState(userId: string): Promise<OnboardStateRow | null> {
  const r = await queryOne<OnboardStateRow>(
    'SELECT * FROM "OnboardState" WHERE "userId" = $1 LIMIT 1', [userId]);
  return r;
}

export async function upsertOnboardState(userId: string, data: Record<string, unknown>): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [userId];
  for (const k of ['step1', 'step2', 'step3', 'step4'] as const) {
    if (k in data) {
      params.push(Boolean(data[k]));
      sets.push(`"${k}" = EXCLUDED."${k}"`);
    }
  }
  const cols = ['id', 'userId'];
  const vals = ['$1', '$2'];
  const insertParams: unknown[] = [crypto.randomUUID(), userId];
  for (const k of ['step1', 'step2', 'step3', 'step4'] as const) {
    if (k in data) {
      insertParams.push(Boolean(data[k]));
      cols.push(`"${k}"`);
      vals.push(`$${insertParams.length}`);
    }
  }
  const queryStr = `INSERT INTO "OnboardState" (${cols.join(', ')}) VALUES (${vals.join(', ')})
     ON CONFLICT ("userId") DO UPDATE SET ${sets.join(', ')}`;
  // If nothing was provided, still create a default row so the user exists.
  if (sets.length === 0) {
    await queryOne('INSERT INTO "OnboardState" ("id","userId") VALUES ($1,$2) ON CONFLICT ("userId") DO NOTHING', [crypto.randomUUID(), userId]);
  } else {
    await queryOne(queryStr, insertParams);
  }
}
