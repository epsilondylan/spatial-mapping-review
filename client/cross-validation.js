const base='/cross-validation/';
const $=id=>document.getElementById(id);
const data=await fetch(base+'data.json').then(r=>r.json());
let current=null,version=0;
$('counts').textContent=Object.entries(data.counts).map(([k,v])=>`${k}: ${v}`).join(' · ')+' / 共 60 次计划调用';
if(data.supplement_no_thinking?.length){
 const card=document.createElement('section');card.className='card';const title=document.createElement('h2');title.textContent='补测：两次思考循环失败，关闭思考后如何？';card.append(title);
 const note=document.createElement('p');note.textContent='这是按失败案例选取的补测，不替换主基线。两次关闭思考的输出使用了约 0–1000 的坐标，与要求的 0–511 像素不符；原始得分和固定乘以 511/1000 后的诊断得分分别保留。';card.append(note);
 for(const row of data.supplement_no_thinking){const details=document.createElement('details'),summary=document.createElement('summary'),p=document.createElement('p'),a=document.createElement('a'),pre=document.createElement('pre');summary.textContent=row.id+` · ${row.status}`;const m=row.metrics||{},converted=row.diagnostic_if_coordinates_are_0_to_1000||{};p.textContent=`耗时 ${row.elapsed_seconds.toFixed(2)} 秒 · 类别 F1 ${m.category_f1?.toFixed(3)} · 原始边框 F1 ${m['bbox_f1_0.5']?.toFixed(3)} · 固定坐标单位转换后 ${converted['bbox_f1_0.5']?.toFixed(3)}`;a.href=base+'supplement_no_thinking/'+row.id+'/response.json';a.textContent='完整原始返回';a.target='_blank';pre.textContent=JSON.stringify(row.prediction,null,2);details.append(summary,p,a,pre);card.append(details);}
 $('counts').closest('.card').after(card);
}
const format=v=>typeof v==='number'?v.toFixed(3):'—';
function options(){
 const rows=data.rows.filter(r=>String(r.scene)===$('scene').value && r.kind===$('kind').value && r.donor===$('donor').value && r.reader===$('reader').value);
 $('task').replaceChildren(...rows.map(r=>{const o=document.createElement('option');o.value=r.id;o.textContent=(r.kind==='map'?`重复 ${r.repeat}`:`第 ${r.frames[0]} 帧`)+` · ${r.status}`;return o;}));render();
}
async function render(){
 const token=++version;current=data.rows.find(r=>r.id===$('task').value);if(!current)return;
 const row=current,bank=data.banks.find(b=>b.bank===row.bank),files=row.evidence_files||[];
 $('title').textContent=`${row.scene} · ${row.donor} 的轨迹 → ${row.reader} 读取`;
 $('status').textContent=`${row.status} · ${row.id}`+(row.elapsed_seconds?` · 耗时 ${row.elapsed_seconds.toFixed(1)} 秒`:'')+(row.error?` · ${row.error}`:'');
 const m=row.metrics||{},keys=row.kind==='map'?[['物体 F1','object_f1'],['关系召回','pair_recall'],['类别清单 F1','inventory_category_f1'],['未截断位置误差中位数 / m','diag_ungated_position_median']]:[['类别 F1','category_f1'],['类别 + IoU≥0.25 F1','bbox_f1_0.25'],['类别 + IoU≥0.5 F1','bbox_f1_0.5']];
 $('metrics').replaceChildren(...keys.map(([label,key])=>{const s=document.createElement('span');s.textContent=`${label}: ${format(m[key])}`;return s;}));
 $('assessment').textContent=row.status==='FAILED'?'本次没有通过严格完成/格式校验。原始返回仍完整保留；这类失败需要与成功回答中的识别或定位错误分开。'+(row.analysis_status==='FORMAT_NORMALIZED'?' 上方分数使用无需 GT 的确定性格式转换：根列表改为 objects，bbox_2d 改为 bbox。原始失败状态保留。':''):row.kind==='map'?'研究者核查重点：固定轨迹后，换读取模型是否改变得分；固定模型后，换轨迹是否改善结果。单个格子不能独立说明原因。':'研究者核查重点：漏检、错分类和边界框错误分别出现在哪里。可见像素少于 263 的实例不纳入参考，空视角需单独看待。';
 $('downloads').replaceChildren(...files.flatMap(name=>{const a=document.createElement('a');a.href=base+'results/'+row.id+'/'+name;a.textContent=name;a.target='_blank';return[a,document.createTextNode(' · ')];}));
 $('prompt').textContent=data.prompts[row.kind];
 const observations=row.frames.map(n=>bank.observations[n-1]);
 $('images').replaceChildren(...observations.map(o=>{const d=document.createElement('div'),a=document.createElement('a'),im=document.createElement('img'),p=document.createElement('p');a.href=base+'inputs/'+o.image;a.target='_blank';im.src=a.href;im.loading='lazy';im.alt=`第 ${o.receipt.frame} 帧原始 RGB`;a.append(im);p.textContent=`帧 ${o.receipt.frame}`+(row.kind==='map'?` · 转 ${o.receipt.requested_action.turn_deg}° / 移 ${o.receipt.requested_action.move_m} m · ${o.receipt.status}`:'');d.append(a,p);return d;}));
 $('receipts').textContent=row.kind==='map'?JSON.stringify(observations.map(o=>o.receipt),null,2):'单图测试未发送动作回执。';
 $('score-json').textContent=JSON.stringify({primary_metrics:m,...(row.requested_frame_assumption_metrics?{strict_status:row.status,declared_frame:row.declared_frame,sensitivity_only_assuming_requested_frame:row.requested_frame_assumption_metrics}:{} )},null,2);
 $('output').textContent='载入中…';$('reasoning').textContent='';$('reasoning-details').hidden=!files.includes('reasoning.txt');
 $('note').value=localStorage.getItem('cv0912:'+row.id)||'';$('saved').textContent='';
 const [output,reasoning,reference]=await Promise.all([files.includes('output.txt')?fetch(base+'results/'+row.id+'/output.txt').then(r=>r.text()):Promise.resolve('尚无完整返回。'),files.includes('reasoning.txt')?fetch(base+'results/'+row.id+'/reasoning.txt').then(r=>r.text()):Promise.resolve(''),fetch(base+row.bank+'_references.json').then(r=>r.json())]);
 if(token!==version)return;
 $('output').textContent=output;$('reasoning').textContent=reasoning;$('reference').textContent=JSON.stringify(row.kind==='map'?reference.map:reference.vision[String(row.frames[0])],null,2);
}
for(const id of ['scene','kind','donor','reader'])$(id).addEventListener('change',options);
$('task').addEventListener('change',render);
$('note').addEventListener('input',()=>{if(current){localStorage.setItem('cv0912:'+current.id,$('note').value);$('saved').textContent='已保存到当前浏览器';}});
$('export-notes').addEventListener('click',()=>{const notes={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('cv0912:'))notes[k]=localStorage.getItem(k);}const url=URL.createObjectURL(new Blob([JSON.stringify(notes,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='cross-validation-notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
options();
