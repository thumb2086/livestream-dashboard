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
(function(){ var msgs=document.getElementById('messages'), max=${maxMessages};
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
    // 2026-10-06：從 /api/v1/chat/messages 改成 /api/v1/overlay-data/chat。
    //
    // 原因：那一支用 session cookie 授權，而 **OBS 的瀏覽器沒有 cookie**
    // （overlay 是用 ?token= 開啟的獨立頁面）。所以它永遠拿不到資料 ——
    // 而症狀是靜默的：回應裡沒有 messages 時直接 return，
    // 使用者只會看到「聊天室一直是空的」。
    //
    // 其他所有 overlay 都已經用 /api/v1/overlay-data/<key>?token=
    // （該端點的註解寫著「Authenticated by the overlay token, not the
    // user session — OBS cannot send cookies」）——
    // **chat 是唯一沒跟上的那一個。**
    //
    // token 寫在 HTML 裡是刻意的：那一頁本身就是用 token 開啟的，
    // 而 token 只授予讀取該 source 的 overlay 資料。
    //
    // ⚠️ 這段註解不能用反引號 —— 整個 <script> 是在 template literal 裡，
    //    反引號會終止字串。那是我第一版的語法錯（tsc 直接報在這行）。
    var url='/api/v1/overlay-data/chat?token='+encodeURIComponent(${JSON.stringify(token)});
    fetch(url).then(function(r){return r.json()}).then(function(d){
      var msgs=(d&&(d.items||d.messages))||[];
      for(var i=0;i<msgs.length;i++){
        var m=msgs[i];
        addMsg(m.userName||m.name||'觀眾', m.message||m.text||'', nc(), m.avatarUrl||'');
      }
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
