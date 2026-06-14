import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const source = await prisma.oBSSource.findFirst({
      where: { token, sourceKey: "stats" },
    });
    if (!source || !source.enabled) return new Response("Not Found", { status: 404 });

    const html = `<!DOCTYPE html>
<html style="margin:0;background:transparent;overflow:hidden">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;font-family:system-ui,sans-serif">
<div style="position:fixed;bottom:30px;right:30px;background:rgba(0,0,0,0.8);border-radius:14px;padding:14px 20px;min-width:200px;border:1px solid rgba(255,255,255,0.1)">
<div style="display:flex;justify-content:space-between;padding:4px 0">
<span style="color:rgba(255,255,255,0.5);font-size:13px">Twitch</span>
<span id="twitch-count" style="color:#9146ff;font-size:15px;font-weight:700">0</span>
</div>
<div style="display:flex;justify-content:space-between;padding:4px 0">
<span style="color:rgba(255,255,255,0.5);font-size:13px">YouTube</span>
<span id="yt-count" style="color:#ff0033;font-size:15px;font-weight:700">0</span>
</div>
</div>
<script>
(function(){
  function update(){
    fetch('/api/v1/stats').then(function(r){return r.json()}).then(function(d){
      document.getElementById('twitch-count').textContent=d.twitch||0;
      document.getElementById('yt-count').textContent=d.youtube||0;
    }).catch(function(){});
  }
  update();
  setInterval(update,30000);
})();
</script>
</body></html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("Stats overlay error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}
