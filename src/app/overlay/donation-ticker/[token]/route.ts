import { resolveOverlay, overlayShell, overlayHtmlResponse } from "@/lib/overlay-render";

export const dynamic = "force-dynamic";

/** OBS Browser Source: donation ticker (scrolling marquee). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOverlay(token, "donation-ticker");
  if (!resolved) return new Response("Not Found", { status: 404 });

  const body = `<div class="bar" id="bar"><div class="track" id="track"></div></div>`;

  const style = `
  .bar{position:fixed;left:0;right:0;display:flex;align-items:center;overflow:hidden;
    padding:8px 0;opacity:0;transition:opacity .3s ease}
  .bar[data-pos="頂部"]{top:0}
  .bar[data-pos="底部"]{bottom:0}
  .track{display:flex;white-space:nowrap;will-change:transform}
  .item{display:inline-flex;align-items:center;gap:7px;flex-shrink:0}
  .dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}
  .sep{opacity:.45;padding:0 14px}
  @keyframes scroll-rtl{from{transform:translateX(0)}to{transform:translateX(-50%)}}
  @keyframes scroll-ltr{from{transform:translateX(-50%)}to{transform:translateX(0)}}
  .bar[data-dir="rtl"] .track{animation:scroll-rtl linear infinite}
  .bar[data-dir="ltr"] .track{animation:scroll-ltr linear infinite}`;

  const script = `
  bar.style.opacity = payload.enabled ? "1" : "0";
  bar.style.background = payload.background || "rgba(13,17,26,0.85)";
  bar.dataset.pos = payload.position || "底部";
  bar.dataset.dir = (payload.direction || "由右至左") === "由右至左" ? "rtl" : "ltr";
  var sizes = { "小": 13, "中": 16, "大": 20, "特大": 26 };
  var speeds = { "慢": 42, "中": 26, "快": 15 };
  track.style.fontSize = (sizes[payload.fontSize] || 16) + "px";
  track.style.animationDuration = (speeds[payload.speed] || 26) + "s";
  var items = payload.items || [];
  if (!items.length) { track.innerHTML = ""; return; }
  function seg() {
    return items.map(function (d) {
      var parts = [];
      if (payload.showAvatar) parts.push('<span class="dot" style="background:' + payload.accent + '"></span>');
      parts.push("<strong>" + escapeHtml(d.name) + "</strong>");
      if (payload.showAmount) parts.push('<span style="color:' + payload.accent + ';font-weight:700">' + d.amount + " " + escapeHtml(d.currency) + "</span>");
      if (payload.showMessage && d.message) parts.push('<span style="opacity:.75">' + escapeHtml(d.message) + "</span>");
      return '<span class="item">' + parts.join(" ") + '</span><span class="sep">' + (payload.separator || "💛") + "</span>";
    }).join("");
  }
  var html = seg();
  track.innerHTML = html + html;
  track.style.color = payload.textColor || "#fff";`;

  const helpers = `function escapeHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}`;

  return overlayHtmlResponse(
    overlayShell({
      title: "斗內跑馬燈",
      style,
      body,
      script: helpers + script,
      pollMs: 15000,
      sourceKey: "donation-ticker",
      token,
    })
  );
}