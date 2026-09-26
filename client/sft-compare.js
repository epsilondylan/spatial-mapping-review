import {get, el, code, detail} from './evidence.js';
import {evidenceImage, setImageSource, assetURL} from './media.js';
import {conversationWindow} from './transcript.js';

const $ = selector => document.querySelector(selector);
const hash = new URLSearchParams(location.hash.slice(1));
const state = {index:null, pair:null, scene:hash.get('case'), mode:hash.get('mode')==='reader'?'reader':'e2e', view:['chat','final'].includes(hash.get('view'))?hash.get('view'):'map', steps:{base:Math.max(1,+hash.get('base')||1),sft:Math.max(1,+hash.get('sft')||1)}, sync:hash.get('sync')!=='0', filter:hash.get('filter')||'all', sort:hash.get('sort')||'scene', token:0};
let timer;
const pct = value => (100*value).toFixed(1);
const finite = value => value!==null && value!==undefined && Number.isFinite(Number(value));
const objectPoints = prediction => (prediction?.objects||[]).filter(o=>finite(o.x)&&finite(o.y)).map(o=>({...o,x:+o.x,y:+o.y}));
const errorBox = (box,message,retry) => {box.replaceChildren(el('div','error',message));if(retry){const b=el('button','','重试载入');b.onclick=retry;box.append(b)}};

function saveURL(){
  const h=new URLSearchParams({case:state.scene,mode:state.mode,view:state.view,base:state.steps.base,sft:state.steps.sft,sync:state.sync?'1':'0',filter:state.filter,sort:state.sort});
  history.replaceState(null,'','#'+h);
}
function filteredCases(){
  return state.index.cases.filter(c=>{
    const m=c.modes[state.mode];
    return state.filter==='improved'?m.sft>m.base+1e-9:state.filter==='regressed'?m.sft<m.base-1e-9:state.filter==='failed'?[m.base_status,m.sft_status].includes('FAILED'):state.filter==='occlusion'?c.split?.includes('occlusion'):true;
  }).sort((a,b)=>state.sort==='gain'?(b.modes[state.mode].sft-b.modes[state.mode].base)-(a.modes[state.mode].sft-a.modes[state.mode].base):state.sort==='loss'?(a.modes[state.mode].sft-a.modes[state.mode].base)-(b.modes[state.mode].sft-b.modes[state.mode].base):a.id.localeCompare(b.id));
}
function listCases(){
  const cases=filteredCases();$('#case').replaceChildren();
  for(const c of cases){const m=c.modes[state.mode],o=el('option','',`${c.id} · ${pct(m.base)} → ${pct(m.sft)}${c.split?.includes('occlusion')?' · 遮挡':''}`);o.value=c.id;$('#case').append(o)}
  if(!cases.some(c=>c.id===state.scene))state.scene=cases[0]?.id;
  $('#case').value=state.scene||'';const i=cases.findIndex(c=>c.id===state.scene);
  $('#prev-case').disabled=i<=0;$('#next-case').disabled=i<0||i===cases.length-1;
}
function refreshCohort(){
  const rows=state.index.cases.map(c=>c.modes[state.mode]);
  const base=rows.reduce((s,r)=>s+r.base,0)/rows.length,sft=rows.reduce((s,r)=>s+r.sft,0)/rows.length;
  $('#cohort').replaceChildren(el('span','',`全部 ${rows.length} 世界 · F1@0.75m（%）`),el('strong','',`${pct(base)} → ${pct(sft)}`),el('span','',`配对均值 +${pct(sft-base)} 分 · 失败保留计 0`));
}
async function loadPair(){
  stopPlay();const token=++state.token;listCases();refreshCohort();state.pair=null;
  if(!state.scene){$('#panels').replaceChildren(el('p','empty','该筛选下没有案例。'));$('#case-summary').replaceChildren();$('#timeline').hidden=true;return}
  saveURL();$('#panels').replaceChildren(el('div','loading','正在载入两条轨迹…'));
  try{
    const c=state.index.cases.find(c=>c.id===state.scene),pair=await get(c.modes[state.mode].url);
    if(token!==state.token)return;state.pair=pair;
    const delta=pair.runs.sft.f1-pair.runs.base.f1;
    $('#case-summary').replaceChildren(el('strong','',state.scene),el('span','chip',c.split?.includes('occlusion')?'物理遮挡':'普通场景'),el('span','chip',c.family||'独立世界'),el('span',`chip ${delta>0?'positive':delta<0?'negative':''}`,`SFT − Base：${delta>0?'+':''}${pct(delta)} 分`));
    $('#mode-note').textContent=state.mode==='reader'?'两边读取完全相同的 16 张固定扫描图；转向由采集脚本执行，不代表模型的自主行动。':'两边从同一世界、同一起始相机出发，自主选择观察和移动；获得的图像与调用次数可能不同。';
    await render();
  }catch(e){if(token===state.token)errorBox($('#panels'),'配对记录加载失败：'+e.message,loadPair)}
}

function svgNode(tag,attrs,text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs||{}))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n}
function bounds(pair,final){
  const all=[{x:0,y:0},...objectPoints(pair.gt),...pair.rooms.flat().map(p=>({x:p[0],y:p[1]})),...Object.values(pair.runs).flatMap(r=>r.frames.map(f=>({x:f.xy[0],y:f.xy[1]}))),...(final?Object.values(pair.runs).flatMap(r=>objectPoints(r.prediction)):[])];
  return {xmin:Math.min(...all.map(p=>p.x))-.6,xmax:Math.max(...all.map(p=>p.x))+.6,ymin:Math.min(...all.map(p=>p.y))-.6,ymax:Math.max(...all.map(p=>p.y))+.6};
}
function drawMap(arm,frameCount,final=false){
  const pair=state.pair,run=pair.runs[arm],b=bounds(pair,final),W=580,H=410,pad=38;
  const scale=Math.min((W-pad*2)/(b.xmax-b.xmin),(H-pad*2)/(b.ymax-b.ymin));
  const ox=(W-(b.xmax-b.xmin)*scale)/2,oy=(H-(b.ymax-b.ymin)*scale)/2;
  const X=x=>ox+(x-b.xmin)*scale,Y=y=>H-oy-(y-b.ymin)*scale;
  const svg=svgNode('svg',{viewBox:`0 0 ${W} ${H}`,class:'map',role:'img','aria-label':`${arm==='base'?'微调前':'微调后'}同尺度俯视行动地图`});
  const draw=(tag,attrs,text)=>{const n=svgNode(tag,attrs,text);svg.append(n);return n};
  const step=Math.max(1,Math.ceil(Math.max(b.xmax-b.xmin,b.ymax-b.ymin)/10));
  for(let x=Math.ceil(b.xmin/step)*step;x<=b.xmax;x+=step){draw('line',{x1:X(x),x2:X(x),y1:oy,y2:H-oy,stroke:'#e5eaf1'});draw('text',{x:X(x),y:H-10,'text-anchor':'middle','font-size':11,fill:'#8190a3'},x)}
  for(let y=Math.ceil(b.ymin/step)*step;y<=b.ymax;y+=step){draw('line',{x1:ox,x2:W-ox,y1:Y(y),y2:Y(y),stroke:'#e5eaf1'});draw('text',{x:8,y:Y(y)+4,'font-size':11,fill:'#8190a3'},y)}
  for(const room of pair.rooms)draw('polygon',{points:room.map(p=>`${X(p[0])},${Y(p[1])}`).join(' '),fill:'#dfe7f21f',stroke:'#97a6ba','stroke-width':2});
  for(const o of objectPoints(pair.gt)){
    draw('path',{d:`M${X(o.x)} ${Y(o.y)-5}l5 5 -5 5 -5 -5Z`,fill:'#d59436'});
    draw('text',{x:X(o.x)+7,y:Y(o.y)+13,'font-size':10,fill:'#98641e'},o.category);
  }
  const frames=run.frames.slice(0,frameCount),color=arm==='base'?'#4069aa':'#00836f';
  if(frames.length>1)draw('polyline',{points:frames.map(f=>`${X(f.xy[0])},${Y(f.xy[1])}`).join(' '),fill:'none',stroke:color,'stroke-width':3,'stroke-linejoin':'round'});
  for(const f of frames){const n=draw('circle',{cx:X(f.xy[0]),cy:Y(f.xy[1]),r:4,fill:color,stroke:'white','stroke-width':1,class:'map-point',tabindex:0,role:'button','aria-label':`查看第 ${f.id} 帧`});n.append(svgNode('title',{},`帧 ${f.id} · ${f.receipt.status}`));const jump=()=>{stopPlay();state.view='map';setStep(arm,f.id)};n.onclick=jump;n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();jump()}}}
  const current=frames.at(-1);
  if(current){const angle=current.heading*Math.PI/180,x=current.xy[0],y=current.xy[1];draw('line',{x1:X(x),y1:Y(y),x2:X(x+.65*Math.sin(angle)),y2:Y(y+.65*Math.cos(angle)),stroke:color,'stroke-width':4});draw('circle',{cx:X(x),cy:Y(y),r:6,fill:color,stroke:'white','stroke-width':2});draw('text',{x:X(x)+8,y:Y(y)-10,'font-size':12,fill:color},`帧 ${current.id}`)}
  draw('text',{x:X(0)+7,y:Y(0)+17,'font-size':11,fill:'#50627a'},'起点');
  if(final){
    const predicted=objectPoints(run.prediction);
    for(const o of predicted){draw('circle',{cx:X(o.x),cy:Y(o.y),r:5,fill:'#9c62ba',stroke:'white','stroke-width':1});draw('text',{x:X(o.x)+7,y:Y(o.y)-7,'font-size':10,fill:'#845099'},o.category)}
  }
  draw('text',{x:W-12,y:18,'text-anchor':'end','font-size':11,fill:'#71839a'},'初始相机坐标 · 米 · 两边同尺度');
  return svg;
}

function openImage(url){setImageSource($('#large-image'),url);$('#image-dialog').showModal()}
function header(arm){
  const r=state.pair.runs[arm],box=el('section',`arm ${arm}`),head=el('div','arm-head'),name=el('div');
  name.append(el('h2','',arm==='base'?'微调前 · Base':'微调后 · SFT'),el('p','',r.model||r.arm));
  const score=el('div','score',pct(r.f1));score.append(el('small','','最终 F1@0.75m / %'));head.append(name,score);
  const stats=el('div','run-stats');stats.append(el('span',r.status==='FAILED'?'status-failed':'',r.status==='FAILED'?'失败 · 原协议计 0':'运行完成'),el('span','',`${r.frames.length} 观察帧`),el('span','',`${r.calls.length} 模型调用`));box.append(head,stats);
  const outcome=el('div','outcome'+(r.error?' failed':''),r.error?(String(r.error).includes('truncated')?'输出截断 / 未正常结束':String(r.error).includes('readout_budget')?'建图预算耗尽，未提交有效地图':'运行失败，原始原因见评分明细'):'运行已完成，完整原始记录可逐步查看');if(r.error)outcome.title=String(r.error);box.append(outcome);
  return box;
}
function navigation(box,arm){
  const r=state.pair.runs[arm],items=state.view==='chat'?r.calls:r.frames,label=el('label','arm-nav',state.view==='chat'?'模型调用':'观察帧'),select=el('select');select.setAttribute('aria-label',`${arm} ${state.view==='chat'?'模型调用':'观察帧'}`);
  items.forEach((item,i)=>{const o=el('option','',state.view==='chat'?`${i+1} · ${item.phase==='acquire'?'探索':'建图'} · ${item.operation||item.finish_reason||item.id}`:`第 ${item.id} 帧 · ${item.receipt.status}`);o.value=i+1;select.append(o)});
  select.value=String(Math.min(state.steps[arm],items.length));select.disabled=!items.length;
  select.onchange=()=>{stopPlay();setStep(arm,+select.value)};label.append(select);box.append(label);
  const ended=el('div','step-state',state.steps[arm]>items.length&&items.length?`这边已到末尾（${items.length} ${state.view==='chat'?'次调用':'帧'}），保留最后一条。`:`${state.view==='chat'?'输入、回答按实际调用顺序':'路径仅展示当前帧及此前观察'}`);box.append(ended);
}
function mapPanel(box,arm){
  const r=state.pair.runs[arm];navigation(box,arm);const n=Math.min(state.steps[arm],r.frames.length),f=r.frames[n-1];
  if(f){const figure=el('figure','observation');figure.append(evidenceImage(f.image,{eager:true,onOpen:openImage}),el('figcaption','',`观察帧 ${f.id} / ${r.frames.length} · 点击查看原图`));box.append(figure);
    const a=f.receipt.requested_action||{},receipt=el('div','receipt');receipt.append(el('strong','',`转向 ${a.turn_deg??'—'}° · 请求移动 ${a.move_m??'—'} m`),el('div','',`实际回执：${f.receipt.status} · 离线位置 (${f.xy[0].toFixed(2)}, ${f.xy[1].toFixed(2)}) m · 朝向 ${f.heading.toFixed(1)}°`));box.append(receipt);
  }else box.append(el('div','empty','没有保存的观察帧。'));
  box.append(el('div','map-heading',`截至当前帧的${state.mode==='reader'?'脚本扫描':'实际行动'}路径`),drawMap(arm,n));legend(box,false);
}
function legend(box,final){const legend=el('div','legend');legend.append(el('span','base','Base 路径'),el('span','sft','SFT 路径'),el('span','gt','离线 GT'));if(final)legend.append(el('span','prediction','最终预测'));box.append(legend)}
function finalPanel(box,arm){const r=state.pair.runs[arm];box.append(drawMap(arm,r.frames.length,true));legend(box,true);
  box.append(el('p','note','完整实际路径与最终预测；两边共用坐标范围。没有平移、旋转或缩放对齐。'));
  if(r.status==='FAILED')box.append(el('div','ended','该运行失败，计分为 0；若保存了部分预测，仅作为诊断展示。'));
  const metrics=r.metrics||{};box.append(detail('保存的官方评分明细',metrics),detail('模型最终地图（完整 JSON）',r.prediction||'没有保存的地图'));
}
function message(m,label){
  const box=el('article',`message ${m.role==='assistant'?'assistant':''}`);box.append(el('div','role',label));
  if(typeof m.content==='string')box.append(code(m.content));
  else for(const b of m.content||[]){if(b.type==='text')box.append(code(b.text));else if(b.type==='image_url')box.append(evidenceImage(b.image_url.url,{onOpen:openImage}));else box.append(code(b))}
  for(const[k,v]of Object.entries(m))if(!['role','content'].includes(k)&&v!=null)box.append(detail(k,v));
  return box;
}
async function chatPanel(box,arm,token){
  const r=state.pair.runs[arm];navigation(box,arm);const i=Math.min(state.steps[arm],r.calls.length)-1,c=r.calls[i];
  if(!c){box.append(el('div','empty','没有保存的模型调用。'));return}
  const jumpbar=el('div','chat-jumps'),inputButton=el('button','','回到输入 ↑'),replyButton=el('button','','本次完整回答 ↓');jumpbar.append(inputButton,replyButton);box.append(jumpbar);const content=el('div','conversation');box.append(content);inputButton.onclick=()=>content.scrollTo({top:0,behavior:'smooth'});replyButton.onclick=()=>{const reply=content.querySelector('.current-reply');if(reply)content.scrollTo({top:reply.offsetTop-content.offsetTop,behavior:'smooth'})};content.append(el('div','loading','正在还原真实输入与输出…'));
  try{
    const [d,previous]=await Promise.all([get(c.url),i?get(r.calls[i-1].url):Promise.resolve(null)]);
    if(token!==state.token)return;content.replaceChildren();
    const req=d.request,messages=req.messages||[],window=conversationWindow(messages,previous?.request?.messages||[]);
    content.append(el('p','chat-meta',`${c.id} · ${messages.length} 条实际输入消息 · ${c.images.length} 张图像 · finish_reason: ${d.meta.finish_reason||'未报告'}`));
    if(d.meta.status!=='COMPLETE')content.append(el('div','ended','此调用未正常完成：'+(d.meta.error||d.meta.status||'状态未报告')+'。原始输出仍完整保留。'));
    const settings=detail('真实请求设置',Object.fromEntries(Object.entries(req).filter(([k])=>k!=='messages')));settings.classList.add('raw');content.append(settings);
    if(window.history.length){const history=el('details','history');history.append(el('summary','',`重发的历史 / 系统上下文 · ${window.history.length} 条（展开全部）`));history.addEventListener('toggle',()=>{if(history.open&&!history.dataset.loaded){history.dataset.loaded='1';window.history.forEach(j=>history.append(message(messages[j],`${messages[j].role} · 历史输入 ${j+1}`)))}});content.append(history)}
    window.visible.forEach(j=>{if(messages[j].role==='system'){const system=el('details','history');system.append(el('summary','','本次系统指令（完整原文）'),message(messages[j],`system · 真实输入 ${j+1}`));content.append(system)}else content.append(message(messages[j],`${messages[j].role} · 真实输入 ${j+1}`))});
    const reply=message({role:'assistant',content:d.answer||'（服务未返回正文）'},'assistant · 本次实际返回的完整正文');
    reply.classList.add('current-reply');if(d.reasoning){const reasoning=detail('接口保存的 reasoning 正文',d.reasoning);reasoning.classList.add('raw');reply.prepend(reasoning)}
    content.append(reply,el('p','chat-meta',`输出 ${d.meta.usage?.completion_tokens??'未报告'} tokens · ${(d.meta.seconds||0).toFixed(2)} 秒 · 未补写任何隐藏思考`));
    const download=el('a','download','下载完整请求与回答 ↓');download.href=assetURL(c.url+'.gz');download.download='';content.append(download);
    const raw=detail('完整记录 / 请求 SHA256',d);raw.classList.add('raw');content.append(raw);
  }catch(e){if(token===state.token)errorBox(content,e.message,()=>chatPanel(box,arm,token))}
}
function maxStep(){return state.pair?Math.max(1,...Object.values(state.pair.runs).map(r=>state.view==='chat'?r.calls.length:r.frames.length)):1}
function setStep(arm,n){const value=Math.max(1,Math.min(maxStep(),n));state.steps[arm]=value;if(state.sync)state.steps[arm==='base'?'sft':'base']=value;render()}
async function render(){
  if(!state.pair)return;const token=++state.token,max=maxStep();
  for(const arm of ['base','sft'])state.steps[arm]=Math.min(state.steps[arm],max);
  saveURL();$('.sync').hidden=state.view==='final';$('#timeline').hidden=state.view==='final';
  // Explicit style avoids display:flex overriding the native hidden attribute.
  $('#timeline').style.display=state.view==='final'?'none':'flex';
  $('#step').max=max;$('#step').value=state.steps.base;$('#step').setAttribute('aria-label',state.view==='chat'?'同步模型调用':'同步观察帧');
  $('#step-label').textContent=`${state.view==='chat'?'调用':'观察帧'} ${state.steps.base} / ${max}`;
  $('#prev-step').disabled=state.steps.base<=1;$('#next-step').disabled=state.steps.base>=max;
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.view===state.view)));
  $('#alignment-note').textContent=state.view==='final'?'最终输出使用各自完整观察历史。地图上的 GT 仅用于离线审阅。':state.view==='chat'?'同步的是调用序号，不保证两边处于相同阶段。输入与完整回答按原记录显示，重发历史可展开。':'同步的是观察帧号，不代表相同位置或相同行动。关闭同步后可以分别选帧；点击地图路径点也可跳转。';
  const panels=$('#panels');panels.replaceChildren();const pending=[];
  for(const arm of ['base','sft']){const box=header(arm);panels.append(box);if(state.view==='chat')pending.push(chatPanel(box,arm,token));else if(state.view==='final')finalPanel(box,arm);else mapPanel(box,arm)}
  await Promise.all(pending);
}
function stopPlay(){clearInterval(timer);timer=null;$('#play').textContent='播放'}
$('#play').onclick=()=>{if(timer){stopPlay();return}if(state.steps.base>=maxStep())setStep('base',1);$('#play').textContent='暂停';timer=setInterval(()=>{if(state.steps.base>=maxStep()){stopPlay();return}setStep('base',state.steps.base+1)},state.view==='chat'?3000:1000)};
$('#step').oninput=()=>{stopPlay();setStep('base',+$('#step').value)};
$('#prev-step').onclick=()=>{stopPlay();setStep('base',state.steps.base-1)};
$('#next-step').onclick=()=>{stopPlay();setStep('base',state.steps.base+1)};
$('#sync').checked=state.sync;$('#sync').onchange=()=>{stopPlay();state.sync=$('#sync').checked;if(state.sync)state.steps.sft=state.steps.base;render()};
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{stopPlay();state.view=button.dataset.view;render()});
$('#mode').value=state.mode;$('#mode').onchange=()=>{state.mode=$('#mode').value;state.steps={base:1,sft:1};loadPair()};
for(const name of ['filter','sort']){$('#'+name).value=state[name];if(!$('#'+name).value){state[name]=name==='filter'?'all':'scene';$('#'+name).value=state[name]}$('#'+name).onchange=()=>{state[name]=$('#'+name).value;loadPair()}}
$('#case').onchange=()=>{state.scene=$('#case').value;state.steps={base:1,sft:1};loadPair()};
for(const [id,delta]of [['prev-case',-1],['next-case',1]])$('#'+id).onclick=()=>{const list=filteredCases(),i=list.findIndex(c=>c.id===state.scene);state.scene=list[i+delta]?.id||state.scene;state.steps={base:1,sft:1};loadPair()};
$('#close-image').onclick=()=>$('#image-dialog').close();
$('#copy-link').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('#toast').textContent='已复制当前案例、视图与步骤链接'}catch{$('#toast').textContent='请复制地址栏中的当前对比链接'}$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',2500)};
document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA','BUTTON'].includes(e.target.tagName)||$('#image-dialog').open)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();stopPlay();setStep('base',state.steps.base+(e.key==='ArrowRight'?1:-1))}});
async function init(){try{state.index=await get('/sft-data/index.json');await loadPair()}catch(e){errorBox($('#panels'),e.message,init)}}
init();
