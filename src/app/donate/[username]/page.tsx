import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Heart } from "lucide-react";

export const dynamic = "force-dynamic";

const amounts = [
  { value: 100, label: "一杯咖啡", icon: Heart },
  { value: 300, label: "一份雞排", icon: Heart },
  { value: 500, label: "支持創作", icon: Heart },
  { value: 1000, label: "超級粉絲", icon: Heart },
];

export default async function PublicDonatePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const decoded = decodeURIComponent(username);
  const cleanName = decoded.startsWith("@") ? decoded.slice(1) : decoded;
  const user = await prisma.user.findUnique({ where: { username: cleanName } });
  if (!user || !user.publicPage) return notFound();

  const goals = await prisma.donationGoal.findMany({
    where: { userId: user.id },
    orderBy: { sortOrder: "asc" },
  });
  const totalReceived = goals.reduce((s: number, g: { current: number }) => s + g.current, 0);
  const hasZixi = user.zixiWallet && user.zixiWallet.startsWith("0x");

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", fontFamily: "system-ui, sans-serif", padding: "40px 16px" }}>
      <div style={{ maxWidth: "480px", margin: "0 auto", textAlign: "center" }}>
        <div style={{ marginBottom: "32px" }}>
          <div style={{ width: "72px", height: "72px", borderRadius: "50%", margin: "0 auto 16px", background: "rgba(255,86,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", fontWeight: "bold", color: "#ff5600", border: "2px solid rgba(255,86,0,0.3)", overflow: "hidden" }}>
            {user.avatar ? <img src={user.avatar} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} /> : user.name.charAt(0)}
          </div>
          <h1 style={{ margin: "0 0 4px", fontSize: "24px", fontWeight: 700, color: "#ffffff" }}>贊助 {user.name}</h1>
          <p style={{ margin: 0, fontSize: "14px", color: "rgba(255,255,255,0.6)" }}>你的支持是創作者最大的動力 ❤️</p>
        </div>

        {hasZixi ? (<>
          {goals.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "14px", padding: "16px", marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>
                <span>贊助進度</span>
                <span style={{ color: "#ff5600", fontWeight: 700 }}>ZXC {totalReceived.toLocaleString()}</span>
              </div>
              {goals.slice(0, 1).map((g: { id: string; title: string; current: number; goal: number }) => {
                const pct = Math.min(100, Math.round((g.current / g.goal) * 100));
                return (
                  <div key={g.id}>
                    <div style={{ height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "999px", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "#ff5600", borderRadius: "999px" }} />
                    </div>
                    <div style={{ marginTop: "4px", fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{g.title}: ZXC {g.current.toLocaleString()} / ZXC {g.goal.toLocaleString()}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ color: "#ff5600", fontSize: "13px", fontWeight: 700, marginBottom: "16px" }}>ZIXI 生態系贊助</h3>
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px", border: "2px solid #ff5600" }}>
                  <div style={{ color: "#ff5600", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>子熙幣</div>
                  <div style={{ color: "#ffffff", fontSize: "18px", fontWeight: 700 }}>ZXC</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <div style={{ color: "#a78bfa", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>佑戩幣</div>
                  <div style={{ color: "#ffffff", fontSize: "18px", fontWeight: 700 }}>YJC</div>
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "12px", padding: "16px" }}>
                <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)", marginBottom: "8px", textAlign: "left" }}>贊助地址：</div>
                <div style={{ fontFamily: "monospace", fontSize: "12px", color: "rgba(255,255,255,0.8)", wordBreak: "break-all", background: "rgba(0,0,0,0.3)", padding: "12px", borderRadius: "8px", textAlign: "left", userSelect: "all" }}>
                  {user.zixiWallet}
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: "12px", padding: "16px", textAlign: "left" }}>
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", fontWeight: 600, marginBottom: "8px" }}>如何贊助</div>
                <ol style={{ margin: 0, padding: "0 0 0 20px", fontSize: "12px", color: "rgba(255,255,255,0.5)", lineHeight: 1.8 }}>
                  <li>前往 <a href="https://zixi-casino.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: "#ff5600" }}>ZIXI Casino</a> 註冊錢包</li>
                  <li>複製上方贊助地址</li>
                  <li>在你的 ZIXI 錢包中發送 ZXC / YJC</li>
                  <li>贊助將直接進入創作者錢包 🎉</li>
                </ol>
              </div>
            </div>
          </div>
        </>) : (
          <p style={{ fontSize: "14px", color: "rgba(255,255,255,0.4)" }}>此創作者尚未開通贊助功能</p>
        )}

        <p style={{ marginTop: "16px", fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>
          由 StreamFlow 提供技術支援 · ZIXI 贊助由區塊鏈技術保障
        </p>
      </div>
    </div>
  );
}
