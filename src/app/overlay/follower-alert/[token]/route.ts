import { resolveOverlay, overlayShell, overlayHtmlResponse } from "@/lib/overlay-render";

export const dynamic = "force-dynamic";

/**
 * OBS Browser Source: follower / subscription alert.
 * Plays the newest event once, then fades out.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOverlay(token, "follower-alert");
  if (!resolved) return new Response("Not Found", { status: 404 });

  const body = `<div class="card" id="card"><div class="row">
    <div class="avatar" id="avatar" hidden></div>
    <div class="copy">
      <div class="name" id="name"></div>
      <div class="what" id="what"></div>
      <div class="msg" id="msg" hidden></div>
    </div>
  </div></div>`;

  const style = `
  .card{position:fixed;display:flex;align-items:center;gap:12px;border-radius:14px;
    padding:12px 18px;opacity:0;transform:translateY(14px);
    transition:opacity .4s ease,transform .4s cubic-bezier(.2,.8,.2,1);
    pointer-events:none;max-width:420px}
  .card[data-show="1"]{opacity:1;transform:translateY(0)}
  .card[data-pos="右上"]{top:24px;right:24px}
  .card[data-pos="左上"]{top:24px;left:24px}
  .card[data-pos="右下"]{bottom:24px;right:24px}
  .card[data-pos="左下"]{bottom:24px;left:24px}
  .row{display:flex;align-items:center;gap:12px;width:100%}
  .avatar{width:40px;height:40px;flex-shrink:0;border-radius:50%;
    display:flex;align-items:center;justify-content:center;
    font-size:16px;font-weight:800;color:#fff}
  .copy{min-width:0}
  .name{font-size:15px;font-weight:700}
  .what{font-size:13px;opacity:.8;margin-top:1px}
  .msg{font-size:12px;opacity:.6;margin-top:4px;max-width:280px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;

  const script = `
  if (!payload.enabled) { card.dataset.show = "0"; return; }
  card.style.background = "rgba(13,17,26,0.86)";
  card.style.color = payload.textColor || "#fff";
  card.style.border = "1px solid " + (payload.accent || "#059669") + "55";
  card.dataset.pos = payload.position || "右上";
  card.style.flexDirection = payload.layout === "橫幅" ? "row" : "column";
  if (!window.__seen) { window.__seen = {}; }
  var events = payload.events || [];
  var latest = events[0];
  if (!latest || !latest.id) { card.dataset.show = "0"; return; }
  if (window.__seen[latest.id]) return;
  window.__seen[latest.id] = 1;
  var kind = latest.kind === "sub" ? "sub" : "follow";
  var tmpl = kind === "sub" ? (payload.subText || "") : (payload.followText || "");
  what.textContent = tmpl
    .replace("{name}", latest.name || "")
    .replace("{tier}", latest.tier || "")
    .replace("{months}", latest.months || "");
  name.textContent = latest.name || "";
  name.style.color = payload.accent || "#059669";
  if (payload.showAvatar) {
    avatar.hidden = false;
    avatar.style.background = payload.accent || "#059669";
    avatar.textContent = (latest.name || "?").charAt(0);
  } else { avatar.hidden = true; }
  if (payload.showMessage && latest.message) {
    msg.hidden = false;
    msg.textContent = "「" + latest.message + "」";
  } else { msg.hidden = true; }
  card.dataset.show = "1";
  clearTimeout(window.__alertTimer);
  window.__alertTimer = setTimeout(function(){ card.dataset.show = "0"; },
    (payload.duration || 6) * 1000);`;

  return overlayHtmlResponse(
    overlayShell({
      title: "追隨與訂閱提醒",
      style,
      body,
      script,
      pollMs: 5000,
      sourceKey: "follower-alert",
      token,
    })
  );
}