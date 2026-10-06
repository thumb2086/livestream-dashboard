import { getOverlaySource } from "@/lib/db-http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const source = await getOverlaySource(token, "channel-stats");
    if (!source) return new Response("Not Found", { status: 404 });

    const user = source.user;
    const demoMode = user.demoMode;
    console.error("Stats overlay demoMode:", demoMode);

    const html = `<!DOCTYPE html>
<html style="margin:0;background:transparent;overflow:hidden">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;font-family:system-ui,sans-serif">
<div id="root" style="position:fixed;bottom:30px;right:30px;background:rgba(0,0,0,0.8);border-radius:14px;padding:12px 18px;min-width:220px;border:1px solid rgba(255,255,255,0.1);display:flex;gap:20px">
<div style="text-align:center;min-width:80px">
<div style="color:rgba(255,255,255,0.4);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Twitch</div>
<div id="twitch-count" style="color:#9146ff;font-size:22px;font-weight:700">${user.followers}</div>
</div>
<div style="width:1px;background:rgba(255,255,255,0.1)"></div>
<div style="text-align:center;min-width:80px">
<div style="color:rgba(255,255,255,0.4);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">YouTube</div>
<div id="yt-count" style="color:#ff0033;font-size:22px;font-weight:700">${user.followers}</div>
</div>
</div>
<script>
(function(){
  function update(){
    var url=window.location.href;
    fetch(url,{headers:{Accept:'text/html'}}).then(function(r){return r.text()}).then(function(html){
      var root=document.getElementById('root');
      if(root){root.innerHTML=html.match(/<div id="root">([\\s\\S]*?)<\\/div>/)?.[1]||root.innerHTML}
    }).catch(function(){});
  }
  update();
  setInterval(update,30000);
  ${demoMode ? `
  var demo=setInterval(function(){
    var t=document.getElementById('twitch-count');
    var y=document.getElementById('yt-count');
    if(t)t.textContent=Math.floor(Math.random()*5000)+500;
    if(y)y.textContent=Math.floor(Math.random()*3000)+300;
  },5000);` : ''}
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
