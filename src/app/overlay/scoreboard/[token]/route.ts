import { resolveOverlay, overlayShell, overlayHtmlResponse } from "@/lib/overlay-render";

export const dynamic = "force-dynamic";

const FONTS: Record<string, string> = {
  noto: '"Noto Sans TC","Microsoft JhengHei",sans-serif',
  jhenghei: '"Microsoft JhengHei","Noto Sans TC",sans-serif',
  ui: 'system-ui,-apple-system,"Segoe UI",sans-serif',
  jfopen: '"jf open 粉圓","Noto Sans TC",sans-serif',
};

/** OBS Browser Source: live scoreboard. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOverlay(token, "scoreboard");
  if (!resolved) return new Response("Not Found", { status: 404 });

  const body = `<div class="board" id="board"></div>`;

  const style = `
  .board{position:fixed;display:flex;flex-direction:column;gap:8px;opacity:0;
    transition:opacity .3s ease}
  .board[data-placement="top"]{top:28px;left:50%;transform:translateX(-50%)}
  .board[data-placement="left"]{top:50%;left:28px;transform:translateY(-50%)}
  .board[data-placement="right"]{top:50%;right:28px;transform:translateY(-50%)}
  .board[data-placement="top"]{flex-direction:row}
  .board[data-placement="left"],.board[data-placement="right"]{flex-direction:column}
  .card{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:18px;
    min-width:340px;padding:12px 18px;border-radius:16px;
    border:2px solid var(--accent);color:var(--text)}
  .board[data-placement="left"] .card,.board[data-placement="right"] .card{min-width:260px}
  .rank{display:flex;flex-direction:column;align-items:center;min-width:52px}
  .rank small{font-size:10px;letter-spacing:.12em;opacity:.7}
  .rank strong{font-size:30px;line-height:1;font-weight:800}
  .player{display:flex;flex-direction:column;min-width:0}
  .player span{font-size:11px;opacity:.65}
  .player strong{font-size:20px;font-weight:700;white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis;max-width:260px}
  .value{display:flex;flex-direction:column;align-items:flex-end;min-width:64px}
  .value span{font-size:10px;letter-spacing:.12em;opacity:.7}
  .value strong{font-size:30px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums}`;

  const script = `
  board.style.opacity = payload.enabled ? "1" : "0";
  board.dataset.placement = payload.placement || "top";
  board.style.fontFamily = FONTMAP[payload.fontFamily] || FONTMAP.noto;
  var html = "";
  (payload.participants || []).forEach(function (p) {
    html += '<div class="card" style="--accent:' + p.accent + ';--text:' + p.text +
      ';background:rgb(16 19 26 / ' + (p.opacity / 100) + ');border-color:' + p.border + '">' +
      '<div class="rank"><small>RANK</small><strong>' + String(p.rank).padStart(2, "0") + "</strong></div>" +
      '<div class="player"><span>' + (p.rank === 1 ? "目前領先" : "參與者") + "</span><strong>" +
      escapeHtml(p.name) + "</strong></div>" +
      '<div class="value"><span>PTS</span><strong>' + p.score + "</strong></div></div>";
  });
  board.innerHTML = html;`;

  // Inject the font map + escaper into the shell's script scope.
  const helpers = `var FONTMAP=${JSON.stringify(FONTS)};function escapeHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}`;

  return overlayHtmlResponse(
    overlayShell({
      title: "即時比分板",
      style,
      body,
      script: helpers + script,
      pollMs: 3000,
      sourceKey: "scoreboard",
      token,
    })
  );
}