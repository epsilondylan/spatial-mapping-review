import {get,el} from './evidence.js';
const $=s=>document.querySelector(s);
const names={qwen:'Qwen 3.8 · 27B',gemma:'Gemma 4 · 31B',flash:'Gemini 3.8 Flash',astra:'GPT‑6 Astra',luna:'GPT‑5.6 Luna',spatialclaw:'SpatialClaw tools + Codex',opus:'Claude Opus 5'};
const modes={full:'完整RGB',last8:'最近8图',full_nothink:'完整RGB · 关闭思考',caption:'逐图描述',caption_latest1:'描述记忆 + 末帧',claude_last8:'Claude Code · 最近8图',codex_last8:'Codex · 最近8图',active_full_rgb:'真实主动探索 · 全部RGB',static_exact4:'四视角盲测 · 精确位姿',tool_audit:'工具审计 · 封存面板'};
const kinds={common:'固定轨迹读取对照',active:'模型主动探索',supplement:'新版多房间补充实验',baseline:'SpatialClaw 工具审计'};
let entries=[];
function render(){
 const kind=$('#kind-filter').value,model=$('#model-filter').value,query=$('#catalog-search').value.trim().toLowerCase();
 const visible=entries.filter(x=>(kind==='all'||x.case.kind===kind)&&(model==='all'||x.run.model===model)&&`${x.case.title} ${names[x.run.model]} ${modes[x.run.mode]||x.run.mode}`.toLowerCase().includes(query));
 $('#catalog-count').textContent=`显示 ${visible.length} / ${entries.length} 条轨迹；每张卡片都可打开完整消息与逐步复盘。`;
 const box=$('#catalog-list');box.replaceChildren();
 for(const [group,label] of Object.entries(kinds)){
  const rows=visible.filter(x=>x.case.kind===group);if(!rows.length)continue;
  const section=el('section','catalog-group');section.append(el('h2','',label));
  for(const {case:info,run} of rows){
   const card=el('article','trajectory-card'),top=el('div','trajectory-card-top');top.append(el('strong','',names[run.model]||run.model),el('span','soft-tag',run.status));card.append(top,el('h3','',info.title),el('p','',modes[run.mode]||run.mode));
   const stats=el('p','trajectory-stats',`${run.frames} 观察帧 · ${run.calls} 模型调用`);card.append(stats);
   const note=group==='baseline'?'工具审计，不作为空环境建图比较。':group==='supplement'?'Flash 主动探索与 Luna 固定四视角分开保存。':group==='common'?'动作由采集脚本固定。':'模型与框架选择动作与工具。';card.append(el('p','hint',note));
   const links=el('p','trajectory-card-links');const transcript=el('a','','完整轨迹 ↗');transcript.href='/chat.html?'+new URLSearchParams({run:run.id});const review=el('a','','逐步复盘 ↗');review.href='/#'+new URLSearchParams({case:info.id,model:run.model,mode:run.mode,view:'calls',step:0,tab:'output'});links.append(transcript,review);card.append(links);section.append(card);
  }
  box.append(section);
 }
 if(!visible.length)box.append(el('div','empty-state','没有匹配的轨迹。'));
}
try{
 const index=await get('/data/index.json');$('#catalog-snapshot').textContent='记录快照 · '+new Date(index.snapshot_at).toLocaleString('zh-CN',{timeZone:'Asia/Hong_Kong',hour12:false});entries=index.cases.flatMap(c=>c.runs.map(r=>({case:c,run:r})));
 for(const [id,label] of Object.entries(kinds)){const option=el('option','',label);option.value=id;$('#kind-filter').append(option)}
 for(const id of [...new Set(entries.map(x=>x.run.model))].sort()){const option=el('option','',names[id]||id);option.value=id;$('#model-filter').append(option)}
 $('#kind-filter').onchange=render;$('#model-filter').onchange=render;$('#catalog-search').oninput=render;render();
}catch(error){$('#catalog-list').replaceChildren(el('div','empty-state','载入失败：'+error.message));}
