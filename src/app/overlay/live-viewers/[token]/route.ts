import { resolveOverlay, overlayShell, overlayHtmlResponse } from "@/lib/overlay-render";

export const dynamic = "force-dynamic";

/** OBS Browser Source: concurrent viewer counter. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveOverlay(token, "live-viewers");
  if (!resolved) return new Response("Not Found", { status: 404 });
  const { settings } = resolved;

  const body = `
<div class="wrap" id="wrap">
  <div class="title" id="title"></div>
  <div class="row">
    <span class="label" id="label"></span>
    <span class="value" id="value">0</span>
  </div>
</div>`;

  const style = `
  .wrap{position:fixed;display:flex;flex-direction:column;gap:2px;
    border-radius:14px;padding:10px 18px;opacity:0;transition:opacity .3s ease}
  .wrap[data-pos="右上"]{top:24px;right:24px}
  .wrap[data-pos="左上"]{top:24px;left:24px}
  .wrap[data-pos="右下"]{bottom:24px;right:24px}
  .wrap[data-pos="左下"]{bottom:24px;left:24px}
  .wrap[data-pos="置中"]{top:24px;left:50%;transform:translateX(-50%)}
  .title{font-size:13px;font-weight:700}
  .row{display:flex;align-items:baseline;gap:8px}
  .label{font-size:14px;opacity:.8}
  .value{font-weight:800;line-height:1.05;letter-spacing:-.01em;
    transition:transform .25s cubic-bezier(.2,.8,.2,1)}
  .value[data-bump="1"]{transform:scale(1.08)}`;

  const script = `
  if (!payload.enabled) { wrap.style.opacity = "0"; return; }
  wrap.style.opacity = "1";
  wrap.style.background = payload.bg || "rgba(13,17,26,0.82)";
  wrap.style.color = payload.textColor || "#fff";
  wrap.dataset.pos = payload.position || "右上";
  title.textContent = payload.title || "";
  title.style.color = payload.accent || "#059669";
  title.style.display = payload.title ? "block" : "none";
  label.textContent = payload.label || "";
  label.style.display = payload.label ? "inline" : "none";
  var n;
  if (payload.known === false) {
    // No platform could report a figure. Showing "0" here would claim the
    // stream is empty, which is a different and wrong statement.
    n = payload.knownLabel || "--";
  } else {
    var v = Number(payload.viewers) || 0;
    n = payload.thousands ? v.toLocaleString() : String(v);
  }
  if (value.textContent !== n) {
    value.textContent = n;
    value.dataset.bump = "1";
    setTimeout(function(){ delete value.dataset.bump; }, 260);
  }
  value.style.color = payload.accent || "#059669";
  var sizes = { "小": 34, "中": 52, "大": 76, "特大": 104 };
  value.style.fontSize = (sizes[payload.size] || 52) + "px";`;

  return overlayHtmlResponse(
    overlayShell({
      title: "同時觀看人數",
      style,
      body,
      script,
      pollMs: Math.max(5, Number(settings.refreshSeconds ?? 15)) * 1000,
      sourceKey: "live-viewers",
      token,
    })
  );
}