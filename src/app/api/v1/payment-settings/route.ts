import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";
import { encryptSecretForStorage } from "@/lib/secret-crypto";

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bool = (v: unknown) => v === true;

/** Everything safe to hand back: no secrets, only whether each one is present. */
function publicView(row: any) {
  if (!row) return null;
  const { ecpayHashKey, opayHashKey, ecpayHashIv, opayHashIv, ...safe } = row;
  return {
    ...safe,
    hasEcpayKey: !!ecpayHashKey,
    hasOpayKey: !!opayHashKey,
    hasEcpayIv: !!ecpayHashIv,
    hasOpayIv: !!opayHashIv,
    ecpayReady: !!row.ecpayEnabled && !!row.ecpayMerchant && !!row.ecpayHashKey && !!row.ecpayHashIv,
    opayReady: !!row.opayEnabled && !!row.opayMerchant && !!row.opayHashKey && !!row.opayHashIv,
  };
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const row = await (prisma as any).paymentSetting.findUnique({ where: { userId: user.id } });
    return NextResponse.json({ settings: publicView(row) });
  } catch (e) {
    console.error("GET /api/v1/payment-settings error:", e);
    return NextResponse.json({ error: "Failed to fetch payment settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    const data: Record<string, unknown> = {
      ecpayEnabled: bool(body.ecpayEnabled),
      ecpayMerchant: str(body.ecpayMerchant, 40),
      opayEnabled: bool(body.opayEnabled),
      opayMerchant: str(body.opayMerchant, 40),
      paypalEnabled: bool(body.paypalEnabled),
      paypalClientId: str(body.paypalClientId, 80),
      minAmount: Math.max(1, Math.min(100000, Number(body.minAmount) || 30)),
    };

    // Secrets are write-only and encrypted at rest. Omitting a field leaves the
    // stored value alone, so the settings form never has to echo them back.
    for (const [field, max] of [["ecpayHashKey", 80], ["opayHashKey", 80], ["ecpayHashIv", 80], ["opayHashIv", 80]] as const) {
      const v = str(body[field], max);
      if (v) data[field] = encryptSecretForStorage(v);
    }

    const row = await (prisma as any).paymentSetting.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });

    return NextResponse.json({ settings: publicView(row) });
  } catch (e) {
    console.error("PUT /api/v1/payment-settings error:", e);
    return NextResponse.json({ error: "Failed to save payment settings" }, { status: 500 });
  }
}