// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
//
// 為什麼：Prisma 7 的 query compiler 是 WASM，而 Cloudflare Workers 拒絕
// 它需要的動態 WASM codegen：
//   CompileError: WebAssembly.Module(): Wasm code generation disallowed by embedder
//
// 實測確認換 adapter 繞不過（WASM 在 Prisma core，不在 adapter）。
// 而 @neondatabase/serverless 的 neon() 是 fetch-based，純 JS，原生支援。
//
// 這個路由只有一個查詢，所以整條搬過去的成本很低 ——
// 全專案 118 個 prisma.* 呼叫點是分批搬的議題，不該混在一次部署裡。
import { getOverlaySource } from "@/lib/db-http";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const source = await getOverlaySource(token, "chat");
    if (!source) return new Response("Not Found", { status: 404 });

    const demoMode = source.user.demoMode;
    const s = source.chatSettings;
    const isDark = s?.theme === "dark";
    const isTransparent = s?.theme === "transparent";
    const bg = isDark ? "#000000cc" : isTransparent ? "transparent" : "#ffffffcc";
    const textColor = isDark || isTransparent ? "#ffffff" : "#111111";
    const fontSize = s?.fontSize === "小" ? "12px" : s?.fontSize === "大" ? "18px" : "15px";
    const maxMessages = parseInt((s?.maxMessages || "50").replace(/\D/g, "")) || 50;

    const html = `<!DOCTYPE html>
<html style="margin:0;background:transparent;overflow:hidden">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;font-family:system-ui,sans-serif;font-size:${fontSize};color:${textColor}">
<div id="chat-container" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);width:80%;max-width:800px;max-height:400px;overflow:hidden;background:${bg};border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:0">
<div id="messages" style="overflow:auto;flex:1;scrollbar-width:thin"></div>
</div>
<script>
(function(){ var msgs=document.getElementById('messages'), max=${maxMessages}, lastTime=null;
  function addMsg(u,m,c,p){
    var d=document.createElement('div');
    d.style.cssText='display:flex;gap:8px;align-items:start;padding:4px 0;opacity:0;transition:opacity 0.3s';
    var avatar=p&&p!==''?'<img src="'+p+'" style="width:20px;height:20px;border-radius:50%;flex-shrink:0;margin-top:1px">':'';
    d.innerHTML=avatar+'<strong style="color:'+c+'">'+u+':</strong><span>'+m+'</span>';
    msgs.appendChild(d); requestAnimationFrame(function(){d.style.opacity='1'});
    while(msgs.children.length>max)msgs.removeChild(msgs.firstChild);
    msgs.scrollTop=msgs.scrollHeight;
  }
  var colors=["#a78bfa","#60a5fa","#34d399","#f472b6","#fbbf24"];
  var nc=function(){return colors[Math.floor(Math.random()*colors.length)]};
  function poll(){
    var url='/api/v1/chat/messages'+(lastTime?'?since='+lastTime:'');
    fetch(url).then(function(r){return r.json()}).then(function(d){
      if(!d.messages)return;
      for(var i=0;i<d.messages.length;i++){
        var m=d.messages[i];
        if(m.createdAt>=(lastTime||'')){addMsg(m.userName,m.message,nc(),m.avatarUrl);}
      }
      if(d.messages.length>0)lastTime=d.messages[d.messages.length-1].createdAt;
    }).catch(function(){});
  }
  setInterval(poll,10000);setTimeout(poll,2000);
  ${demoMode ? `
  var demo=setInterval(function(){addMsg(["小明","阿花","直播迷"][Math.floor(Math.random()*3)],["Nice!","加油！","哈哈哈","讚讚"][Math.floor(Math.random()*4)],nc(),"");},8000);
  setTimeout(function(){addMsg("系統","聊天室已連線 — 自動模擬中",nc(),"");},500);` : ''}
})();
</script>
</body></html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("Chat overlay error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}
