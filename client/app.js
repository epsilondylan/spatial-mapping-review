const $=s=>document.querySelector(s), el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const modelNames={qwen:'Qwen 3.8 · 27B',gemma:'Gemma 4 · 31B',flash:'Gemini 3.8 Flash',astra:'GPT‑6 Astra',luna:'GPT‑5.6 Luna',opus:'Claude Opus 5'};
const modeNames={full:'完整RGB · 允许思考',last8:'最近8图 · 允许思考',full_nothink:'完整RGB · 关闭思考',caption:'逐图描述记忆',caption_latest1:'描述记忆 + 末帧',claude_last8:'Claude Code · 最近8图',codex_last8:'Codex · 最近8图'};
const state={index:null,case:null,run:null,view:'calls',step:0,detail:null,tab:'thinking',image:0,load:0,scope:null,model:'flash',mode:'full'};
const cache=new Map(),notes=new Map();let saveTimer;
const get=async u=>{if(cache.has(u))return cache.get(u);const r=await fetch(u);if(!r.ok)throw new Error('无法读取记录：'+r.status);const d=await r.json();cache.set(u,d);return d};
async function getRequest(url){
 const data=await get(url);if(data.format!=='spatial-blocks-v1')return data;
 const ids=data.payload.messages.map(m=>m.$block);if(data.payload.tools?.$block)ids.push(data.payload.tools.$block);
 await Promise.all([...new Set(ids.map(s=>s.slice(0,2)))].map(p=>get('/data/blocks/'+p+'.json')));
 const resolve=ref=>cache.get('/data/blocks/'+ref.$block.slice(0,2)+'.json')[ref.$block];
 return {...data.payload,messages:data.payload.messages.map(resolve),...(data.payload.tools?.$block?{tools:resolve(data.payload.tools)}:{})};
}
const clear=n=>n.replaceChildren(), code=t=>el('pre','code',typeof t==='string'?t:JSON.stringify(t,null,2));
const notice=(t,blue=false)=>el('div','notice'+(blue?' blue':''),t);
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',3500)}
function download(name,obj){const u=URL.createObjectURL(new Blob([typeof obj==='string'?obj:JSON.stringify(obj,null,2)],{type:'application/json'}));const a=el('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000)}
function imageNode(src,cls=''){const n=el('img',cls);n.src=src;n.alt='模型收到的原始RGB';n.loading='lazy';n.onclick=()=>{$('#large-image').src=src;$('#image-dialog').showModal()};return n}
function listCases(){
 const box=$('#case-list');clear(box);const query=$('#case-search').value.trim();
 for(const [kind,label] of [['common','同轨迹 · 读取对照'],['active','Claude Code · 自主探索']]){
  box.append(el('div','group-label',label));
  for(const c of state.index.cases.filter(c=>c.kind===kind&&c.title.includes(query))){
   const b=el('button','case-button'+(state.case?.id===c.id?' active':''));b.append(el('strong','',c.title),el('small','',kind==='common'?'同图同动作 · 对照分析':c.runs.map(r=>({qwen:'Qwen',gemma:'Gemma',flash:'Flash',astra:'Astra',luna:'Luna',opus:'Opus 5'})[r.model]||r.model).join(' / ')));b.onclick=()=>selectCase(c.id);box.append(b);
  }
 }
}
async function selectCase(id,restore={}){
 if(state.scope)saveNote(state.scope);state.case=state.index.cases.find(c=>c.id===id)||state.index.cases[0];state.model=restore.model||state.model;state.mode=restore.mode||state.mode;
 const models=[...new Set(state.case.runs.map(r=>r.model))];if(!models.includes(state.model))state.model=models[0];
 $('#case-kind').textContent=state.case.kind==='common'?'同轨迹 · 三模型读取对照':'模型自主探索 · 完整调用记录';$('#case-title').textContent=state.case.title;
 clear($('#models'));for(const m of models){const b=el('button',m===state.model?'selected':'',modelNames[m]);b.onclick=()=>selectCase(state.case.id,{model:m,mode:state.mode});$('#models').append(b)}
 const runs=state.case.runs.filter(r=>r.model===state.model);if(!runs.some(r=>r.mode===state.mode))state.mode=runs[0].mode;
 clear($('#mode-select'));for(const r of runs){const o=el('option','',modeNames[r.mode]||r.mode);o.value=r.mode;$('#mode-select').append(o)}$('#mode-select').value=state.mode;
 listCases();$('#case-sidebar').classList.remove('open');
 const ref=runs.find(r=>r.mode===state.mode);const token=++state.load;$('#stage-body').replaceChildren(el('div','skeleton','正在载入过程记录…'));
 try{const run=await get(ref.manifest);if(token!==state.load)return;state.run=run;state.step=restore.step??0;state.view=restore.view||state.view;state.tab=restore.tab||state.tab;
  $('#chat-link').href='/chat.html?'+new URLSearchParams({run:run.id});
  $('#run-description').textContent=run.description;$('#run-status').textContent=({COMPLETE:'运行已结束',FAILED:'中断记录保留',RUNNING:'导出时仍在运行',SNAPSHOT:'读取记录快照'})[run.status]||run.status;$('#run-status').className='status-pill'+(run.status==='FAILED'?' bad':'');
  clear($('#run-stats'));for(const [v,l] of [[run.frames.length,'观察帧'],[run.calls.length,'模型调用'],[run.calls.filter(c=>c.thinking_chars>0).length,'返回思考正文']]){const n=el('span');n.append(el('strong','',String(v)),document.createTextNode(l));$('#run-stats').append(n)}
  $('#timeline-search').value='';renderTimeline();await selectStep(Math.min(state.step,items().length-1));
 }catch(e){$('#stage-body').replaceChildren(notice(e.message))}
}
function items(){return state.run?(state.view==='calls'?state.run.calls:state.run.frames):[]}
function renderTimeline(){
 $('#calls-view').className=state.view==='calls'?'selected':'';$('#frames-view').className=state.view==='frames'?'selected':'';
 $('#timeline-search').placeholder=state.view==='calls'?'搜索思考开头 / 工具…':'输入帧号…';clear($('#timeline-list'));const q=$('#timeline-search').value.toLowerCase();
 items().forEach((s,i)=>{const label=state.view==='calls'?(s.budget?`${s.budget}帧读取`:`调用 ${i+1}`):`第 ${s.id} 帧`;const desc=state.view==='calls'?s.label:`转${s.receipt.requested_action.turn_deg}° · 移动${s.receipt.requested_action.move_m}m`;if(q&&!`${label} ${desc} ${s.preview||''}`.toLowerCase().includes(q))return;
  const b=el('button','step-item'+(i===state.step?' active':''));b.append(el('span','',label),el('small','',desc));if(s.status==='FAILED')b.append(el('small','failure-dot','协议/接口失败'));b.onclick=()=>selectStep(i);$('#timeline-list').append(b);
 });
}
async function selectStep(i){
 if(!state.run||!items().length)return;const oldScope=state.scope;if(oldScope)saveNote(oldScope);
 state.step=Math.max(0,Math.min(i,items().length-1));state.image=0;state.detail=null;renderTimeline();const s=items()[state.step];
 state.scope=state.view==='calls'?`call:${s.id}`:`frame:${state.run.id}:${s.id}`;loadNote(state.scope);
 $('#step-kicker').textContent=state.view==='calls'?`模型调用 ${state.step+1} / ${items().length}`:`观察帧 ${s.id} / ${items().length}`;
 $('#step-title').textContent=state.view==='calls'?s.label:`第 ${s.id} 帧 · ${s.receipt.status}`;$('#prev-step').disabled=state.step===0;$('#next-step').disabled=state.step===items().length-1;
 const url=new URL(location.href);url.hash=new URLSearchParams({case:state.case.id,model:state.model,mode:state.mode,view:state.view,step:state.step,tab:state.tab}).toString();history.replaceState(null,'',url);
 $('#stage-body').replaceChildren(el('div','skeleton','正在载入…'));const token=++state.load;
 if(state.view==='frames'){state.detail=s;renderFrame(s);researchNotes(s.evaluation);renderReference(s.reference);return}
 try{const d=await get(s.detail_url);if(token!==state.load)return;state.detail=d;renderCall(d);researchNotes(d.evaluation);renderReference(null,d.prediction)}catch(e){$('#stage-body').replaceChildren(notice(e.message))}
}
function gallery(box,images){
 const wrap=el('div');if(!images.length){wrap.append(el('div','empty-state','本次请求没有图像块，可查看下方完整文字输入。'));box.append(wrap);return}
 const stage=el('div','media-stage');const main=imageNode(images[state.image]);stage.append(main);wrap.append(stage);
 const line=el('div','media-caption');line.append(el('span','',`本次输入图像 ${state.image+1} / ${images.length} · 点击放大`));const nav=el('span');
 for(const [text,delta] of [['‹',-1],['›',1]]){const b=el('button','',text);b.disabled=state.image+delta<0||state.image+delta>=images.length;b.onclick=()=>{state.image+=delta;const parent=wrap.parentNode;wrap.remove();gallery(parent,images)};nav.append(b)}line.append(nav);wrap.append(line);
 const thumbs=el('div','thumbs');images.forEach((src,i)=>{const b=el('button',i===state.image?'active':'');const im=imageNode(src);im.onclick=null;b.append(im);b.title=`输入图像 ${i+1}`;b.onclick=()=>{state.image=i;const parent=wrap.parentNode;wrap.remove();gallery(parent,images)};thumbs.append(b)});wrap.append(thumbs);box.append(wrap);
}
function renderCall(d){
 const box=$('#stage-body');clear(box);
 if(state.run.kind==='common')box.append(notice(`这是${d.budget}帧历史的一次整段读取。下面的思考/回答属于这次调用；采集动作来自脚本，不是模型逐帧选择。`,true));
 if(d.status==='FAILED')box.append(notice('协议/接口失败：'+(d.error||'详见记录')+'。原文保留；正式评分不可当作成功。'));
 const mediaBox=el('div');mediaBox.style.marginTop='14px';box.append(mediaBox);gallery(mediaBox,d.images);
 const tabs=el('div','tabs');for(const [id,label] of [['thinking','返回的思考'],['output','工具与回答'],['input','完整输入'],['map','地图与指标']]){const b=el('button',state.tab===id?'active':'',label);b.onclick=()=>{state.tab=id;const h=new URLSearchParams(location.hash.slice(1));h.set('tab',id);history.replaceState(null,'','#'+h);renderCall(d)};tabs.append(b)}box.append(tabs);
 const pane=el('div');box.append(pane);const usage=d.usage||{};
 if(state.tab==='thinking'){
  if(d.thinking){pane.append(el('div','status-line',`${d.reasoning_visibility==='summary_only'?'以下是服务返回的推理摘要，不是完整内部思考':'以下是模型实际返回的分析文本'}，共 ${d.thinking.length.toLocaleString()} 字符；不是研究者推测。`));const p=code(d.thinking);p.classList.add('thought');pane.append(p)}
  else{const empty=el('div','empty-state');empty.append(el('strong','',state.model==='flash'?'Flash接口未返回思考正文':'本次没有返回思考正文'));const n=usage.completion_tokens_details?.reasoning_tokens??usage.reasoning_tokens;empty.append(document.createTextNode(state.model==='flash'?`服务报告${n?.toLocaleString()??'未知'}个思考tokens，但只保存到最终回答。这里不会补写或猜测内部过程。`:'可继续查看完整输入、工具请求和最终回答；没有思考文本不等于确认模型没有思考。'));pane.append(empty)}
  pane.append(el('div','status-line',`输入tokens：${usage.prompt_tokens?.toLocaleString()??'未报告'} · 输出tokens（含思考）：${usage.completion_tokens?.toLocaleString()??'未报告'} · 结束原因：${d.finish_reason??'接口错误'}`));
 }else if(state.tab==='output'){
  if(d.tools.length){pane.append(el('div','subheading','模型提出的工具请求'));for(const t of d.tools){pane.append(el('div','soft-tag',t.name),code(t.input))}pane.append(notice('工具请求不等于已经执行。实际返回值在后续调用的完整输入中；实际移动记录在“观察帧”时间线。',true))}
  pane.append(el('div','subheading','模型返回正文'),code(d.answer||'（没有普通回答正文）'));
  const raw=el('details','request-message');raw.append(el('summary','','原始服务响应（完整JSON）'),code(d.response));pane.append(raw);
 }else if(state.tab==='input')renderInput(pane,d);
 else{
  if(d.prediction){pane.append(notice('坐标图只画原始数值，不做对齐/缩放修正。格式失败记录仅供诊断。',true));pane.append(mapSVG(d.prediction));pane.append(code(d.prediction))}
  else pane.append(el('div','empty-state','这次调用没有独立的最终地图。自主探索中的地图写入可在工具请求及后续读取回执中查看。'));
  if(d.metrics){const small=Object.fromEntries(Object.entries(d.metrics).filter(([k])=>!['pairs','matches'].includes(k)));const det=el('details','request-message');det.append(el('summary','','离线评分（不是模型输入）'),code(small));pane.append(det)}
 }
 const dl=el('div','download-row');const b=el('button','','下载本次完整记录 ↓');b.onclick=async()=>download(d.id+'.json',{...d,request:await getRequest(d.request_url),note:'图像URL指向同字节文件；思考正文仅来自服务实际返回。'});dl.append(b);box.append(dl);
}
async function renderInput(pane,d){
 pane.append(notice('展示真正发给模型的输入，含历史消息与工具定义。图像数据转为本站同字节文件链接；旧图移除标记按原样保留。',true));
 const wait=el('div','skeleton','载入完整上下文…');pane.append(wait);
 try{const req=await getRequest(d.request_url);if(state.detail?.id!==d.id||state.tab!=='input')return;wait.remove();
  const conf=el('details','request-message');conf.append(el('summary','','请求设置与工具定义'),code(Object.fromEntries(Object.entries(req).filter(([k])=>k!=='messages'))));pane.append(conf);
  if(d.native_request_url){const a=el('a','','下载原生 Responses 完整请求');a.href=d.native_request_url;a.download='native-request.json';pane.append(a)}req.messages.forEach((m,i)=>{const det=el('details','request-message');det.open=i>=req.messages.length-2;const sum=el('summary');sum.append(el('span','request-role',m.role),document.createTextNode(`消息 ${i+1}${m.tool_call_id?' · '+m.tool_call_id:''}`));det.append(sum);
   if(typeof m.content==='string')det.append(code(m.content));else for(const b of m.content||[]){if(b.type==='text')det.append(code(b.text));else if(b.type==='image_url')det.append(imageNode(b.image_url.url));else det.append(code(b))}
   if(m.tool_calls)det.append(code(m.tool_calls));pane.append(det);
  });
 }catch(e){wait.textContent=e.message}
}
function renderFrame(f){
 const box=$('#stage-body');clear(box);if(state.run.kind==='common')box.append(notice('脚本采集的观察帧；模型没有在这一帧单独作答。请切回“模型调用”查看整段历史读取后的回答。',true));
 const mediaBox=el('div');mediaBox.style.marginTop='14px';gallery(mediaBox,[f.image]);box.append(mediaBox);box.append(el('div','subheading','公开执行回执（模型可获得）'),code(f.receipt));
 const description=el('p','hint','请求位移可能因碰撞而未完全执行。这里只展示实际保存的回执，不把请求值解释为测得的真实位移。');box.append(description);
}
function researchNotes(list){const box=$('#research-notes');clear(box);for(const n of list||[]){const p=el('div','review-note '+n.kind);p.append(el('span','label',({fact:'可核对的事实',limit:'记录限制',finding:'人工案例核查',warning:'协议/接口问题'})[n.kind]||'评价'),document.createTextNode(n.text));box.append(p)}}
function mapSVG(pred){
 const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 500 430');svg.classList.add('map-svg');
 const obs=(pred.objects||[]).filter(o=>o.x!==null&&o.y!==null&&Number.isFinite(Number(o.x))&&Number.isFinite(Number(o.y)));const xs=[-4,4,0,...obs.map(o=>+o.x)],ys=[-1,7,0,...obs.map(o=>+o.y)];let xmin=Math.min(...xs)-.5,xmax=Math.max(...xs)+.5,ymin=Math.min(...ys)-.5,ymax=Math.max(...ys)+.5;const scale=Math.min(420/(xmax-xmin),340/(ymax-ymin));const X=x=>45+(x-xmin)*scale,Y=y=>380-(y-ymin)*scale;
 const draw=(tag,attrs,text)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;svg.append(n)};
 for(let x=Math.ceil(xmin);x<=xmax;x+=Math.max(1,Math.ceil((xmax-xmin)/12))){draw('line',{x1:X(x),x2:X(x),y1:Y(ymin),y2:Y(ymax),stroke:'#e5e9f0'});draw('text',{x:X(x),y:400,'font-size':10,fill:'#8390a3'},x)}
 for(let y=Math.ceil(ymin);y<=ymax;y+=Math.max(1,Math.ceil((ymax-ymin)/12))){draw('line',{x1:X(xmin),x2:X(xmax),y1:Y(y),y2:Y(y),stroke:'#e5e9f0'});draw('text',{x:12,y:Y(y)+4,'font-size':10,fill:'#8390a3'},y)}
 draw('circle',{cx:X(0),cy:Y(0),r:5,fill:'#1e293b'});draw('text',{x:X(0)+7,y:Y(0)+13,'font-size':10},'起点');for(const o of obs){draw('circle',{cx:X(+o.x),cy:Y(+o.y),r:5,fill:'#4166c3'});draw('text',{x:X(+o.x)+7,y:Y(+o.y)-6,'font-size':10,fill:'#50617c'},o.category)}
 draw('text',{x:180,y:425,'font-size':11,fill:'#738094'},'初始相机右方 x / 米');return svg;
}
async function renderReference(frameRef,prediction){const box=$('#reference-body');clear(box);box.append(el('p','hint','以下内容来自离线评测记录，受测模型没有获得这些字段。'));
 if(frameRef)box.append(code(frameRef));if(state.run.isolation)box.append(el('div','subheading','隔离探针记录'),code(state.run.isolation));if(state.run.checkpoints?.length){const maps=el('details','request-message');maps.append(el('summary','','各检查点保存的模型地图'),code(state.run.checkpoints));box.append(maps)}const url=state.run.reference_url;if(url){const b=el('button','quiet','查看GT物体地图');b.onclick=async()=>{const gt=await get(url);if(gt)box.append(mapSVG(gt),code(gt));b.remove()};box.append(b)}
}
function draftKey(scope){return 'spatial-review-draft:'+scope}
function persistDraft(s){try{localStorage.setItem(draftKey(s.scope),JSON.stringify({note:s.note,verdict:s.verdict,baseRevision:s.revision,at:Date.now()}))}catch{}}
async function loadNote(scope){
 $('#note-text').disabled=true;$('#note-verdict').disabled=true;$('#note-text').value='';$('#note-scope').textContent=state.view==='calls'?`本条模型调用的评价`:`本模型 · 第${items()[state.step].id}帧评价`;
 if(notes.has(scope)){renderNote(notes.get(scope));return}
 const s={scope,note:'',verdict:'neutral',revision:0,loaded:false,dirty:false,saving:false,message:'正在载入云端批注…'};notes.set(scope,s);renderNote(s);
 try{const r=await fetch('/api/notes/'+encodeURIComponent(scope));if(!r.ok)throw new Error();Object.assign(s,await r.json(),{loaded:true,message:'云端已同步'});const draft=localStorage.getItem(draftKey(scope));if(draft){const d=JSON.parse(draft);if(d.note!==s.note||d.verdict!==s.verdict){const current={...s};s.note=d.note;s.verdict=d.verdict;s.dirty=true;s.message='已恢复本地草稿，等待保存';if((d.baseRevision??0)!==s.revision){s.conflict=current;s.message='云端已有新版本；旧草稿保留，请确认后覆盖或重新载入。'}}}}
 catch{s.message='云端暂不可用；草稿仍可在本机保存';s.loaded=true;s.offline=true;try{const d=JSON.parse(localStorage.getItem(draftKey(scope)));if(d){s.note=d.note;s.verdict=d.verdict;s.dirty=true}}catch{}}
 renderNote(s);
}
function renderNote(s){if(s.scope!==state.scope)return;$('#note-text').disabled=!s.loaded;$('#note-verdict').disabled=!s.loaded;$('#note-text').value=s.note;$('#note-verdict').value=s.verdict;statusNote(s)}
function statusNote(s){if(s.scope!==state.scope)return;$('#save-indicator').textContent=s.saving?'保存中…':s.dirty?'未同步':s.message;$('#save-indicator').className=s.offline||s.conflict?'error':'';$('#note-message').textContent=s.message;
 if(s.conflict){const b=el('button','quiet','保留我的草稿，覆盖最新云端版本');b.onclick=()=>{s.revision=s.conflict.revision;s.conflict=null;saveNote(s.scope)};$('#note-message').append(el('br'),b)}
}
function editNote(){const s=notes.get(state.scope);if(!s||!s.loaded)return;s.note=$('#note-text').value;s.verdict=$('#note-verdict').value;s.dirty=true;s.message='草稿已保存在本机，准备同步…';persistDraft(s);statusNote(s);clearTimeout(saveTimer);const scope=s.scope;saveTimer=setTimeout(()=>saveNote(scope),800)}
async function saveNote(scope){
 const s=notes.get(scope);if(!s||!s.dirty||!s.loaded||s.saving||s.conflict)return;s.saving=true;statusNote(s);const sent={note:s.note,verdict:s.verdict,revision:s.revision};
 try{const r=await fetch('/api/notes/'+encodeURIComponent(scope),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(sent)});const result=await r.json();if(r.status===409){s.conflict=result.current;s.message='另一页面已有新版本；本地草稿保留，请确认后覆盖或重新载入。';return}if(!r.ok)throw new Error();s.revision=result.revision;s.offline=false;s.dirty=s.note!==sent.note||s.verdict!==sent.verdict;s.message='已保存到云端 · '+new Date(result.updated_at).toLocaleTimeString('zh-CN');if(!s.dirty)localStorage.removeItem(draftKey(scope));}
 catch{s.offline=true;s.message='云端保存失败，草稿已保存在本机；可重试或导出。';persistDraft(s)}
 finally{s.saving=false;statusNote(s);if(s.dirty&&!s.offline&&!s.conflict)setTimeout(()=>saveNote(scope),100)}
}
$('#show-complete-output').onclick=()=>{state.tab='output';if(state.view!=='calls'){state.view='calls';state.step=0;renderTimeline();selectStep(0)}else selectStep(state.step)};
$('#note-text').oninput=editNote;$('#note-verdict').onchange=editNote;$('#save-note').onclick=()=>saveNote(state.scope);$('#reload-note').onclick=()=>{const s=notes.get(state.scope);if(s?.dirty&&!confirm('本地草稿仍可导出。现在载入云端版本以重新编辑？'))return;localStorage.removeItem(draftKey(state.scope));notes.delete(state.scope);loadNote(state.scope)};
$('#export-notes').onclick=async()=>{const drafts={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith('spatial-review-draft:'))drafts[k.slice(21)]=JSON.parse(localStorage.getItem(k))}let cloud=null;try{const r=await fetch('/api/notes/export');if(!r.ok)throw new Error();cloud=await r.json()}catch{toast('云端暂不可用，导出本地草稿')}download('空间建图评价-'+new Date().toISOString().slice(0,10)+'.json',{cloud,drafts})};
$('#case-search').oninput=listCases;$('#timeline-search').oninput=renderTimeline;$('#mode-select').onchange=()=>selectCase(state.case.id,{model:state.model,mode:$('#mode-select').value});
for(const v of ['calls','frames'])$('#'+v+'-view').onclick=()=>{if(state.scope)saveNote(state.scope);state.view=v;state.step=0;$('#timeline-search').value='';renderTimeline();selectStep(0)};
$('#prev-step').onclick=()=>selectStep(state.step-1);$('#next-step').onclick=()=>selectStep(state.step+1);$('#menu-toggle').onclick=()=>$('#case-sidebar').classList.toggle('open');$('#close-image').onclick=()=>$('#image-dialog').close();
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();saveNote(state.scope)}return}if($('#image-dialog').open)return;if(['j','ArrowRight'].includes(e.key)){e.preventDefault();selectStep(state.step+1)}if(['k','ArrowLeft'].includes(e.key)){e.preventDefault();selectStep(state.step-1)}});
try{state.index=await get('/data/index.json');$('#case-count').textContent=state.index.summary.cases;$('#snapshot').textContent='记录快照 · '+new Date(state.index.snapshot_at).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false});const h=new URLSearchParams(location.hash.slice(1));await selectCase(h.get('case')||(state.index.cases.find(c=>c.id==='active-91105')||state.index.cases[0]).id,{model:h.get('model')||'flash',mode:h.get('mode')||'full',view:h.get('view')||'calls',step:Number(h.get('step')||0),tab:h.get('tab')||'output'});}catch(e){$('#stage-body').replaceChildren(notice('载入失败：'+e.message+'。请刷新重试。'))}
