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

    // Fetch real confirmed donations
    const recentDonations = await prisma.zixiDonation.findMany({
      where: { userId: source.user.id, status: "confirmed" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const donationsJson = JSON.stringify(recentDonations.map(d => ({
      name: d.donorAddress ? `${d.donorAddress.slice(0,4)}...${d.donorAddress.slice(-4)}` : "匿名",
      amount: d.amount,
      token: d.token,
      msg: d.message || "感謝贊助！",
    })));

    const obsToken = token;
    const html = `<!DOCTYPE html>
<html style="margin:0;background:transparent;overflow:hidden">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;font-family:system-ui,sans-serif">
<div id="alert-container" style="position:fixed;top:80px;left:50%;transform:translateX(-50%);width:90%;max-width:500px;display:flex;flex-direction:column;align-items:center;gap:12px"></div>
<script>
(function(){ var container=document.getElementById('alert-container'), idx=0;
  var donations=${donationsJson};
  var demoMode=${demoMode};
  var obsToken="${obsToken}";
  var apiBase=window.location.origin;
  function showAlert(a){
    var el=document.createElement('div');
    el.style.cssText='display:flex;align-items:center;gap:14px;background:rgba(0,0,0,0.85);border-radius:16px;padding:16px 24px;min-width:320px;transform:translateY(20px);opacity:0;transition:all 0.5s ease;border:1px solid rgba(255,86,0,0.3)';
    el.innerHTML='<div style="width:44px;height:44px;border-radius:50%;background:#ff5600;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:bold;color:#fff;flex-shrink:0">'+a.name.charAt(0)+'</div><div style="flex:1;min-width:0"><div style="color:#fff;font-size:15px;font-weight:600">'+a.name+'</div><div style="color:rgba(255,255,255,0.6);font-size:13px">'+a.msg+'</div></div><div style="color:#ff5600;font-size:20px;font-weight:800;flex-shrink:0">'+a.amount+' '+a.token+'</div>';
    container.appendChild(el);
    requestAnimationFrame(function(){el.style.transform='translateY(0)';el.style.opacity='1'});
    setTimeout(function(){el.style.transform='translateY(-10px)';el.style.opacity='0';setTimeout(function(){el.remove()},500)},4000);
  }
  // Show real donations first
  function showNext(){ if(idx<donations.length){ showAlert(donations[idx]); idx++; } }
  showNext();
  setInterval(function(){
    fetch(apiBase+'/api/v1/zixi-donations?status=confirmed&token='+obsToken)
      .then(function(r){return r.json()}).then(function(d){
        if(d.donations&&d.donations.length>donations.length){
          for(var i=donations.length;i<d.donations.length;i++){
            var dd=d.donations[i];
            showAlert({name:dd.donorAddress?dd.donorAddress.slice(0,4)+'...'+dd.donorAddress.slice(-4):'匿名',amount:dd.amount,token:dd.token,msg:dd.message||'感謝贊助！'});
          }
          donations=d.donations;
        }
      }).catch(function(){});
  },15000);
  ${demoMode ? `
  var samples=[{name:"小美",amount:300,token:"ZXC",msg:"加油！最喜歡你的台了 💖"},{name:"匿名贊助",amount:1000,token:"ZXC",msg:"繼續努力！"},{name:"直播迷",amount:200,token:"ZXC",msg:"好看！"}];
  setTimeout(function(){setInterval(function(){showAlert(samples[Math.floor(Math.random()*samples.length)]);},7000);},5000);` : ''}
})();
</script>
</body></html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("Alerts overlay error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}
