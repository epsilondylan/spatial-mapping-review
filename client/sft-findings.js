import { evidenceImage } from './media.js';
const $ = s => document.querySelector(s);
const e = (tag, text, cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const pct = (v,d=2) => (v*100).toFixed(d);
const signed = v => `${v>=0?'+':''}${pct(v)}`;
const modeName = m => m==='e2e'?'自主探索 E2E':'固定观察 Reader';
function paragraph(parent,text,cls){parent.append(e('p',text,cls))}
function table(parent,caption,headers,rows){
 const wrap=e('div',undefined,'table-wrap'),t=e('table');t.append(e('caption',caption));const head=e('thead'),hr=e('tr');
 headers.forEach(x=>{const th=e('th',x);th.scope='col';hr.append(th)});head.append(hr);t.append(head);const body=e('tbody');
 rows.forEach(row=>{const tr=e('tr');row.forEach((cell,i)=>{const td=e(i===0?'th':'td',String(cell));if(i===0)td.scope='row';tr.append(td)});body.append(tr)});
 t.append(body);wrap.append(t);parent.append(wrap);return t;
}
function link(text,url){const a=e('a',text);a.href=url;return a}
function stat(parent,label,value){const x=e('div');x.append(e('span',label),e('strong',value));parent.append(x)}
try {
 const response=await fetch(new URL('./sft-analysis/findings.json',import.meta.url));
 if(!response.ok)throw new Error(`数据请求失败（${response.status}）`);
 const data=await response.json();
 for(const [label,value,sub] of [['自主探索 F1@0.75m',`${pct(data.summary.e2e.base_mean)} → ${pct(data.summary.e2e.sft_mean)}`,'128 世界 · 宏平均 ×100'],['固定观察 F1@0.75m',`${pct(data.summary.reader.base_mean)} → ${pct(data.summary.reader.sft_mean)}`,'同一组 16 张图 · 宏平均 ×100'],['SFT 尾部 ≥4 帧重复','62 / 128','E2E · 同字节旧图']]){
  const box=e('div');box.append(e('small',label),e('strong',value),e('small',sub));$('#headline').append(box);
 }
 function gain(){
  const mode=$('#gain-mode').value,s=data.summary[mode],d=data.gain[mode],box=$('#gain-content');box.replaceChildren();
  const r=e('div',undefined,'readout');stat(r,'Base → SFT（F1×100）',`${pct(s.base_mean)} → ${pct(s.sft_mean)}`);stat(r,'平均增益（分）',signed(s.delta.mean));stat(r,'提升 / 持平 / 退化',`${s.directions.win} / ${s.directions.tie} / ${s.directions.loss}`);box.append(r);
  const bar=e('div',undefined,'gain-bar');bar.setAttribute('aria-label','全队列增益按完成状态分解');
  d.parts.forEach((p,i)=>{const part=e('span',`${pct(p.full_cohort_contribution)} 分`);part.style.width=`${p.fraction_of_total_gain*100}%`;part.style.background=i?'#84a6bd':'#078071';part.title=`${i?'Base失败、SFT完成':'双方完成'}：占总增益 ${pct(p.fraction_of_total_gain)}%`;bar.append(part)});box.append(bar);
  const legend=e('div',undefined,'legend');legend.append(e('span','双方均完成','sft'),e('span','Base 失败 → SFT 完成','light'));box.append(legend);
  table(box,'相同分母下的算术贡献',['运行子组','世界数','子组 Base → SFT','对总增益贡献','占总增益'],d.parts.map((p,i)=>[i?'Base 失败 / SFT 完成':'双方均完成',p.n,`${pct(p.base_mean)} → ${pct(p.sft_mean)}`,`${signed(p.full_cohort_contribution)} 分`,`${pct(p.fraction_of_total_gain)}%`]));
  const bound=e('p',undefined,'bound');bound.append('把所有失败的 Base 都补记满分、保留其余分数，SFT 仍领先 ',e('b',`${pct(d.counterfactual_rescoring_failed_base_as_1_lower_bound)} 分`),'。这是算术敏感性下界，不是置信区间，也不是对失败样本真实能力的估计。');box.append(bound);
 }
 function behavior(){
  const scope=$('#behavior-scope').value,d=data.behavior[scope],box=$('#behavior-content');box.replaceChildren();
  table(box,`${d.n_cases} 个配对世界 · 每世界均值`,['行为指标','Base','SFT'],[['观察帧数','frames',2],['实际行走距离（m）','path_m',3],['独立位置数','unique_positions',2],['不同图片数','unique_images',2],['原地转向次数','stationary_rotations',2],['获得新图的原地转向','stationary_rotate_new_images',2],['模型调用次数','calls',2]].map(([name,key,dec])=>[name,d.base.means[key].toFixed(dec),d.sft.means[key].toFixed(dec)]));
  table(box,'重复与碰撞 · 明确分母',['指标','Base','SFT'],[
   ['重复帧 / 所有帧',...['base','sft'].map(a=>`${d[a].duplicate_frames_total}/${d[a].frames_total} · ${pct(d[a].micro_duplicate_fraction)}%`)],
   ['尾部 ≥4 帧均为旧图',...['base','sft'].map(a=>`${d[a].trailing_duplicate_ge4_cases}/${d.n_cases} 世界`)],
   ['碰撞 / 非零移动请求',...['base','sft'].map(a=>`${d[a].partial_steps+d[a].blocked_steps}/${d[a].movement_requests} · ${pct(d[a].collision_per_movement_request)}%`)]
  ]);
  const post=data.behavior.post_collision.both_eligible;
  paragraph(box,`另一个选择后的子集：双方首次碰撞之后都实际记录了至少 4 个后续观察帧的 ${post.n_cases} 个世界中，Base ${post.base.no_later_translation} 例、SFT ${post.sft.no_later_translation} 例之后不再平移。这是行为差异线索，不能解释为碰撞的因果效应。`,'caption');
  const loop=$('#loop-finding');loop.replaceChildren();paragraph(loop,'全部 128 个世界中，8 个 SFT 运行沿同一小方形绕了三圈：走 9m，却只有 4 个位置、7 张不同图。它们中 4 个仍然得到满分地图。');
  paragraph(loop,'w202609214 的第 4、8、12、16 帧位姿与图片相同；结束探索的文本却称“3×3 网格”。原地转向本身常带来新信息，真正需要审查的是这些已重复的尾部。');
  loop.append(link('打开方形三圈的实际轨迹 ↗','sft-compare.html#case=w202609214&mode=e2e&view=map&base=16&sft=16&sync=1'));
 }
 function tools(){
  const box=$('#tool-content');
  table(box,'SFT 投影点数被拒 · 每种模式 128 个运行',['模式','收到拒绝的运行','拒绝次数','连续 ≥2 次','连续 3 次'],['reader','e2e'].map(m=>{const x=data.tools[m+'_sft'];return [modeName(m),`${x.runs_with_observed_rejections}/128`,x.observed_rejections['Rejected: Provide 1..24 points'],x.runs_with_2_consecutive_observed_rejections,x.runs_with_3_consecutive_observed_rejections]}));
  const x=data.tool_extra.reader;
  paragraph(box,`固定观察模式中，连续三次投影都被拒的 ${x.all_rejected_count} 个世界平均 F1 为 ${pct(x.mean_f1_no_accepted_projection)}，其余 ${128-x.all_rejected_count} 个为 ${pct(x.mean_f1_other_runs)}（×100）。这是关联，不能预先承诺修复工具参数就会恢复分数。`);
  paragraph(box,'进一步逐字比较发现：Reader 6 个世界有 7 次被拒后原样重发；E2E 3 个世界有 3 次。这比“调用了工具”更直接暴露反馈利用问题。');
  paragraph(box,'证据帧也应单独评分：已匹配 GT 的 SFT 对象中，Reader 13/508、E2E 24/577 至少引用了一帧目标中心在相机后方的图像。这是几何筛查线索，不能当作完整幻觉率；下方满分地图案例另做了逐图核查。','caption');
 }
 function cross(){
  const x=data.cross,box=$('#cross-mode');paragraph(box,`两种模式的逐世界增益相关系数只有 r=${x.gain_correlation_pearson.toFixed(3)}。104 个世界两边都改善，但 7 个 E2E 改善、Reader 退化；另有 3 个方向相反。`);
  table(box,'增益方向交叉计数 · 行为 E2E，列为 Reader',['E2E ↓ / Reader →','提升','持平','退化'],[['win','提升'],['tie','持平'],['loss','退化']].map(([key,label])=>[label,...['win','tie','loss'].map(k=>x.direction_matrix_counts[key][k])]));
  const o=x.sft_mode_complementarity;
  paragraph(box,`SFT 在 E2E 的 3 个零分世界与 Reader 的 7 个零分世界没有重叠。用 GT 事后挑选每个世界两份现成输出中的较好者，均分为 ${pct(o.hindsight_oracle_mean)}，比 E2E 高 ${pct(o.hindsight_oracle_gain_over_e2e)} 分；这是样本内互补上界，不是可部署的路由成绩。`,'caption');
 }
 function cases(){
  const select=$('#case-select'),params=new URLSearchParams(location.search);
  data.cases.forEach((c,i)=>{const option=e('option',`${c.scene} · ${c.mode} · ${c.title}`);option.value=i;select.append(option)});
  const selected=data.cases.findIndex(c=>c.scene===params.get('case')&&c.mode===(params.get('mode')||'e2e'));if(selected>=0)select.value=selected;
  function render(update=false){
   const c=data.cases[+select.value],box=$('#case-detail');box.replaceChildren(e('h3',c.title));const score=e('div',undefined,'case-score');stat(score,`${c.scene} · ${modeName(c.mode)} · F1×100`,`${pct(c.base_f1)} → ${pct(c.sft_f1)}`);box.append(score);paragraph(box,c.finding);
   for(const q of c.quotes){const quote=e('blockquote');quote.append(e('div',`${q.arm.toUpperCase()} / ${q.call} · 保存的原文`, 'caption'),e('div',q.quote));box.append(quote)}
   if(c.scene==='w202609248'){
    const gallery=e('div',undefined,'evidence-gallery');
    for(const n of [1,7,8]){const f=e('figure');f.append(evidenceImage(`sft-analysis/conversation-evidence/w202609248-reader-frame-${n}.png`,{alt:`w202609248 reader 第 ${n} 帧原始输入`,eager:true}),e('figcaption',`第 ${n} 帧${n===1?' · 左侧可见椅子':' · 不支持椅子引用'}`));gallery.append(f)}box.append(gallery);
   }
   const links=e('div',undefined,'case-links');c.links.forEach(a=>links.append(link(a.label+' ↗',a.url)));box.append(links);
   if(update){const url=new URL(location.href);url.searchParams.set('case',c.scene);url.searchParams.set('mode',c.mode);url.hash='cases';history.replaceState(null,'',url)}
  }
  select.onchange=()=>render(true);render();
 }
 function precision(){
  const mode=$('#precision-mode').value,threshold=$('#threshold').value,rows=data.precision.filter(x=>x.mode===mode),readout=$('#precision-readout');readout.replaceChildren();
  rows.forEach(r=>stat(readout,`${r.arm.toUpperCase()} · F1×100 @ ${(+threshold).toFixed(2)}m`,pct(r.curve[threshold])));
  const base=rows.find(x=>x.arm==='base'),sft=rows.find(x=>x.arm==='sft');stat(readout,'SFT − Base（分）',signed(sft.curve[threshold]-base.curve[threshold]));
  const host=$('#precision-chart');host.replaceChildren();const ns='http://www.w3.org/2000/svg';
  const svg=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text!==undefined)n.textContent=text;return n};
  const chart=svg('svg',{viewBox:'0 0 720 345',role:'img','aria-label':`${modeName(mode)} 基于距离容差的 F1 曲线`});
  chart.append(svg('title',{},'Base 与 SFT：对象匹配容差敏感性'),svg('desc',{},'横轴匹配阈值，单位米；纵轴128世界宏平均对象F1，百分制。选择上方阈值可以查看准确数值。'));
  const X=v=>58+v/1.5*630,Y=v=>287-v*250;
  for(const tick of [0,.25,.5,.75,1]){chart.append(svg('line',{x1:58,y1:Y(tick),x2:688,y2:Y(tick),stroke:'#e1e8f0'}),svg('text',{x:45,y:Y(tick)+4,'text-anchor':'end',fill:'#6d8196','font-size':12},String(tick*100)))}
  for(const tick of [.1,.25,.5,.75,1,1.5]){chart.append(svg('text',{x:X(tick),y:310,'text-anchor':'middle',fill:'#6d8196','font-size':12},String(tick)))}
  chart.append(svg('text',{x:58,y:19,fill:'#60778d','font-size':12},'F1 ×100'),svg('text',{x:688,y:336,'text-anchor':'end',fill:'#60778d','font-size':12},'匹配距离阈值（m）'),svg('line',{x1:X(+threshold),x2:X(+threshold),y1:35,y2:287,stroke:'#a5b6c8','stroke-dasharray':'4 4'}));
  for(const r of rows){const color=r.arm==='base'?'#4b70b3':'#078071',values=Object.entries(r.curve).filter(([k])=>k!=='category_only').sort((a,b)=>+a[0]-+b[0]);chart.append(svg('polyline',{points:values.map(([k,v])=>`${X(+k)},${Y(v)}`).join(' '),fill:'none',stroke:color,'stroke-width':2.5}));for(const [k,v]of values){const point=svg('circle',{cx:X(+k),cy:Y(v),r:k===threshold?6:4,fill:color});point.append(svg('title',{},`${r.arm.toUpperCase()} @ ${k}m：${pct(v)}`));chart.append(point)}}
  host.append(chart);const legend=e('div',undefined,'legend');legend.append(e('span','Base'),e('span','SFT','sft'));host.append(legend);
  paragraph(host,'在最严格的 0.10m 检查下，SFT 仍高于 Base；但 E2E 绝对分数仅 9.85，Reader 仅 6.42。它说明相对进步与精细定位的绝对水平需要同时报告。','caption');
 }
 function transfer(){
  const t=data.transfer,box=$('#transfer-content');
  const labels={sft_exploration_failed:'SFT 探索失败',qa_nonfinish:'至少一方 QA 未正常结束',base_exploration_failed:'Base 探索失败',both_finished_parsed:'双方正常结束且可解析'};
  table(box,'全体 2,700 个配对问题的算术分解',['互斥分组','问题数','对总差值的贡献'],Object.entries(t.decomposition).map(([k,x])=>[labels[k],x.n,`${signed(x.full_denominator_contribution)} 分`]));
  paragraph(box,'先按探索失败分组；在双方探索成功的剩余问题中，再按 QA 状态分组。各组贡献使用同一个 2,700 分母，精确相加为 −7.96 分；这不是因果归因。','caption');
  table(box,'同一次部署中观测到的可靠性与成本',['指标','Base','SFT'],[['探索失败场景 / 100',t.diagnostics.base.zeroed_exploration_scenes,t.diagnostics.sft.zeroed_exploration_scenes],['未正常结束 / 失败请求',...['base','sft'].map(a=>`${t.diagnostics[a].non_stop_or_failed}/${t.diagnostics[a].transport_attempts}`)],['累计输出 tokens',...['base','sft'].map(a=>t.diagnostics[a].completion_tokens.toLocaleString('en-US'))],['每调用平均耗时（秒）',...['base','sft'].map(a=>t.diagnostics[a].mean_call_seconds.toFixed(2))]]);
  paragraph(box,'请求数口径含探索与问答，不等于上述配对问题分组。耗时受本次硬件、服务和并发影响，不作为受控速度基准。','caption');
  const tasks=[...t.tasks].sort((a,b)=>a.groups.both_finished_parsed.within_delta-b.groups.both_finished_parsed.within_delta);
  table($('#transfer-tasks'),'分任务：全量差值与“双方正常”子集并列',['任务','全量差值 / 300题','正常子集 n','子集 Base → SFT','子集差值'],tasks.map(x=>{const g=x.groups.both_finished_parsed;return [x.task,`${signed(x.total_delta)} 分`,g.n,`${pct(g.base)} → ${pct(g.sft)}`,`${signed(g.within_delta)} 分`]}));
  for(const x of t.evidence_cases){const p=e('article');p.append(e('h3',`Scene ${x.scene} · ${x.task}`));paragraph(p,x.question);paragraph(p,`标准答案：${JSON.stringify(x.gold.answer)}。Base ${pct(x.base.score)} → SFT ${pct(x.sft.score)}（官方题目分数 ×100）。`);for(const arm of ['base','sft']){const d=e('details');d.append(e('summary',`${arm.toUpperCase()} 的完整保存输出`),e('pre',x[arm].content,'raw-output'));p.append(d)}$('#transfer-evidence').append(p)}
 }
 function sources(){
  const files=[['汇总中文报告','research_findings_zh.md'],['配对统计细读','stats.md'],['行动轨迹细读','behavior.md'],['聊天与证据细读','conversation.md'],['页面完整数据','findings.json'],['统计原始明细','stats.json.gz'],['行为原始明细','behavior.json.gz'],['聊天原始明细','conversation.json.gz'],['定位复算明细','localization.json.gz'],['ToS 分解明细','transfer.json.gz'],['分析文件 SHA256','manifest.json'],['配对来源 SHA256','stats-source-hashes.json']];
  for(const [name,path] of files){const a=link(name,`sft-analysis/${path}`);a.download=path;$('#downloads').append(a)}
  $('#source-note').textContent='128 世界 × 2 模式 × Base/SFT = 512 份运行；3,229 次模型调用；3,603 张原始 PNG 的字节 SHA256 已核对。对象 F1 的复算与全部 512 份保存主分数一致；行为距离与全部 256 个 E2E 保存位移一致。详细 JSON 保留分母、案例、来源与限制。';
 }
 gain();behavior();tools();cross();cases();precision();transfer();sources();
 $('#gain-mode').onchange=gain;$('#behavior-scope').onchange=behavior;$('#precision-mode').onchange=precision;$('#threshold').onchange=precision;
 document.body.dataset.ready='true';
} catch(error) {
 const box=$('#error');box.hidden=false;box.append(e('span',`分析页载入失败：${error.message} `));const b=e('button','重新载入');b.onclick=()=>location.reload();box.append(b);console.error(error);
}
