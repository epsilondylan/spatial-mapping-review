import {get,getRequest,el,code,detail,reviewURL} from './evidence.js';
import {mountNotes} from './chat-notes.js';
const $=s=>document.querySelector(s),params=new URLSearchParams(location.search),hash=new URLSearchParams(location.hash.slice(1));
const names={qwen:'Qwen 3.8 · 27B',gemma:'Gemma 4 · 31B',flash:'Gemini 3.8 Flash'};
const modes={full:'完整RGB · 允许思考',last8:'最近8图 · 允许思考',full_nothink:'完整RGB · 关闭思考',caption:'逐图描述记忆',caption_latest1:'描述记忆 + 末帧',claude_last8:'Claude Code · 最近8图'};
let run,caseInfo,sections=[],selected=0,observer;
function setHash(i,focus='call'){history.replaceState(null,'','#'+new URLSearchParams({call:i,focus}))}
function image(src){const img=el('img','chat-image');img.src=src;img.loading='lazy';img.alt='本条消息中的模型输入图像';img.onclick=()=>{$('#chat-large-image').src=src;$('#chat-image-dialog').showModal()};return img}
function message(m,label){
 const row=el('div','chat-event'+(m.role==='assistant'?' outgoing':' incoming')),bubble=el('div','chat-bubble');row.dataset.role=m.role||'unknown';bubble.append(el('div','chat-role',label));
 if(typeof m.content==='string')bubble.append(code(m.content));else if(Array.isArray(m.content))for(const b of m.content){
  if(b.type==='text')bubble.append(code(b.text));else if(b.type==='image_url'&&b.image_url?.url){bubble.append(image(b.image_url.url));const extra=Object.fromEntries(Object.entries(b.image_url).filter(([k])=>k!=='url'));if(Object.keys(extra).length)bubble.append(detail('图像参数',extra))}else bubble.append(code(b));
 }else if(m.content!=null)bubble.append(code(m.content));
 for(const [k,v] of Object.entries(m))if(!['role','content'].includes(k)&&v!=null){bubble.append(el('div','chat-block-label',k),code(v))}
 bubble.append(detail('本条完整消息 JSON',m));row.append(bubble);return row;
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
  const d=await get(run.calls[i].detail_url),req=await getRequest(d.request_url);s.data=d;s.request=req;s.content.replaceChildren();
  if(d.status==='FAILED')s.content.append(el('div','notice','协议/接口失败：'+(d.error||'详见原始响应')+'。保留原文，不能视为成功。'));
  const settings=detail('本次请求设置与完整工具定义',Object.fromEntries(Object.entries(req).filter(([k])=>k!=='messages')));settings.classList.add('chat-settings');s.content.append(settings);
  s.content.append(el('p','chat-call-status',`实际输入：${req.messages.length} 条消息 · ${d.images.length} 张图像。以下包括本次重新发送的历史；不把历史内容当成新的输出。`));
  req.messages.forEach((m,j)=>s.content.append(message(m,`${m.role||'unknown'} · 输入消息 ${j+1} / ${req.messages.length}${m.role==='assistant'?' · 历史模型消息':''}`)));
  const reply=el('div','chat-event outgoing chat-answer');reply.id='reply-'+i;const bubble=el('div','chat-bubble');bubble.append(el('div','chat-role',`${names[run.model]} · 本次实际返回`));
  if(d.thinking){bubble.append(el('div','chat-block-label','接口返回的思考正文'));const t=code(d.thinking);t.classList.add('chat-reasoning');bubble.append(t)}
  else{const tokens=d.usage?.completion_tokens_details?.reasoning_tokens??d.usage?.reasoning_tokens;bubble.append(el('p','hint',`接口未返回思考正文${tokens!=null?'；报告思考 '+tokens.toLocaleString()+' tokens':''}。以下展示实际收到的完整输出。`))}
  bubble.append(el('div','chat-reply-label','完整输出正文'));const answer=code(d.answer||'（没有普通回答正文；请查看工具请求和原始响应）');answer.classList.add('complete-answer');bubble.append(answer);
  if(d.tools?.length){bubble.append(el('div','chat-block-label','解析出的工具请求（执行结果以环境回执为准）'));d.tools.forEach(t=>bubble.append(code(t)))}
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
$('#chat-close-image').onclick=()=>$('#chat-image-dialog').close();$('#jump-output').onclick=()=>jump(Number($('#jump-call').value),'reply');$('#jump-call').onchange=()=>jump(Number($('#jump-call').value));
try{
 const idx=await get('/data/index.json');$('#chat-snapshot').textContent='记录快照 · '+new Date(idx.snapshot_at).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false});
 const choices=idx.cases.flatMap(c=>c.runs.map(r=>({c,r})));const chosen=choices.find(x=>x.r.id===params.get('run'))||choices.find(x=>x.r.model==='flash')||choices[0];
 caseInfo=chosen.c;run=await get(chosen.r.manifest);document.title=`${caseInfo.title} · ${names[run.model]} · 完整对话`;
 for(const {c,r} of choices){const o=el('option','',`${c.title} / ${names[r.model]} / ${modes[r.mode]||r.mode}`);o.value=r.id;$('#trajectory').append(o)}$('#trajectory').value=run.id;$('#trajectory').onchange=()=>{location.href='/chat.html?'+new URLSearchParams({run:$('#trajectory').value})};
 $('#chat-title').textContent=`${caseInfo.title} · ${names[run.model]}`;
 $('#chat-description').textContent=run.kind==='common'?'动作由采集脚本产生。模型在检查点一次性读取图片与动作历史，再输出地图；不是模型逐帧采取行动。':'这些是 Claude Code 中的真实模型调用。右侧工具请求由所选模型提出；左侧后续输入保留工具返回与环境回执。';
 const conversation=$('#conversation');selected=Math.max(0,Math.min(Number(hash.get('call'))||0,run.calls.length-1));
 run.calls.forEach((c,i)=>{const node=el('section','chat-call'),heading=el('div','chat-call-heading'),content=el('div','chat-call-content');node.id='call-'+i;
  heading.append(el('h2','',`调用 ${i+1} · ${c.label}`));const output=el('button','','完整回答 ↓'),review=el('button','','评价本次调用');output.onclick=()=>jump(i,'reply');review.onclick=async()=>{selected=i;setHash(i);try{selectEvaluation(i,await loadCall(i));if(innerWidth<=1000)$('#annotation').scrollIntoView({block:'center'})}catch{}};heading.append(output,review);node.append(heading,content);content.append(el('div','chat-load-placeholder',`调用 ${i+1} · 滚动到这里自动载入完整消息`));conversation.append(node);sections.push({node,content,promise:null});const o=el('option','',`${i+1} · ${c.label}`);o.value=String(i);$('#jump-call').append(o);
 });
 if(!sections.length)conversation.append(el('div','chat-empty','这条轨迹尚无保存的模型调用。'));
 await jump(selected,hash.get('focus')==='reply'?'reply':'call');
 observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){const i=sections.findIndex(s=>s.node===e.target);loadCall(i).catch(()=>{});observer.unobserve(e.target)}},{rootMargin:'300px'});sections.forEach(s=>observer.observe(s.node));
}catch(e){$('#conversation').replaceChildren(el('div','chat-call-error','载入失败：'+e.message))}
