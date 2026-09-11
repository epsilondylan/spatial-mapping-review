import {get,el} from './evidence.js';
const $=s=>document.querySelector(s),names={qwen:'Qwen 3.8 · 27B',gemma:'Gemma 4 · 31B',flash:'Gemini 3.8 Flash',astra:'GPT‑6 Astra',luna:'GPT‑5.6 Luna'},colors={qwen:'#4166c3',gemma:'#bd6e32',flash:'#219678',astra:'#9562b6',luna:'#cf527d'},labels={COMPLETE:'已结束',RUNNING:'运行中',STARTING:'启动中',FAILED:'中断（保留结果）'};
let index,runs=[],version=0;
const fmt=x=>typeof x==='number'?x.toFixed(3):'—';
function chart(){
 const metric=$('#compare-metric').value,ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 1050 360');svg.setAttribute('xmlns',ns);svg.setAttribute('role','img');svg.setAttribute('aria-label','自主探索检查点指标曲线');
 const draw=(tag,attrs,text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n);return n};
 const all=runs.flatMap(r=>(r.checkpoints||[]).filter(c=>c.valid&&typeof c.metrics?.[metric]==='number'));const ymax=metric==='diag_ungated_position_median'?Math.max(1,...all.map(c=>c.metrics[metric]))*1.1:1;
 const X=x=>65+x/200*945,Y=y=>305-y/ymax*260;
 for(let i=0;i<=5;i++){const v=ymax*i/5;draw('line',{x1:65,x2:1010,y1:Y(v),y2:Y(v),stroke:'#e3e8ef'});draw('text',{x:52,y:Y(v)+4,'text-anchor':'end','font-size':11,fill:'#68778b'},v.toFixed(2))}
 for(const b of [20,40,60,80,100,120,150,200])draw('text',{x:X(b),y:328,'text-anchor':'middle','font-size':11,fill:'#68778b'},b);
 draw('text',{x:500,y:350,'font-size':12,fill:'#68778b'},'分配观察帧预算');
 for(const r of runs){const points=(r.checkpoints||[]).filter(c=>c.valid&&typeof c.metrics?.[metric]==='number').sort((a,b)=>a.budget-b.budget);if(!points.length)continue;const color=colors[r.model]||'#444';draw('polyline',{points:points.map(c=>`${X(c.budget)},${Y(c.metrics[metric])}`).join(' '),fill:'none',stroke:color,'stroke-width':2});
  for(const c of points){const dot=draw('circle',{cx:X(c.budget),cy:Y(c.metrics[metric]),r:5,fill:c.meta.early_stop?'white':color,stroke:color,'stroke-width':2});const title=document.createElementNS(ns,'title');title.textContent=`${names[r.model]} · 预算 ${c.budget} / 实际 ${c.meta.actual_frames} · ${fmt(c.metrics[metric])}`;dot.append(title)}
 }
 if(!all.length)draw('text',{x:400,y:170,'font-size':16,fill:'#738094'},'尚无完成的检查点');$('#compare-chart').replaceChildren(svg);
}
async function render(){
 const token=++version,c=index.cases.find(c=>c.id===$('#compare-scene').value);if(!c)return;const loaded=await Promise.all(c.runs.map(r=>get(r.manifest)));if(token!==version)return;runs=loaded;const box=$('#compare-rows');box.replaceChildren();$('#compare-legend').replaceChildren();
 for(const r of runs){const legend=el('span');legend.append(el('i','legend-dot legend-'+r.model),document.createTextNode(names[r.model]||r.model));$('#compare-legend').append(legend);
  const cps=r.checkpoints?.length?r.checkpoints:[null];for(const cp of cps){const tr=el('tr'),title=el('td','',names[r.model]||r.model);title.append(el('small','',['astra','luna'].includes(r.model)?'Codex · 最近8图':'Claude Code · 最近8图'));tr.append(title);
   for(const text of [labels[r.status]||r.status,r.frames.length,cp?cp.budget:'等待检查点',cp?(String(cp.meta.actual_frames)+(cp.meta.early_stop?'（沿用）':'')):'—',fmt(cp?.metrics?.object_f1),fmt(cp?.metrics?.pair_recall),fmt(cp?.metrics?.diag_ungated_position_median)])tr.append(el('td','',String(text)));
   const td=el('td'),a=el('a','','完整对话 ↗');a.href='/chat.html?'+new URLSearchParams({run:r.id});td.append(a);tr.append(td);box.append(tr);
  }
 }
 chart();history.replaceState(null,'','#'+new URLSearchParams({case:c.id}));
}
$('#compare-scene').onchange=()=>render().catch(e=>$('#compare-chart').textContent=e.message);$('#compare-metric').onchange=chart;$('#save-chart').onclick=()=>{const svg=$('#compare-chart svg');if(!svg)return;const u=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));const a=el('a');a.href=u;a.download=$('#compare-scene').value+'-'+$('#compare-metric').value+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(u),5000)};
try{index=await get('/data/index.json');$('#compare-snapshot').textContent='快照 '+new Date(index.snapshot_at).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false});for(const c of index.cases.filter(c=>c.kind==='active')){const o=el('option','',c.title);o.value=c.id;$('#compare-scene').append(o)}const id=new URLSearchParams(location.hash.slice(1)).get('case');if(index.cases.some(c=>c.kind==='active'&&c.id===id))$('#compare-scene').value=id;await render()}catch(e){$('#compare-chart').textContent='载入失败：'+e.message}
