import { prisma } from "./prisma";
import { overlayByKey } from "./overlays";

/** Resolve an overlay token to its owning user + saved feature settings. */
export async function resolveOverlay(token: string, sourceKey: string) {
  const source = await (prisma as any).oBSSource.findFirst({
    where: { token, sourceKey },
    include: { user: true },
  });
  if (!source || !source.enabled) return null;

  const def = overlayByKey(sourceKey);
  const row = await (prisma as any).featureSettings.findUnique({
    where: { userId_featureKey: { userId: source.userId, featureKey: sourceKey } },
  });

  return {
    source,
    user: source.user,
    settings: (row?.settings ?? {}) as Record<string, unknown>,
    def,
  };
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Serialize settings for embedding into a <script> tag. */
export function jsonScript(data: unknown): string {
  return JSON.stringify(data ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * HTML shell for an OBS Browser Source.
 *
 * Overlays are server-rendered once for the initial paint, then keep
 * themselves fresh by polling `/api/v1/overlay-data/<sourceKey>?token=`.
 */
export function overlayShell({
  title,
  style,
  body,
  script,
  pollMs = 15000,
  sourceKey,
  token,
}: {
  title: string;
  style: string;
  body: string;
  script: string;
  pollMs?: number;
  sourceKey: string;
  token: string;
}) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:transparent;overflow:hidden;
    font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;
    -webkit-font-smoothing:antialiased}
  body{width:100vw;height:100vh}
${style}
</style>
</head>
<body>
<div id="overlay" data-source="${esc(sourceKey)}" data-token="${esc(token)}">${body}</div>
<script>
(function(){
  var root = document.getElementById("overlay");
  function paint(payload){ try { ${script} } catch (e) { console.error(e); } }
  function pull(){
    fetch("/api/v1/overlay-data/${esc(sourceKey)}?token=" + encodeURIComponent(${jsonScript(token)}), {
      headers: { Accept: "application/json" },
      cache: "no-store"
    })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ if (d) paint(d); })
      .catch(function(){});
  }
  pull();
  setInterval(pull, ${pollMs});
  document.addEventListener("visibilitychange", function(){ if (!document.hidden) pull(); });
})();
</script>
</body></html>`;
}

export function overlayHtmlResponse(html: string) {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      // OBS loads from a file:// or https origin; keep framing unrestricted.
      "X-Content-Type-Options": "nosniff",
    },
  });
}