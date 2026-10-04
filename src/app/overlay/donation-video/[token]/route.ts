import { resolveOverlay, overlayShell, overlayHtmlResponse } from "@/lib/overlay-render";

export const dynamic = "force-dynamic";

/** OBS Browser Source: approved donation video queue. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOverlay(token, "donation-video");
  if (!resolved) return new Response("Not Found", { status: 404 });

  const body = `<div class="stage" id="stage">
  <div class="head" id="head">
    <span class="donor" id="donor"></span>
    <span class="badge" id="badge">已排播</span>
  </div>
  <div class="player" id="player"></div>
  <div class="msg" id="msg" hidden></div>
  <div class="queue" id="queue" hidden></div>
</div>`;

  const style = `
  .stage{position:fixed;opacity:0;transition:opacity .3s ease;border-radius:14px;
    overflow:hidden;color:#fff}
  .stage[data-pos="center"]{top:50%;left:50%;transform:translate(-50%,-50%)}
  .stage[data-pos="left"]{left:28px;bottom:28px}
  .stage[data-pos="right"]{right:28px;bottom:28px}
  .head{display:flex;align-items:center;gap:10px;padding:10px 16px;font-size:15px;font-weight:700}
  .badge{padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700}
  .player{aspect-ratio:16/9;background:rgba(0,0,0,.45);display:flex;align-items:center;
    justify-content:center;max-width:100%}
  .player video{width:100%;height:100%;object-fit:contain}
  .msg{padding:10px 16px;font-size:13px;opacity:.75}
  .queue{padding:10px 16px;border-top:1px solid rgba(255,255,255,.1);
    display:flex;flex-direction:column;gap:4px;font-size:12px;opacity:.7}`;

  const script = `
  var q = payload.queue || [];
  stage.style.opacity = payload.enabled && q.length ? "1" : "0";
  stage.style.background = payload.surface || "rgba(13,17,26,0.9)";
  stage.style.width = Math.min(payload.playerWidth || 720, window.innerWidth - 40) + "px";
  if (!q.length) return;
  var cur = q[0];
  donor.textContent = cur.donorName || "匿名";
  badge.style.background = payload.accent || "#059669";
  if (!payload.showDonorMessage || !cur.message) { msg.hidden = true; }
  else { msg.hidden = false; msg.textContent = "「" + cur.message + "」"; }
  var v = document.createElement("video");
  v.src = cur.videoUrl;
  v.controls = false;
  v.autoplay = true;
  v.playsInline = true;
  player.innerHTML = "";
  player.appendChild(v);
  if (cur.startSec) { v.addEventListener("loadedmetadata", function(){ try { v.currentTime = cur.startSec; } catch(e){} }); }
  if (cur.endSec > cur.startSec) {
    v.addEventListener("timeupdate", function(){
      if (v.currentTime >= cur.endSec) {
        if (payload.autoPlayNext !== false) { window.location.reload(); }
        else { v.pause(); }
      }
    });
  }
  v.addEventListener("error", function(){
    player.innerHTML = '<div style="padding:20px;font-size:13px;opacity:.7">' +
      "影片無法載入：" + escapeHtml(cur.videoUrl) + "</div>";
  });
  if (payload.showQueueList && q.length > 1) {
    queue.hidden = false;
    queue.innerHTML = q.slice(1, 6).map(function (d, i) {
      return "<span>" + (i + 2) + ". " + escapeHtml(d.donorName || "匿名") + "</span>";
    }).join("");
  } else { queue.hidden = true; }`;

  const helpers = `function escapeHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}`;

  return overlayHtmlResponse(
    overlayShell({
      title: "斗內影片",
      style,
      body,
      script: helpers + script,
      pollMs: 10000,
      sourceKey: "donation-video",
      token,
    })
  );
}