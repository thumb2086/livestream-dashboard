import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/getUser";

const ZIXI_API = process.env.ZIXI_API_URL || "https://zixi-casino-api.onrender.com/api/v1";

async function getAuthHeaders(req: Request): Promise<Record<string, string>> {
  const sessionId = getSessionId(req);
  if (sessionId) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (session) {
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (user?.zixiAccessToken) {
        const expires = user.zixiTokenExpiresAt ? new Date(user.zixiTokenExpiresAt) : null;
        if (!expires || expires > new Date()) {
          return { "Authorization": `Bearer ${user.zixiAccessToken}` };
        }
      }
    }
  }
  const adminSession = process.env.ZIXI_ADMIN_SESSION;
  if (adminSession) {
    return { "x-session-id": adminSession };
  }
  return {};
}

async function adminAdjustBalance(address: string, amount: string, token: string, reason: string, adminSession: string) {
  const res = await fetch(`${ZIXI_API}/admin/adjust-balance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId: adminSession, address, amount, token, reason }),
  });
  return res.json();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "login") {
      const res = await fetch(`${ZIXI_API}/auth/custody/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: body.username, password: body.password }),
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "setup-admin") {
      const res = await fetch(`${ZIXI_API}/auth/custody/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: body.username, password: body.password }),
      });
      const data = await res.json();
      if (data.success && data.data?.sessionId) {
        return NextResponse.json({ success: true, sessionId: data.data.sessionId, message: "將此 sessionId 填入 .env 的 ZIXI_ADMIN_SESSION" });
      }
      return NextResponse.json({ success: false, error: data.data?.error?.message || "Login failed" });
    }

    if (action === "admin-transfer") {
      const adminSession = process.env.ZIXI_ADMIN_SESSION;
      if (!adminSession) return NextResponse.json({ success: false, error: "Admin session not configured" }, { status: 500 });
      if (!body.donorAddress || !body.creatorAddress || !body.amount) {
        return NextResponse.json({ success: false, error: "Missing donorAddress, creatorAddress, or amount" }, { status: 400 });
      }
      const amt = String(body.amount);
      const token = body.token === "YJC" ? "yjc" : "zhixi";
      const reason = `StreamFlow donation: ${body.donorName || "anonymous"} → ${body.creatorName || "creator"}`;

      const deductRes = await adminAdjustBalance(body.donorAddress, `-${amt}`, token, reason, adminSession);
      if (!deductRes.success) {
        return NextResponse.json({ success: false, error: deductRes.data?.error?.message || "Failed to deduct from donor" });
      }

      const creditRes = await adminAdjustBalance(body.creatorAddress, amt, token, reason, adminSession);
      if (!creditRes.success) {
        await adminAdjustBalance(body.donorAddress, amt, token, "REVERSAL: " + reason, adminSession).catch(() => {});
        return NextResponse.json({ success: false, error: creditRes.data?.error?.message || "Failed to credit creator" });
      }

      return NextResponse.json({ success: true, data: { message: `Transferred ${amt} ${token}`, tx: deductRes.data?.intent || creditRes.data?.intent } });
    }

    if (action === "wallet-summary") {
      const authHeaders = await getAuthHeaders(req);
      const res = await fetch(`${ZIXI_API}/wallet/summary`, {
        headers: { ...authHeaders, "Content-Type": "application/json" },
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    if (action === "me") {
      const authHeaders = await getAuthHeaders(req);
      const res = await fetch(`${ZIXI_API}/auth/me`, {
        headers: { ...authHeaders, "Content-Type": "application/json" },
      });
      const data = await res.json();
      return NextResponse.json(data);
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("ZIXI proxy error:", e);
    return NextResponse.json({ success: false, error: "ZIXI proxy failed" }, { status: 500 });
  }
}
