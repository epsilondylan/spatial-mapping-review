import {get,getRequest,el,code,detail,reviewURL} from './evidence.js';
import {mountNotes} from './chat-notes.js';
import {conversationWindow} from './transcript.js';
const $=s=>document.querySelector(s),params=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));
const names={qwen:'Qwen 3.8 · 27B',gemma:'Gemma 4 · 31B',flash:'Gemini 3.8 Flash',astra:'GPT‑6 Astra',luna:'GPT‑5.6 Luna',opus:'Claude Opus 5'};
const modes={full:'完整RGB · 允许思考',last8:'最近8图 · 允许思考',full_nothink:'完整RGB · 关闭思考',caption:'逐图描述记忆',caption_latest1:'描述记忆 + 末帧',claude_last8:'Claude Code · 最近8图',codex_last8:'Codex · 最近8图'};
let run,caseInfo,sections=[],selected=0,observer,view=params.get('view')==='requests'?'requests':'conversation';
function setHash(i,focus='call'){history.replaceState(null,'','#'+new URLSearchParams({call:i,focus}))}
function image(src){const img=el('img','chat-image');img.src=src;img.loading='lazy';img.alt='本条消息中的模型输入图像';img.onclick=()=>{$('#chat-large-image').src=src;$('#chat-image-dialog').showModal()};return img}
function message(m,label){
 const row=el('div','chat-event'+(m.role==='assistant'?' outgoing':' incoming')),bubble=el('div','chat-bubble');row.dataset.role=m.role||'unknown';bubble.append(el('div','chat-role',label));
 if(m.role==='tool'&&typeof m.content==='string'){try{const receipt=JSON.parse(m.content);if(receipt.frame&&receipt.requested_action){const a=receipt.requested_action;bubble.append(el('div','chat-receipt',`环境回执 · 帧 ${receipt.frame} · 转向 ${a.turn_deg}° · 移动请求 ${a.move_m} m · ${receipt.status}`));if(receipt.image)bubble.append(el('p','hint','此回执返回图片路径；实际发送给模型的图片在对应图像消息中显示。'))}}catch{}}
 if(typeof m.content==='string')bubble.append(code(m.content));else if(Array.isArray(m.content))for(const b of m.content){
  if(b.type==='text')bubble.append(code(b.text));else if(b.type==='image_url'&&b.image_url?.url){bubble.append(image(b.image_url.url));const extra=Object.fromEntries(Object.entries(b.image_url).filter(([k])=>k!=='url'));if(Object.keys(extra).length)bubble.append(detail('图像参数',extra))}else bubble.append(code(b));
 }else if(m.content!=null)bubble.append(code(m.content));
 for(const [k,v] of Object.entries(m))if(!['role','content'].includes(k)&&v!=null){bubble.append(el('div','chat-block-label',k),code(v))}
 bubble.append(detail('本条完整消息 JSON',m));row.append(bubble);return row;
}
function toolRequest(t){
 const box=el('div','chat-tool-request');box.append(el('div','chat-tool-name',`${t.name||'tool'} · 模型提出的工具请求`));
 const input=t.input||t.arguments||{};
 if(typeof input==='object'&&input!==null){for(const [key,value] of Object.entries(input)){box.append(el('div','chat-block-label',key),code(value))}}else box.append(code(input));
 box.append(detail('完整工具请求 JSON',t));return box;
}
function renderInputs(s,req,previous,i){
 const window=view==='requests'?{visible:req.messages.map((_,j)=>j),history:[]}:conversationWindow(req.messages,i?previous.messages:[]);
 if(window.history.length){
  const history=el('details','chat-history'),summary=el('summary','',`本次还发送了 ${window.history.length} 条历史/上下文消息 · 展开查看全部`);
  history.append(summary);history.addEventListener('toggle',()=>{if(history.open&&!history.dataset.loaded){history.dataset.loaded='1';window.history.forEach(j=>history.append(message(req.messages[j],`${req.messages[j].role||'unknown'} · 历史输入 ${j+1}/${req.messages.length}`)))}});s.content.append(history);
 }
 window.visible.forEach(j=>{const m=req.messages[j];const source=m.role==='tool'?'环境 / 工具回执':m.role==='user'?'框架输入':m.role==='assistant'?'历史模型消息':'系统指令';s.content.append(message(m,`${m.role||'unknown'} · ${source} · 输入 ${j+1}/${req.messages.length}`))});
}
function selectEvaluation(i,d){
 selected=i;$('#jump-call').value=String(i);sections.forEach((s,j)=>s.node.classList.toggle('active',j===i));$('#evaluation-title').textContent=`调用 ${i+1} · 研究者评价`;
 const box=$('#chat-evaluation');box.replaceChildren();for(const n of d.evaluation||[]){const p=el('div','review-note '+n.kind);p.append(el('span','label',({fact:'可核对的事实',limit:'记录限制',finding:'人工案例核查',warning:'协议/接口问题'})[n.kind]||'评价'),document.createTextNode(n.text));box.append(p)}
 $('#review-call').href=$('#back').href=reviewURL(caseInfo.id,run.model,run.mode,i);mountNotes($('#annotation'),'call:'+d.id);
}
async function loadCall(i){
 const s=sections[i];if(!s)return;if(s.promise)return s.promise;
 s.promise=(async()=>{
  s.content.replaceChildren(el('div','chat-load-placeholder','正在还原本次完整输入与输出…'));
  const d=await get(run.calls[i].detail_url),req=await getRequest(d.request_url);let previous={messages:[]};
  if(i&&view==='conversation'){const prev=await get(run.calls[i-1].detail_url);previous=await getRequest(prev.request_url)}
  s.data=d;s.request=req;s.content.replaceChildren();
  if(d.provider)s.content.append(el('p','chat-call-status',`本次接口提供商：${d.provider} · ${d.provider_base_url||''}`));
  if(d.native_events_url){const link=el('a','','查看完整原生流式事件 JSON');link.href=d.native_events_url;link.target='_blank';link.rel='noopener';s.content.append(link)}
  if(d.status==='FAILED')s.content.append(el('div','notice','协议/接口失败：'+(d.error||'详见原始响应')+'。保留原文，不能视为成功。'));
  const settings=detail('本次请求设置与完整工具定义',Object.fromEntries(Object.entries(req).filter(([k])=>k!=='messages')));settings.classList.add('chat-settings');s.content.append(settings);if(d.native_request_url){const original=detail(d.native_protocol==='anthropic_messages'?'原生 Messages 请求（图片以文件引用保存）':'实际发送的原生 Responses 请求（完整 JSON）',await get(d.native_request_url));s.content.append(original)}
  s.content.append(el('p','chat-call-status',`实际请求：${req.messages.length} 条消息 · ${d.images.length} 张图像。${view==='conversation'?'连续对话展示最近 assistant 之后的输入；重发历史保留在折叠区，系统指令变化单独展示。':'完整展示本次实际发送的全部消息，包括重发历史。'}`));
  renderInputs(s,req,previous,i);
  const reply=el('div','chat-event outgoing chat-answer');reply.id='reply-'+i;reply.dataset.role='assistant';const bubble=el('div','chat-bubble');bubble.append(el('div','chat-role',`assistant · ${names[run.model]} · 本次实际返回`));
  if(d.thinking){const thinking=el('details','chat-thinking');thinking.append(el('summary','',d.reasoning_visibility==='summary_only'?'reasoning · 服务返回的推理摘要（展开）':'reasoning · 接口返回的思考正文（展开）'));const t=code(d.thinking);t.classList.add('chat-reasoning');thinking.append(t);bubble.append(thinking)}
  bubble.append(el('div','chat-reply-label','完整输出正文'));const answer=code(d.answer||'（没有普通回答正文；请查看工具请求和原始响应）');answer.classList.add('complete-answer');bubble.append(answer);
  if(d.tools?.length){bubble.append(el('div','chat-block-label','工具请求 · 执行情况见后续回执'));d.tools.forEach(t=>bubble.append(toolRequest(t)))}
  bubble.append(el('p','hint',`结束原因：${d.finish_reason??'未报告'} · 模型调用 ${i+1}`),detail('原始服务响应（完整 JSON）',d.response));
  const dl=el('button','','下载完整输入与输出 ↓');dl.onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({...d,request:req},null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download=d.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)};bubble.append(dl);reply.append(bubble);s.content.append(reply);
  if(selected===i)selectEvaluation(i,d);return d;
 })().catch(e=>{s.promise=null;s.content.replaceChildren(el('div','chat-call-error',e.message));const b=el('button','','重试载入');b.onclick=()=>loadCall(i);s.content.append(b);throw e});
 return s.promise;
}
async function jump(i,focus='call'){
 i=Math.max(0,Math.min(i,sections.length-1));if(!sections.length)return;selected=i;$('#jump-call').value=String(i);setHash(i,focus);
 try{const d=await loadCall(i);if(selected!==i)return;selectEvaluation(i,d);const target=focus==='reply'?$('#reply-'+i):sections[i].node;target.scrollIntoView({block:'start'});}catch{}
}
$('#show-chat-controls').onclick=e=>{e.preventDefault();window.scrollTo({top:0,behavior:'smooth'})};
$('#chat-close-image').onclick=()=>$('#chat-image-dialog').close();$('#jump-output').onclick=()=>jump(Number($('#jump-call').value),'reply');$('#jump-call').onchange=()=>jump(Number($('#jump-call').value));
try{
 const idx=await get('/data/index.json');$('#chat-snapshot').textContent='记录快照 · '+new Date(idx.snapshot_at).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false});
 const choices=idx.cases.flatMap(c=>c.runs.filter(r=>r.model!=='opus').map(r=>({c,r}))).sort((a,b)=>Number(b.c.id.startsWith('active-'))-Number(a.c.id.startsWith('active-')));const chosen=choices.find(x=>x.r.id===params.get('run'))||choices.find(x=>x.r.id==='active-91105-flash')||choices.find(x=>x.c.id.startsWith('active-')&&x.r.model==='flash')||choices[0];
 caseInfo=chosen.c;run=await get(chosen.r.manifest);document.title=`${caseInfo.title} · ${names[run.model]} · 完整对话`;
 for(const {c,r} of choices){const o=el('option','',`${c.id.startsWith('active-')?'自主探索':'固定轨迹对照'} · ${c.title} / ${names[r.model]} / ${modes[r.mode]||r.mode}`);o.value=r.id;$('#trajectory').append(o)}$('#trajectory').value=run.id;$('#trajectory').onchange=()=>{location.href='/chat.html?'+new URLSearchParams({run:$('#trajectory').value,view})};
 $('#transcript-view').value=view;$('#transcript-view').onchange=()=>{location.href='/chat.html?'+new URLSearchParams({run:run.id,view:$('#transcript-view').value})+'#'+new URLSearchParams({call:selected})};
 $('#chat-title').textContent=`${caseInfo.title} · ${names[run.model]}`;
 $('#chat-description').textContent=run.kind==='common'?'固定轨迹对照：动作由采集脚本产生，模型在检查点读取历史并输出地图。':`自主探索 · ${['astra','luna'].includes(run.model)?'Codex':'Claude Code'}：模型决定转向、移动、读取哪张图片和如何记录地图。右侧是模型实际返回的回答与工具请求，左侧是框架输入及后续环境回执；工具请求是否执行以回执为准。`;
 const conversation=$('#conversation');selected=Math.max(0,Math.min(Number(hash.get('call'))||0,run.calls.length-1));
 run.calls.forEach((c,i)=>{const node=el('section','chat-call'),heading=el('div','chat-call-heading'),content=el('div','chat-call-content');node.id='call-'+i;
  heading.append(el('h2','',`调用 ${i+1} · ${c.label}`));const output=el('button','','完整回答 ↓'),review=el('button','','评价本次调用');output.onclick=()=>jump(i,'reply');review.onclick=async()=>{selected=i;setHash(i);try{selectEvaluation(i,await loadCall(i));if(innerWidth<=1000)$('#annotation').scrollIntoView({block:'center'})}catch{}};heading.append(output,review);node.append(heading,content);content.append(el('div','chat-load-placeholder',`调用 ${i+1} · 滚动到这里自动载入完整消息`));conversation.append(node);sections.push({node,content,promise:null});const o=el('option','',`${i+1} · ${c.label}`);o.value=String(i);$('#jump-call').append(o);
 });
 if(!sections.length)conversation.append(el('div','chat-empty','这条轨迹尚无保存的模型调用。'));
 await jump(selected,hash.get('focus')==='reply'?'reply':'call');
 if(!hash.has('call'))window.scrollTo({top:0});
 observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){const i=sections.findIndex(s=>s.node===e.target);loadCall(i).catch(()=>{});observer.unobserve(e.target)}},{rootMargin:'300px'});sections.forEach(s=>observer.observe(s.node));
}catch(e){$('#conversation').replaceChildren(el('div','chat-call-error','载入失败：'+e.message))}
