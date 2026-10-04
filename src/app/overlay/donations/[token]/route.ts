import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const source = await prisma.oBSSource.findFirst({
      where: { token, sourceKey: "donation-goal" },
      include: { user: { include: { donationGoals: { orderBy: { sortOrder: "asc" } } } } },
    });
    if (!source || !source.enabled) return new Response("Not Found", { status: 404 });

    const goals = source.user.donationGoals;
    const goalHtml = goals.map((g: any) => {
      const pct = Math.min(100, Math.round((g.current / g.goal) * 100));
      return `<div style="background:rgba(0,0,0,0.7);border-radius:12px;padding:12px 16px;margin-bottom:8px">
<div style="display:flex;justify-content:space-between;margin-bottom:6px">
<span style="color:#fff;font-size:15px;font-weight:600">${g.emoji} ${g.title}</span>
<span style="color:#ff5600;font-size:13px;font-weight:700">${pct}%</span>
</div>
<div style="height:8px;background:rgba(255,255,255,0.15);border-radius:999px;overflow:hidden">
<div id="g-${g.id}" style="width:${pct}%;height:100%;background:#ff5600;border-radius:999px;transition:width 0.5s ease"></div>
</div>
<div style="display:flex;justify-content:space-between;margin-top:4px">
<span style="color:#fff;font-size:13px;font-weight:600">ZXC ${g.current.toLocaleString()}</span>
<span style="color:rgba(255,255,255,0.5);font-size:13px">目標 ZXC ${g.goal.toLocaleString()}</span>
</div></div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html style="margin:0;background:transparent;overflow:hidden">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;font-family:system-ui,sans-serif">
<div id="root" style="position:fixed;bottom:30px;left:50%;transform:translateX(-50%);width:90%;max-width:600px;display:flex;flex-direction:column;gap:0">
${goalHtml}
</div>
<script>
setInterval(function(){
  fetch(window.location.href,{headers:{Accept:'application/json'}})
    .then(function(r){return r.text()})
    .then(function(html){
      var root=document.getElementById('root');
      if(root){root.innerHTML=html.match(/<div id="root">([\\s\\S]*?)<\\/div>/)?.[1]||root.innerHTML}
    }).catch(function(){});
},15000);
</script>
</body></html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("Donations overlay error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}
