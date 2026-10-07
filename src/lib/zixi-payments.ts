// zixi-payments.ts — livestream-dashboard 向 zixi-earth 扣 ZXC 的伺服器端 helper
//
// 橋：本檔案把「使用者選方案」轉成「zixi-earth /api/payments/charge」。
//
// 安全邊界：
//   · 只在伺服器端執行，PAYMENT_API_SECRET 不進瀏覽器
//   · idempotencyKey 用 invoice id，重試不會重複扣款
//   · 先 charge 成功才開通方案，避免「沒付錢拿到服務」
import { zixiApiBase } from "./zixi-endpoints";

export type ZixiPaymentChargeResult = {
  ok: boolean;
  error?: string;
  payment?: unknown;
  created?: boolean;
};

/** 用已儲存的 ZIXI OAuth token 向 zixi-earth 取使用者 id。 */
export async function getZixiUserId(accessToken: string): Promise<number | null> {
  try {
    const r = await fetch(`${zixiApiBase()}/api/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const sub = Number(j?.sub);
    return Number.isFinite(sub) ? sub : null;
  } catch {
    return null;
  }
}

export async function chargeZixi(opts: {
  zixiUserId: number;
  amount: number;
  idempotencyKey: string;
  meta?: Record<string, unknown>;
}): Promise<ZixiPaymentChargeResult> {
  const secret = process.env.PAYMENT_API_SECRET;
  if (!secret) {
    return { ok: false, error: "伺服器未設定 PAYMENT_API_SECRET，無法扣款" };
  }
  try {
    const r = await fetch(`${zixiApiBase()}/api/payments/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Secret": secret,
      },
      body: JSON.stringify({
        userId: opts.zixiUserId,
        amount: Math.floor(opts.amount),
        provider: "livestream-dashboard",
        idempotencyKey: opts.idempotencyKey,
        meta: opts.meta ?? null,
      }),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: j?.error || `HTTP ${r.status}` };
    if (j?.error) return { ok: false, error: String(j.error) };
    return { ok: true, payment: j?.payment, created: j?.created };
  } catch (e: any) {
    return { ok: false, error: e?.message || "網路錯誤，無法連到 zixi-earth" };
  }
}

export async function confirmZixiCharge(idempotencyKey: string, note?: string): Promise<boolean> {
  const secret = process.env.PAYMENT_API_SECRET;
  if (!secret) return false;
  try {
    const r = await fetch(`${zixiApiBase()}/api/payments/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Secret": secret,
      },
      body: JSON.stringify({ idempotencyKey, note }),
    });
    const j: any = await r.json().catch(() => null);
    return r.ok && (j?.ok === true || j?.state === "confirmed" || j?.alreadyConfirmed === true);
  } catch {
    return false;
  }
}
