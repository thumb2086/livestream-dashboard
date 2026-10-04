import { resolveOverlay, overlayShell, overlayHtmlResponse } from "@/lib/overlay-render";

export const dynamic = "force-dynamic";

const RARITY: Record<string, { bg: string; fg: string }> = {
  R: { bg: "#e6ebf2", fg: "#475569" },
  SR: { bg: "#dbeafe", fg: "#1d4ed8" },
  SSR: { bg: "#fef3c7", fg: "#b45309" },
  UR: { bg: "#fde68a", fg: "#92400e" },
};

/** OBS Browser Source: gacha card grid for donations. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOverlay(token, "donation-cards");
  if (!resolved) return new Response("Not Found", { status: 404 });

  const body = `<div class="grid" id="grid"></div>`;

  const style = `
  .grid{position:fixed;inset:0;display:flex;align-content:center;justify-content:center;
    gap:14px;padding:40px;opacity:0;transition:opacity .3s ease}
  .grid[data-layout="單排"]{flex-wrap:nowrap}
  .grid[data-layout="4x2"]{flex-wrap:wrap;max-width:1600px;margin:0 auto}
  .grid[data-layout="3x2"]{flex-wrap:wrap;max-width:1200px;margin:0 auto}
  .card{width:190px;aspect-ratio:3/4;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:6px;border-radius:12px;padding:10px;text-align:center;
    box-shadow:0 6px 18px rgba(15,23,42,.28)}
  .card .tier{font-size:10px;font-weight:800}
  .card .icon{font-size:30px;line-height:1}
  .card .name{font-size:12px;font-weight:700;color:#0d111a;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .card .mult{font-size:10px;color:#64748b}`;

  const script = `
  grid.style.opacity = payload.enabled ? "1" : "0";
  grid.dataset.layout = payload.layout || "3x2";
  var RARITY = ${JSON.stringify(RARITY)};
  grid.innerHTML = (payload.cards || []).map(function (c) {
    var r = RARITY[c.rarity] || RARITY.R;
    return '<div class="card" style="background:linear-gradient(160deg,' + r.bg + ",#fff)\">" +
      '<span class="tier" style="color:' + r.fg + '">' + escapeHtml(c.rarity || "R") + "</span>" +
      '<span class="icon">' + escapeHtml(c.emoji || "🎴") + "</span>" +
      '<span class="name">' + escapeHtml(c.name || "") + "</span>" +
      '<span class="mult">x' + escapeHtml(c.multiplier || "1") + "</span></div>";
  }).join("");`;

  const helpers = `function escapeHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}`;

  return overlayHtmlResponse(
    overlayShell({
      title: "斗內卡牌",
      style,
      body,
      script: helpers + script,
      pollMs: 30000,
      sourceKey: "donation-cards",
      token,
    })
  );
}