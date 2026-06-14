import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const source = await prisma.oBSSource.findFirst({
      where: { token, sourceKey: "alerts" },
      include: { user: true },
    });
    if (!source || !source.enabled) return new Response("Not Found", { status: 404 });
    const demoMode = source.user.demoMode;

    const demoScript = demoMode ? `<script>
(function(){ var container=document.getElementById('alert-container');
  var samples=[{name:"小美",amount:300,msg:"加油！最喜歡你的台了 💖"},{name:"匿名贊助",amount:1000,msg:"繼續努力！"},{name:"直播迷",amount:200,msg:"好看！"},{name:"老粉絲",amount:500,msg:"支持你很久了！"}], idx=0;
  function showAlert(a){
    var el=document.createElement('div');
    el.style.cssText='display:flex;align-items:center;gap:14px;background:rgba(0,0,0,0.85);border-radius:16px;padding:16px 24px;min-width:320px;transform:translateY(20px);opacity:0;transition:all 0.5s ease;border:1px solid rgba(255,86,0,0.3)';
    el.innerHTML='<div style="width:44px;height:44px;border-radius:50%;background:#ff5600;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:bold;color:#fff;flex-shrink:0">'+a.name.charAt(0)+'</div><div style="flex:1;min-width:0"><div style="color:#fff;font-size:15px;font-weight:600">'+a.name+'</div><div style="color:rgba(255,255,255,0.6);font-size:13px">'+a.msg+'</div></div><div style="color:#ff5600;font-size:20px;font-weight:800;flex-shrink:0">ZXC '+a.amount+'</div>';
    container.appendChild(el);
    requestAnimationFrame(function(){el.style.transform='translateY(0)';el.style.opacity='1'});
    setTimeout(function(){el.style.transform='translateY(-10px)';el.style.opacity='0';setTimeout(function(){el.remove()},500)},4000);
  }
  setInterval(function(){showAlert(samples[idx%samples.length]);idx++},7000);
  setTimeout(function(){showAlert(samples[0]);idx++},1000);
})();
</script>` : '';

    const html = `<!DOCTYPE html>
<html style="margin:0;background:transparent;overflow:hidden">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:system-ui,sans-serif">
<div id="alert-container" style="position:fixed;top:80px;left:50%;transform:translateX(-50%);width:90%;max-width:500px;display:flex;flex-direction:column;align-items:center;gap:12px"></div>
${demoScript}
</body></html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("Alerts overlay error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}
