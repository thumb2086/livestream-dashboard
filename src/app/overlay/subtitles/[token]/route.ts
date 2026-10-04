import { prisma } from "@/lib/prisma";
import { getSubtitleSettings } from "@/lib/subtitle-config";

export const dynamic = "force-dynamic";

const FONT_MAP: Record<string, string> = {
  "小 (18px)": "18px", "中 (24px)": "24px", "大 (32px)": "32px", "特大 (40px)": "40px",
};

const POSITION_CLASS: Record<string, string> = {
  "底部置中": "pos-center",
  "頂部置中": "pos-top",
  "底部靠左": "pos-left",
};

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const source = await prisma.oBSSource.findFirst({
      where: { token, sourceKey: "captions" },
      include: { user: true },
    });
    if (!source || !source.enabled) return new Response("Not Found", { status: 404 });

    const user = source.user;
    const s = await getSubtitleSettings(user.id);
    const demoMode = user.demoMode;
    const fontSize = FONT_MAP[s.fontSize] || "24px";
    const textColor = s.textColor;
    const bgColor = s.bgColor;
    const pos = POSITION_CLASS[s.position] || "pos-center";

    const html = `<!DOCTYPE html>
<html style="margin:0;background:transparent;overflow:hidden">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;overflow:hidden;background:transparent}
#stage{position:fixed;width:min(92%,960px);padding:16px 22px;border-radius:20px;background:linear-gradient(180deg,${bgColor},${bgColor});border:1px solid rgba(255,255,255,0.1);box-shadow:0 12px 40px rgba(0,0,0,0.35);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);transition:opacity 0.3s,transform 0.3s;opacity:0;transform:translateY(12px)}
#stage.show{opacity:1;transform:translateY(0)}
#stage.pos-center{bottom:50px;left:50%;transform:translateX(-50%);text-align:center}
#stage.pos-center.show{transform:translateX(-50%)}
#stage.pos-top{top:50px;left:50%;transform:translateX(-50%);text-align:center}
#stage.pos-top.show{transform:translateX(-50%)}
#stage.pos-left{bottom:50px;left:20px;text-align:left}
.entry{display:grid;gap:6px;min-width:0;padding:6px 0;transition:opacity 0.3s}
.entry .badge{display:inline-flex;align-items:center;min-height:22px;padding:0 10px;border-radius:999px;background:rgba(255,255,255,0.08);color:${textColor};font-size:11px;font-weight:700;letter-spacing:0.04em;width:fit-content;text-transform:uppercase}
.pos-center .entry .badge{margin:0 auto}
.entry .body{color:${textColor};font-size:${fontSize};font-weight:800;line-height:1.35;letter-spacing:0.01em;text-shadow:0 2px 10px rgba(0,0,0,0.3);overflow-wrap:anywhere}
.entry.is-partial .body{font-style:italic;opacity:0.65}
.entry.is-partial{border-left:3px solid ${textColor}44;padding-left:10px}
.pos-center .entry.is-partial{border-left:none;border-bottom:3px solid ${textColor}44;padding-left:0;padding-bottom:8px}
.entry.dim{opacity:0.4}
.entry.dim .body{font-size:calc(${fontSize} * 0.75)}
</style>
</head>
<body>
<div id="stage" class="${pos}"><div id="entries"></div></div>
<script>
(function(){
  var stage=document.getElementById('stage'), box=document.getElementById('entries');
  var segments=[], maxSegs=4;

  function esc(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML;}

  function render(){
    if(segments.length===0){stage.classList.remove('show');return;}
    var html='';
    for(var i=0;i<segments.length;i++){
      var seg=segments[i];
      var lineCls='entry'+(seg.status==='partial'?' is-partial':' is-final')+(i<segments.length-1?' dim':'');
      html+='<div class="'+lineCls+'">';
      if(seg.speaker) html+='<span class="badge">'+esc(seg.speaker)+'</span>';
      html+='<div class="body">'+esc(seg.text)+'</div></div>';
    }
    box.innerHTML=html;
    stage.classList.add('show');
  }

  function addSegment(seg){
    // Replace partial with same seq, or append
    if(seg.status==='partial'){
      var idx=segments.findIndex(function(s){return s.status==='partial'||s.seq===seg.seq});
      if(idx>=0){segments[idx]=seg;}else{segments.push(seg);}
    }else{
      // Remove partials with same or higher seq, add final
      segments=segments.filter(function(s){return s.status==='final'&&s.seq<seg.seq});
      segments.push(seg);
    }
    if(segments.length>maxSegs)segments=segments.slice(segments.length-maxSegs);
    render();
  }

  // SSE connection
  var es=new EventSource('/api/v1/captions/stream?token=${token}');
  es.addEventListener('segment',function(e){
    try{addSegment(JSON.parse(e.data));}catch(ex){}
  });
  es.addEventListener('connected',function(){console.log('SSE connected');});

  // Fallback polling
  var lastTime=null;
  function poll(){
    fetch('/api/v1/captions/segments?token=${token}'+(lastTime?'&since='+encodeURIComponent(lastTime):''))
      .then(function(r){return r.json()}).then(function(d){
        if(d.segments&&d.segments.length>0){
          for(var i=d.segments.length-1;i>=0;i--){addSegment(d.segments[i]);}
          lastTime=d.segments[0].createdAt;
        }
      }).catch(function(){});
  }
  setTimeout(poll,2000);
  setInterval(poll,10000);

  // Demo mode
  ${demoMode ? `
  var demos=[
    {seq:1,text:"大家好，歡迎來到直播間！",speaker:"實況主",status:"final"},
    {seq:2,text:"今天要來挑戰最難關卡 💪",speaker:"實況主",status:"final"},
    {seq:3,text:"感謝大家的斗內支援 🙏",speaker:"",status:"final"},
    {seq:4,text:"等等來抽獎，別走開！",speaker:"實況主",status:"final"},
  ];
  var di=0;
  setInterval(function(){addSegment(demos[di%demos.length]);di++;},5000);
  setTimeout(function(){addSegment({seq:0,text:"🎙️ 字幕已連線",speaker:"",status:"final"});},800);` : ''}
})();
</script>
</body></html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("Subtitles overlay error:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
}
