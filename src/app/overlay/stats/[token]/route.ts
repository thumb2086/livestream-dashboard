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
<div style="position:fixed;bottom:30px;right:30px;background:rgba(0,0,0,0.8);border-radius:14px;padding:12px 18px;min-width:160px;border:1px solid rgba(255,255,255,0.1)">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.1)">
<span style="width:8px;height:8px;border-radius:50%;background:#0bdf50"></span>
<span style="color:#fff;font-size:12px;font-weight:600">訂閱數</span>
</div>
<div style="text-align:center;padding:4px 0">
<span id="count" style="color:#fff;font-size:24px;font-weight:700">0</span>
</div>
</div>
<script>
(function(){
  function update(){
    fetch('/api/v1/stats').then(function(r){return r.json()}).then(function(d){
      document.getElementById('count').textContent=d.followers||0;
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
