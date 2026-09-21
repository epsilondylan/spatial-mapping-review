const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f = (v, digits=3) => Number.isFinite(v) ? v.toFixed(digits) : '—';
const signed = v => `${v >= 0 ? '+' : ''}${f(v)}`;
const NEW = 'full838_a_seed20260920';
const names = {base:'base · 原始模型', full128:'full128 · 旧 SFT', new:'new · 838 世界 SFT'};
const modes = {e2e:'端到端', reader:'固定观察 reader'};
const labels = {stool:'凳',trash_bin:'垃圾桶',floor_lamp:'落地灯',vase:'花瓶',plant:'植物',chair:'椅',table:'桌',bookshelf:'书架',cabinet:'柜',book:'书',printer:'打印机',sofa:'沙发',cup:'杯',suitcase:'行李箱'};
const table = (heads, rows, caption='') => `<div class="table-wrap"><table>${caption ? `<caption>${esc(caption)}</caption>` : ''}<thead><tr>${heads.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
let data, cases, quant, shortcuts;
const query = new URLSearchParams(location.search);
const pickScope = c => ({mode:c.id==='fixed_reader_gain'?'reader':'e2e', compare:['regression_vs_full128','repeated_deduplication'].includes(c.id)?'full128':'base'});

function renderSummary() {
  $('summary').innerHTML = data.summaries.map(s=>`<tr class="${s.arm==='new'?'new-row':''}"><td>${modes[s.mode]}</td><td>${names[s.arm]}</td><td>${f(s.mean_f1)}</td><td>${s.complete} / 128</td><td>${f(s.world_mean_precision)}</td><td>${f(s.world_mean_recall)}</td><td>${f(s.mean_f1_025)}</td><td>${f(s.mean_frames,1)}</td></tr>`).join('');
  const rows = ['base','full128',NEW].map(a=>{
    const s=quant.summaries.e2e[a], p=s.behavior.projection_receipts;
    return [names[a===NEW?'new':a],p.requested_operations,p.whole_operation_rejected,p.operations_with_any_point_error,p.operations_with_all_points_without_error,s.budget.worlds_at_16_frames,s.budget.worlds_at_4_readout_attempts];
  });
  $('quant-details').innerHTML = `<div class="mini-notes"><div><h3>更严格定位仍有收益</h3><p>new 在 0.25 / 0.50 / 0.75 米的 F1 为 <b>${['0.25','0.5','0.75'].map(t=>f(quant.summaries.e2e[NEW].threshold_curve[t])).join(' / ')}</b>。尺度越严格，尚存误差越明显。</p></div><div><h3>可用证据增加</h3><p>平均观察帧数从 base 的 9.2 到 new 的 15.4。new 有 78/128 世界用满 16 帧、106/128 用满 4 次读图调用；这是预算使用变化，不是收益归因。</p></div><div><h3>工具遵循并不完美</h3><p>new 有 63/128 端到端世界发生明确拒绝。相对 full128，投影请求多 86 次，但全部返回点未报错的调用只多 9 次。</p></div></div>${table(['端到端模型','投影请求','整批拒绝','含逐点错误','全部点未报错','用满16帧世界','用满4次读图世界'],rows,'更多使用工具 ≠ 更好遵循工具')}<p class="caption">每次投影按真实回执分为整批拒绝、返回点含错误、返回点全部未报错。未报错仅表示工具计算成功，不保证选点真在地面、物体类别正确或对象中心准确。完整 reader 中 new 的投影请求 377 次，其中整批拒绝 150 次。</p>`;
  const fam = quant.family_contrasts_ordinary_only.e2e[`${NEW}_minus_full128`];
  $('quant-details').insertAdjacentHTML('beforeend', `<details class="details"><summary>按布局家族展开 · 普通世界每家族12个</summary>${table(['布局家族','full128 F1','new F1','差值'],Object.entries(fam).map(([family,v])=>[esc(family),f(v.b_mean_f1),f(v.a_mean_f1),signed(v.difference_f1)]),'8个家族的事后描述')}<p class="caption">普通96世界中各家族平均差均为正，但每家族仅12个。未以该子组结果改变协议或选择模型，也不声称每家族都有独立确认性证据。</p></details>`);
  $('provenance').textContent = `原确认分析 SHA256 ${data.study.analysis_sha256} · 原训练 seed ${data.study.seed} · 机制复盘 2026-09-21`;
}

function renderContrast() {
  const [mode, arm] = $('contrast').value.split('/');
  const c = data.common.find(c=>c.mode===mode && c.comparator===arm);
  const q = quant.contrasts[mode][`${NEW}_minus_${arm}`];
  const ci = q.common_complete.f1_bootstrap.ci95_descriptive;
  $('common').innerHTML = `<span class="pill">事后 · 共同完成子集</span><h3 style="margin-top:12px">双方都完成的 ${c.n} 个世界</h3><p>${names[arm]}：${f(c.comparator_mean)} → new：${f(c.new_mean)}</p><strong class="big">${signed(c.difference)} F1</strong><p>描述性 95% 区间 [${f(ci[0])}, ${f(ci[1])}]</p><p>全部 128 世界中：new 胜 ${c.all_parent_wins}，平 ${c.all_parent_ties}，负 ${c.all_parent_losses}。</p><p class="caption">上方均值和区间只针对共同完成的 ${c.n} 个世界；胜平负与右图使用全部 128 世界。子集按完成结果筛选，区间未经多重比较校正，不能当作机制因果份额。</p>`;
  const x = v=>48+v*300, y=v=>335-v*285;
  const grid=[0,.25,.5,.75,1].map(t=>`<line x1="48" y1="${y(t)}" x2="348" y2="${y(t)}" stroke="#e1e6ed"/><line x1="${x(t)}" y1="50" x2="${x(t)}" y2="335" stroke="#e1e6ed"/><text x="37" y="${y(t)+4}" text-anchor="end">${t}</text><text x="${x(t)}" y="354" text-anchor="middle">${t}</text>`).join('');
  $('scatter').innerHTML=`<svg viewBox="0 0 390 390" role="img" aria-label="128父世界配对F1散点图" style="width:100%;font:10px sans-serif;fill:#5f6c7b">${grid}<line x1="48" y1="335" x2="348" y2="50" stroke="#8894a4" stroke-dasharray="5 4"/><text x="194" y="381" text-anchor="middle">${esc(arm)} F1@0.75m</text><text x="48" y="24">new F1@0.75m</text>${data.worlds.map(w=>{
    const a=w.outputs[mode][arm].primary_f1, b=w.outputs[mode].new.primary_f1;
    const attr=`data-world="${w.id}" tabindex="0" role="button" aria-label="${w.id}，对照${f(a)}，new ${f(b)}" fill="${w.split==='occlusion'?'#a06d30':'#315fbd'}" fill-opacity=".55" stroke="white" stroke-width=".7" style="cursor:pointer"`;
    return `<g ${attr}><title>${w.id} · ${w.family} · ${f(a)} → ${f(b)}</title>${w.split==='occlusion'?`<rect x="${x(a)-3.5}" y="${y(b)-3.5}" width="7" height="7"/>`:`<circle cx="${x(a)}" cy="${y(b)}" r="3.7"/>`}</g>`;
  }).join('')}</svg>`;
  $('scatter').querySelectorAll('[data-world]').forEach(el=>{
    const pick=()=>setWorld(el.dataset.world,mode,arm,true);
    el.addEventListener('click',pick);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}});
  });
}

function bounds(w, mode, arm) {
  const points=[{x:0,y:0},...w.gt,...w.outputs[mode][arm].prediction,...w.outputs[mode].new.prediction].filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  const span=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys),3)*1.25;
  const cx=(Math.max(...xs)+Math.min(...xs))/2,cy=(Math.max(...ys)+Math.min(...ys))/2;
  return {loX:cx-span/2,loY:cy-span/2,span};
}
function map(w,mode,arm,b) {
  const out=w.outputs[mode][arm], pred=out.prediction;
  const x=v=>42+((v-b.loX)/b.span)*330,y=v=>368-((v-b.loY)/b.span)*330;
  const gt=$('show-gt').checked;
  const step=b.span>14?4:b.span>7?2:1;
  let grid='';
  for(let t=Math.ceil(b.loX/step)*step;t<=b.loX+b.span;t+=step)grid+=`<line x1="${x(t)}" y1="38" x2="${x(t)}" y2="368" stroke="${t===0?'#a4afbb':'#e9edf1'}"/><text x="${x(t)}" y="385" text-anchor="middle">${t}</text>`;
  for(let t=Math.ceil(b.loY/step)*step;t<=b.loY+b.span;t+=step)grid+=`<line x1="42" y1="${y(t)}" x2="372" y2="${y(t)}" stroke="${t===0?'#a4afbb':'#e9edf1'}"/><text x="33" y="${y(t)+4}" text-anchor="end">${t}</text>`;
  const edges=gt?Object.entries(out.metrics?.matches||{}).map(([p,g])=>`<line x1="${x(pred[p].x)}" y1="${y(pred[p].y)}" x2="${x(w.gt[g].x)}" y2="${y(w.gt[g].y)}" stroke="#9bafc9" stroke-width="1.5"/>`).join(''):'';
  const gtDots=gt?w.gt.map((p,i)=>`<g><title>GT ${esc(p.id)} ${esc(p.category)} (${f(p.x,2)}, ${f(p.y,2)})</title><circle cx="${x(p.x)}" cy="${y(p.y)}" r="6" fill="white" stroke="#6d7885" stroke-width="1.5"/><text x="${x(p.x)+8}" y="${y(p.y)-7}" font-size="8" fill="#687483">${i+1}.${esc(labels[p.category]||p.category)}</text></g>`).join(''):'';
  const dots=pred.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)).map((p,i)=>`<g><title>预测 ${esc(p.id)} ${esc(p.category)} (${f(p.x,2)}, ${f(p.y,2)})；证据帧 ${esc((p.evidence||[]).join(', '))}</title><circle cx="${x(p.x)}" cy="${y(p.y)}" r="3.5" fill="#315fbd" stroke="white" stroke-width=".8"/><text x="${x(p.x)+6}" y="${y(p.y)+11}" fill="#315fbd" font-size="8">P${i+1}.${esc(labels[p.category]||p.category)}</text></g>`).join('');
  return `<article class="map-panel"><div class="map-title"><span>${names[arm]}</span><strong>F1 ${f(out.primary_f1)}</strong></div><svg viewBox="0 0 410 412" role="img" aria-label="${esc(w.id)} ${arm}预测与GT地图" style="font:10px sans-serif;fill:#6b7683">${grid}<text x="210" y="405" text-anchor="middle">x / 米 · 初始相机右方</text><text x="42" y="20">y / 米 · 初始相机前方</text>${edges}${gtDots}${dots}<path d="M${x(0)},${y(0)-5} l-4,9 h8 z" fill="#172332"><title>初始相机 (0,0)，朝 +y</title></path></svg><div class="map-foot">${out.status==='COMPLETE'?'已完成':'未完成 · 按协议计零'} · ${out.frames} 帧 · F1@0.25m ${f(out.metrics_025?.object_f1||0)}<br>精度 ${f(out.metrics?.object_precision||0)} · 召回 ${f(out.metrics?.object_recall||0)} · 匹配 ${out.metrics?.matched||0}/${w.gt.length}${out.error?`<br>${esc(out.error)}`:''}</div></article>`;
}

function setWorld(id,mode,compare,scroll=false) {
  $('world').value=id;$('mode').value=mode;$('comparator').value=compare;
  renderWorld();
  if(scroll)$('cases').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
}
function renderWorld() {
  const mode=$('mode').value;
  $('comparator').querySelector('[value="full128"]').disabled=mode==='reader';
  if(mode==='reader')$('comparator').value='base';
  const arm=$('comparator').value,w=data.worlds.find(w=>w.id===$('world').value),b=bounds(w,mode,arm);
  const c=cases.cases.find(c=>c.world===w.id), scope=c?pickScope(c):null;
  const matchedScope=c && scope.mode===mode && scope.compare===arm;
  $('maps').innerHTML=map(w,mode,arm,b)+map(w,mode,'new',b);
  $('case-picks').querySelectorAll('button').forEach(el=>{el.classList.toggle('active',el.dataset.world===w.id);el.setAttribute('aria-pressed',String(el.dataset.world===w.id));});
  $('case-narrative').innerHTML=c?`<article class="case-narrative"><span class="pill">${esc(w.id)} · ${esc(w.family)}</span><h3>${esc(c.title)}</h3><p class="rule">选例规则：${esc(c.selection_rule)} · 候选 ${c.eligible_count} 个</p>${matchedScope?'':`<p class="notice">以下解读针对 ${modes[scope.mode]} / new 对 ${scope.compare}；当前地图是 ${modes[mode]} / new 对 ${arm}。<button id="restore-scope">切回案例比较</button></p>`}<ul>${c.observed_facts.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><p><b>解释：</b>${esc(c.interpretation)}</p><p class="caption"><b>不能推出：</b>${c.cannot_infer.map(esc).join('；')}</p></article>`:`<article class="case-narrative"><span class="pill">${esc(w.id)} · ${esc(w.family)}</span><h3>完整父世界浏览</h3><p>此世界保留在全样本结果中，未被选为深读案例。地图、正式分数与逐对象记录均来自封存输出。</p></article>`;
  $('restore-scope')?.addEventListener('click',()=>setWorld(w.id,scope.mode,scope.compare));
  if(c){
    $('case-evidence').innerHTML=`<div class="case-evidence"><h3>原始观察帧 <span class="pill">${modes[scope.mode]} · ${scope.mode==='reader'?'双方公共输入':'new 实际采集'}</span></h3><p class="caption">点击查看原始 512 × 512 RGB。展示帧经过事后选取，不是模型全部输入；SHA 与封存原图一致。</p><div class="gallery">${c.media.map((m,i)=>`<figure><button class="open-image" data-index="${i}" aria-label="打开${w.id}第${m.frame}帧原图"><img src="${esc(m.local)}" alt="${esc(w.id)} ${modes[m.mode]} 第${m.frame}帧" loading="lazy" width="512" height="512"></button><figcaption>${modes[m.mode]} · ${esc(m.arm)} · 第 ${m.frame} 帧<br>SHA ${m.sha256.slice(0,12)}…${c.pixel_audit?.frames.find(p=>p.frame===m.frame) ? `<br>遮挡目标：${c.pixel_audit.frames.find(p=>p.frame===m.frame).pixels} 分割像素（评测侧）` : ''}</figcaption></figure>`).join('')}</div><div class="quotes">${c.critical_turns.map(q=>`<blockquote><b>${modes[q.mode]} / ${esc(q.arm)} / ${esc(q.call)}</b><pre>${esc(q.quote)}</pre><cite>实际输出摘录 · content.txt 第 ${q.source_line} 行<br>SHA ${q.sha256.slice(0,16)}…</cite></blockquote>`).join('')}</div><p class="caption">模型文字不是观察真值，也不证明其内部推理正确。<a href="${esc(c.evidence_file)}" download>下载本例完整公共历史与调用 JSON</a> · <a href="methods/occlusion_pixel_audit.json">遮挡像素审计</a></p></div>`;
    $('case-evidence').querySelectorAll('.open-image').forEach(el=>el.addEventListener('click',()=>{
      const m=c.media[Number(el.dataset.index)];$('large-image').src=m.local;$('large-image').alt=`${w.id} ${modes[m.mode]} 第${m.frame}帧原图`;
      $('large-caption').textContent=`${w.id} · ${modes[m.mode]} · ${m.arm} · frame ${m.frame}。SHA256 ${m.sha256}`;$('image-dialog').showModal();
    }));
  } else $('case-evidence').innerHTML='';
  $('object-table').innerHTML=[...( $('show-gt').checked ? [['GT',w.gt]]:[]),[arm,w.outputs[mode][arm].prediction],['new',w.outputs[mode].new.prediction]].map(([a,objs])=>table(['对象','类别','x / m','y / m','证据帧'],objs.map((p,i)=>[`${a==='GT'?'':'P'}${i+1} · ${esc(p.id)}`,esc(p.category),f(p.x,3),f(p.y,3),esc((p.evidence||[]).join(', ')||'—')]),a==='GT'?'评测参考 · 非模型输入':names[a])).join('');
  const params=new URLSearchParams({world:w.id,mode,compare:arm});history.replaceState(null,'',`${location.pathname}?${params}${location.hash}`);
}

function auditItem(title,status,body,basis) { return `<article class="audit-item"><div><h3>${title}</h3><span class="pill ${status.includes('疑点')?'warn':''}">${status}</span></div><div>${body}<p class="basis">${basis}</p></div></article>`; }
function renderShortcuts() {
  const s=shortcuts.analysis, swap=s.offline_cross_world_swap[`e2e/${NEW}`], prior=s.training_prior_controls;
  const oracle=shortcuts.aligned_training_oracle;
  const shuffle=s.coordinate_category_assignment_shuffle[`e2e/${NEW}`].score.all.mean;
  const controls=[['new 原正式预测',.724847109388397,'实际模型输出'],['别的测试世界地图，全部供体',swap['egocentric/all'].score.all.mean,'保存输出的离线替换'],['同分层、同家族测试世界地图',swap['egocentric/stratum_and_family'].score.all.mean,'使用私有分层与家族筛供体'],['训练输出拟合的全局坐标热点',prior.global_training_hotspot.score.all.mean,'仅训练数据拟合的固定先验'],['保留 new 类别数量，换成训练坐标热点',prior[`replace_coordinates/e2e/${NEW}`].score.all.mean,'保留模型类别，替换坐标'],['保留点云和类别总数，打乱配对',shuffle,'200次/父世界，离线输出置换'],['最有利的整张训练地图 + 8种对称变换',oracle.mean_f1,'GT选最优；真位姿与房间尺寸辅助的 oracle']];
  $('shortcut-findings').innerHTML=`<div class="audit-list">${auditItem('只是学会 finish？','解释受到削弱','<p>完成率提高确实贡献了总分；但共同完成的 95 个端到端世界仍提升 +0.481，101 个 reader 世界仍提升 +0.394。固定 reader 案例 w202609209 两模型都交出正确类别和数量，匹配却从 0/5 到 5/5。</p>','这些结果支持完成之外的改善；共同完成筛选与固定 reader 都不能进一步区分图像、位姿和工具各自的因果贡献。')}${auditItem('固定扫描套路？','强行为证据','<p>new 在 127/128 世界以 <b>3 ×（转向 +90°、不移动）</b>开场；训练示范中这一动作占 593/838。base 首动作有 25 种，new 只有 2 种。</p><p>整段采集请求序列有 91 种（包含首请求及被拒操作）。更像是学到一个高度稳定的开场策略，不能说整条轨迹固定，也不能仅因模板化就认定它有害。</p>','按实际发出的动作参数归一化统计，去掉备注和整数/浮点书写差异。三次原地转向配合初始帧形成四方向扫描。请求序列多样性不等于实际执行轨迹多样性。')}${auditItem('无视场景，只背地图？','简单版本受到削弱',`<p>异世界地图和训练热点得分很低。即使让测试 GT 从 838 张训练地图 × 8 种对称变换中挑最有利的一张，并给出真实位姿与房间尺度，平均也只有 <b>${f(oracle.mean_f1)}</b>，低于 new 的 0.725。</p><p>这约束了“整张地图经过简单缩放、旋转后复述”的解释，不能排除部件记忆、复杂变形、资产识别捷径或图像与先验混合。</p>`,'全部都是离线评分控制；不是把模型输入图像打乱后重新推理。oracle 使用测试答案选择，是特意放宽的信息条件，不是可部署基线。')}${auditItem('弱视觉 + 先验补全？','保留疑点','<p>w202619226 的目标 plant 仅在 3 帧各占 6 个分割像素，而且这 3 张 RGB 完全相同。预测误差 0.674 米，在 0.75 米阈值匹配，在 0.25 米不匹配。</p><p>这例不能作为可靠的遮挡恢复证据；也不能直接叫“无图猜中”：6 像素并非零可见。相对地，w202619206 的 table 从 56 像素到 3643 像素，最终误差约 0.070 米，证据更直接。</p>','observed=false 只说明所有帧都未达到263分割像素，不等于完全不可见。像素数量与 bbox 来自评测侧分割，不是提供给模型的信息。')}${auditItem('工具调用带来的收益？','行为改善伴随错误','<p>工具链利用更频繁且产生更多可用回执，但参数遵循并未全面改善。w202619205 连续提交 78、28、25 个投影点，三次都超过 24 点上限，最后完整输出仍为零分。</p>','投影回执无错误不代表选点符合几何假设。new 的128/128完成是输出可靠性指标，不是语义或工具正确率。')}</div><div class="matrix">${table(['端到端对象 F1@0.75m 的离线对照','平均 F1','信息条件'],controls.map(([a,v,i])=>[a,f(v,4),i]),'只检验具体简单解释，不将离线控制等同于真实输入消融')}<p class="caption">所有数值按 128 父世界等权平均。异世界替换穷举合格供体并先在每个目标世界内平均；打乱类别—坐标配对保留点云与类别数量，允许原排列与重复类别。最后一行共计 858,112 次地图评分，是使用答案的最优检索 oracle。以上均事后探索，0 次新模型调用。</p></div>`;
}

async function start() {
  [data,cases,quant,shortcuts]=await Promise.all(['data.json','cases.json','quant.json','shortcuts.json'].map(async file=>{const r=await fetch(file);if(!r.ok)throw new Error(`${file}: ${r.status}`);return r.json();}));
  if(data.worlds.length!==128||cases.cases.length!==8)throw new Error('数据完整性检查失败');
  $('world').innerHTML=data.worlds.map(w=>`<option value="${w.id}">${w.id} · ${esc(w.family)}${w.split==='occlusion'?' · 遮挡':''}</option>`).join('');
  const shortTitles=['完成救回','共同完成：定位','重复物体：去重','相同画面：reader','退化：类别漂移','遮挡：真实恢复','可见但失败','6像素：弱证据命中'];
  $('case-picks').innerHTML=cases.cases.map((c,i)=>`<button data-world="${c.world}">${shortTitles[i]}<small>${c.world}</small></button>`).join('');
  $('case-picks').querySelectorAll('button').forEach(el=>el.addEventListener('click',()=>{const c=cases.cases.find(c=>c.world===el.dataset.world),p=pickScope(c);setWorld(c.world,p.mode,p.compare);}));
  $('contrast').addEventListener('change',renderContrast);
  ['world','mode','comparator','show-gt'].forEach(id=>$(id).addEventListener('change',renderWorld));
  $('close-image').addEventListener('click',()=>$('image-dialog').close());
  renderSummary();renderContrast();renderShortcuts();
  const world=data.worlds.some(w=>w.id===query.get('world'))?query.get('world'):'w202609209';
  const defaults=pickScope(cases.cases.find(c=>c.world===world)||{});
  setWorld(world,['e2e','reader'].includes(query.get('mode'))?query.get('mode'):defaults.mode,['base','full128'].includes(query.get('compare'))?query.get('compare'):defaults.compare);
  document.documentElement.dataset.ready='true';
}
start().catch(err=>{$('error').hidden=false;$('error').textContent=`页面数据未能完整载入：${err.message}。请刷新后重试。`;console.error(err);});
