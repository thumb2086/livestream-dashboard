// payment-settings-http.ts — 支付設定的 Neon HTTP 存取
//
// 覆蓋 /api/v1/payment-settings（2 處 Prisma，都是 `(prisma as any)`）。
import { queryOne } from "./db-http";

export interface PaymentSettingRow {
  id: string;
  userId: string;
  ecpayEnabled: boolean;
  ecpayMerchant: string;
  ecpayHashKey: string;
  ecpayHashIv: string;
  opayEnabled: boolean;
  opayMerchant: string;
  opayHashKey: string;
  opayHashIv: string;
  paypalEnabled: boolean;
  paypalClientId: string;
  minAmount: number;
  updatedAt: string;
}

const PS_COLS = `"id", "userId", "ecpayEnabled", "ecpayMerchant", "ecpayHashKey", "ecpayHashIv",
                 "opayEnabled", "opayMerchant", "opayHashKey", "opayHashIv",
                 "paypalEnabled", "paypalClientId", "minAmount", "updatedAt"`;

export async function getPaymentSetting(userId: string): Promise<PaymentSettingRow | null> {
  const r = await queryOne<PaymentSettingRow>(
    `SELECT ${PS_COLS} FROM "PaymentSetting" WHERE "userId" = $1 LIMIT 1`, [userId]);
  return r;
}

export async function upsertPaymentSetting(
  userId: string,
  data: Record<string, unknown>,
): Promise<PaymentSettingRow | null> {
  const sets: string[] = [];
  const insertCols = ['id", "userId'];
  const insertVals: unknown[] = [crypto.randomUUID(), userId];
  const keys = [
    'ecpayEnabled', 'ecpayMerchant', 'ecpayHashKey', 'ecpayHashIv',
    'opayEnabled', 'opayMerchant', 'opayHashKey', 'opayHashIv',
    'paypalEnabled', 'paypalClientId', 'minAmount',
  ] as const;
  for (const k of keys) {
    if (data[k] !== undefined) {
      const v = k === 'ecpayEnabled' || k === 'opayEnabled' || k === 'paypalEnabled'
        ? Boolean(data[k])
        : k === 'minAmount' ? Number(data[k] ?? 30) : String(data[k] ?? '');
      insertCols.push(`"${k}"`);
      insertVals.push(v);
      sets.push(`"${k}" = EXCLUDED."${k}"`);
    }
  }
  const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(', ');
  const r = await queryOne<PaymentSettingRow>(
    `INSERT INTO "PaymentSetting" (${insertCols.join(', ')}, "updatedAt")
     VALUES (${placeholders}, NOW())
     ON CONFLICT ("userId") DO UPDATE SET ${sets.join(', ')}, "updatedAt" = NOW()
     RETURNING ${PS_COLS}`,
    insertVals,
  );
  return r;
}
