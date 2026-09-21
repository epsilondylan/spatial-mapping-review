"""Rebuild post-hoc case selection and sanitized evidence from immutable evaluation.
No model calls, training, renderer execution, network access, or source mutations.
Run from the project root with Python 3. Pixel and RGB audits are read-only copies
prepared separately; their source identities are relative to the sealed EVAL root.
"""
from pathlib import Path
import json, math, hashlib, re
ROOT=Path('outputs/final_evaluation_evidence_v1/a_single_seed_20260920')
OUT=Path('outputs/sft_followup_20260921/cases'); OUT.mkdir(parents=True,exist_ok=True)
NEW='full838_a_seed20260920'
MODES=[('e2e','base'),('e2e','full128'),('e2e',NEW),('reader','base'),('reader',NEW)]
def read(p): return json.loads(p.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def rel(p): return str(p.relative_to(ROOT))
def state(w,m='e2e',a=NEW): return read(ROOT/'results'/m/a/w/'status.json')
def pred(w,m='e2e',a=NEW):
 p=ROOT/'results'/m/a/w/'prediction.json'; return read(p) if p.exists() else None
worlds=sorted(p.name for p in (ROOT/'results/e2e'/NEW).iterdir() if p.is_dir())
def close_pairs(objects):
 return [{'a':a['id'],'b':b['id'],'distance_m':math.hypot(a['x']-b['x'],a['y']-b['y'])} for i,a in enumerate(objects) for b in objects[i+1:] if a['category']==b['category'] and a.get('x') is not None and b.get('x') is not None and math.hypot(a['x']-b['x'],a['y']-b['y'])<.25]
def select(filter_fn,key):
 c=sorted([w for w in worlds if filter_fn(w)],key=key); return c[0],c
# Rules were defined after seeing outcomes; all ties break lexicographically.
rules=[
 ('completion_rescue', 'base端到端失败、new完成；按new F1降序、world ID升序',lambda w:state(w,a='base')['status']!='COMPLETE' and state(w)['status']=='COMPLETE',lambda w:(-state(w)['primary_f1'],w)),
 ('completed_localization_relation','base与new端到端均完成；按new-base F1差降序、ID升序',lambda w:state(w,a='base')['status']=='COMPLETE',lambda w:(-(state(w)['primary_f1']-state(w,a='base')['primary_f1']),w)),
 ('repeated_deduplication','repeated且full128存在同类别预测距离<0.25m的近重合对而new没有；按近重合对减少数降序、ID升序',lambda w:state(w)['family']=='repeated' and pred(w,a='full128') is not None and len(close_pairs(pred(w,a='full128')['objects']))>len(close_pairs(pred(w)['objects'])),lambda w:(-(len(close_pairs(pred(w,a='full128')['objects']))-len(close_pairs(pred(w)['objects']))),w)),
 ('fixed_reader_gain','base与new reader均完成；按new-base reader F1差降序、ID升序',lambda w:state(w,'reader','base')['status']=='COMPLETE',lambda w:(-(state(w,'reader')['primary_f1']-state(w,'reader','base')['primary_f1']),w)),
 ('regression_vs_full128','full128与new端到端均完成；按new-full128 F1差升序、ID升序',lambda w:state(w,a='full128')['status']=='COMPLETE',lambda w:(state(w)['primary_f1']-state(w,a='full128')['primary_f1'],w)),
 ('occlusion_success','物理遮挡组new observed=true且matched=true；按new F1降序、ID升序',lambda w:state(w).get('hidden_target')=={'observed':True,'matched':True},lambda w:(-state(w)['primary_f1'],w)),
 ('occlusion_observed_failure','物理遮挡组new observed=true且matched=false；按new F1升序、ID升序',lambda w:state(w).get('hidden_target')=={'observed':True,'matched':False},lambda w:(state(w)['primary_f1'],w)),
 ('weak_evidence_match','物理遮挡组new observed=false且matched=true；按ID升序',lambda w:state(w).get('hidden_target')=={'observed':False,'matched':True},lambda w:w),
]
selected=[]
for code,rule,f,k in rules:
 w,pool=select(f,k);selected.append({'id':code,'world':w,'selection_rule':rule,'eligible_count':len(pool),'ranked_candidates':pool})
assert [v['world'] for v in selected]==['w202609200','w202609222','w202609250','w202609209','w202609208','w202619206','w202619205','w202619226']
notes={
 'w202609200':{
  'title':'完成救回：停止像素坐标循环，最终交出地图',
  'observed_facts':['base readout_00输出越界像素并反复自我纠正；原始meta记录4096 completion tokens与finish_reason=length，端到端计零。','new完成4/4对象匹配，full128为3/4；new在0.25m阈值仍只有2/4，并非精确定位已经解决。','new有16帧、full128有13帧、base有5帧；端到端差异同时包含采集证据与输出行为变化。'],
  'interpretation':'本例最直接支持格式、尺度使用和终止可靠性改善，同时最终地图质量提高。',
  'cannot_infer':['不能把全部F1差归于视觉识别：base没有有效最终地图。','不能由模型所称all four或triangulation证明其推理过程正确。'],
  'quotes':[('e2e','base','readout_00_0','Stool: u=230, v=700 is wrong.'),('e2e',NEW,'readout_03_0','"id":"floor_lamp_1","category":"floor_lamp","x":4.7,"y":-1.58')],
 },
 'w202609222':{
  'title':'共同完成仍提升：初始坐标系、遗漏实例与关系',
  'observed_facts':['base已完成且提交7对象，但0/8匹配；new提交8对象并8/8匹配。','base遗漏chair；其plant=(1,-1.5)与GT=(-3.838,-4.939)相差5.935m，new=(-3.5,-4.6)，相差0.479m。','封存pair scorer的正确关系数从base 0/21、full128 16/21到new 20/21；这是坐标派生的关系评分。','new在0.25m阈值F1=0.375，说明0.75m全对仍掩盖厘米级到分米级误差。'],
  'interpretation':'完成格式以外，实例召回和坐标/方向使用也发生了实质改善。',
  'cannot_infer':['不能由此独立分解识别、几何、视角的因果贡献。','关系分数由定位匹配及坐标派生，不是独立的语言关系推理测验。'],
  'quotes':[('e2e','base','readout_02_0','"id":"plant_1","category":"plant","x":1.0,"y":-1.5'),('e2e',NEW,'readout_03_0','"id":"plant_1","category":"plant","x":-3.5,"y":-4.6'),('e2e',NEW,'readout_03_0','"id":"chair_1","category":"chair","x":0.7,"y":-1.9')],
 },
 'w202609250':{
  'title':'重复实例：修正近重合花瓶，同时找回远处花瓶和第二盆植物',
  'observed_facts':['GT为2 chair、2 vase、2 plant；full128提交5对象，其中两个vase位置仅相距0.102m，两者都接近同一个GT花瓶。','new提交6对象并6/6匹配，两个vase分别接近两个不同GT；对象F1由full128 0.727至1.000，pair F1由0.4至1.0。','更严格0.25m F1反而由full128 0.727降至new 0.5；new获得完整性时，没有逐对象一致提高精度。'],
  'interpretation':'本例支持跨视角实例区分/去重和遗漏恢复，但只能观察最终身份对应，不能直接测出内部跟踪能力。',
  'cannot_infer':['两个近重合预测是可复算的重复疑点，单靠数量规则不能普遍判断所有重复。','new多采集了4帧，不能把收益全部归于同一证据上的读图。'],
  'quotes':[('e2e','full128','readout_02_0','"id":"blue_vase_1","category":"vase","x":-2.49,"y":-1.51'),('e2e','full128','readout_02_0','"id":"blue_vase_2","category":"vase","x":-2.39,"y":-1.49'),('e2e',NEW,'readout_03_0','"id":"blue_vase_2","category":"vase","x":-5.02,"y":4.81')],
 },
 'w202609209':{
  'title':'固定reader：相同16帧，类别数量相同，定位从全错到全匹配',
  'observed_facts':['base与new首次reader请求SHA完全一致，均16帧、4次读图调用；两者最后均提交正确的5种类别各1个。','base 0/5匹配，new 5/5匹配；例如bookshelf由(1.78,-4.03)改为(5.13,-2.54)，GT=(5.708,-2.740)。','base先尝试越界像素，随后修正并使用projection工具，但最终坐标仍错；new对多帧多个底角选点。','0.25m F1仅从0到0.2，pair F1从0到0.875。'],
  'interpretation':'该固定输入案例排除了本次对照中的主动采集差异和有效完成差异，支持读出链路中选点/几何/坐标汇总的改善。',
  'cannot_infer':['不能据此证明通用视觉理解，投影工具已提供几何变换。','reader后续工具输入与回执由模型选择，因此仅首次公共观察固定，整个工具对话并不相同。'],
  'quotes':[('reader','base','readout_03_0','"id":"bookshelf_1","category":"bookshelf","x":1.78,"y":-4.03'),('reader',NEW,'readout_03_0','"id":"bookshelf_1","category":"bookshelf","x":5.13,"y":-2.54'),('reader',NEW,'readout_00_0','{"frame":4,"u":144,"v":373,"label":"stool_leg_left"}')],
 },
 'w202609208':{
  'title':'最大退化：几何接近，类别却从book/cabinet改错',
  'observed_facts':['full128端到端F1=1，new=1/3，差-2/3为共同完成世界最严重退化。','new acquisition末尾称stool/book/cabinet，最终readout改成stool/floor_lamp/bookshelf；采集历史在readout前按协议被公共重放替换，因此是两阶段输出不一致。','new的floor_lamp点与GT book中心只差0.021m；bookshelf点与GT cabinet中心只差0.249m，因类别错而不匹配。','实际f4图像中紫色目标为窄竖板，看不到最终文本声称的conical shade；这支持输出描述错误，无法证明模型内部看到了什么。'],
  'interpretation':'SFT收益不是单调且不是统一的空间理解改善；语义识别/读出可在准确几何附近仍失败。',
  'cannot_infer':['不能把最终自信描述当成视觉观察事实。','不能由单例判断整个模型依赖了某一种固定语义shortcut。'],
  'quotes':[('e2e',NEW,'acquire_05_0','All objects (stool, book, and cabinet) have been identified and located.'),('e2e',NEW,'readout_03_0','a floor lamp with a conical shade and pole'),('e2e',NEW,'readout_03_0','"id":"floor_lamp_1","category":"floor_lamp","x":-6.38,"y":-0.19')],
 },
 'w202619206':{
  'title':'可信遮挡成功：目标面积增加，桌子定位准确',
  'observed_facts':['隐藏目标是table o4；new轨迹f1只有56目标像素，f8为3643、f13为3474，跨过263像素观测阈值。','new最终table=(-3.67,3.03)，GT=(-3.690,3.097)，误差0.070m；引用证据正是[8,13]。','base也观测到隐藏目标但未匹配；full128也成功恢复目标。new整体F1=1，相比full128=0.8的额外提升还包括bookshelf类别修正。','固定reader new F1=0.5，缺少隐藏桌子的有效观察，与主动轨迹证据差异一致。'],
  'interpretation':'这是实测视角变化带来目标大面积显露、随后准确定位的正证据，比finalize自述更有说服力。',
  'cannot_infer':['无法证明这些动作是针对遮挡的自适应策略；其旋转/前进模板也可能碰巧提供合适视角。','同世界e2e-reader差不是策略与读图的严格因果分解。'],
  'quotes':[('e2e',NEW,'acquire_01_0','{"op":"step_sequence","steps":[{"turn_deg":90,"move_m":0.75},{"turn_deg":0,"move_m":0.75},{"turn_deg":0,"move_m":0.75}]}'),('e2e',NEW,'readout_03_0','"id":"table_1","category":"table","x":-3.67,"y":3.03,"evidence":[8,13]')],
 },
 'w202619205':{
  'title':'看到了仍失败：连续超量投影被拒，完成后全错',
  'observed_facts':['隐藏printer o5在new f10/f14各1989像素，且private diagnostics为9/9 GT实例曾达到观测阈值。','new前三次readout依次发78、28、25个project_ground点，三次公共回执均为Rejected: Provide 1..24 points。','最后一次readout仍提交9对象；类别多重集合与GT一致，但0/9定位匹配，F1=0。printer预测(-0.5,-2)距其GT约4.583m。','同世界new reader F1=0.667，端到端new却0，说明更多/主动图像不保证更好的读出。'],
  'interpretation':'这是一条可以明确定位的工具协议失败链：没有成功投影结果，随后给出错误地图；同时说明100%完成率不等于100%工具可靠或空间正确。',
  'cannot_infer':['不能证明若三次工具调用合法便一定成功；这是未做的反事实。','不能把9类别正确看作9位置正确。'],
  'quotes':[('e2e',NEW,'readout_03_0','"id":"printer_1","category":"printer","x":-0.5,"y":-2.0'),('e2e',NEW,'acquire_06_0','located with sufficient parallax and multi-view evidence.')],
 },
 'w202619226':{
  'title':'弱证据命中：6像素plant落入宽阈值，保留shortcut疑点',
  'observed_facts':['new hidden_target observed=false且matched=true；逐帧分割复核仅f8/f10/f14各6目标像素，其余13帧为0。','6像素位于[73,281,74,284]，模型在f8选plant_base=(75,325)，可见目标没有提供可核验的地面接触点。','模型最终plant=(-4.03,4.58)，GT=(-4.145,5.244)，误差0.674m；在0.75m匹配、0.25m不匹配。','f8/f10/f14三张RGB字节完全相同，模型引用[8,10,14]不是3个独立视角；画面主要是近景书架。'],
  'interpretation':'该命中可由极少视觉线索、资产先验、近似投影与宽阈值共同解释，是需要干预实验的shortcut疑点，不能作为可靠遮挡恢复证据。',
  'cannot_infer':['observed=false不等于零可见像素；这里明确有6像素。','不能从该例证明训练泄漏、作弊或完全不读图；也不能因为得分高便宣称可靠理解遮挡对象。'],
  'quotes':[('e2e',NEW,'readout_00_0','{"frame":8,"label":"plant_base","u":75,"v":325}'),('e2e',NEW,'readout_03_0','"id":"plant_1","category":"plant","x":-4.03,"y":4.58,"evidence":[8,10,14]')],
 },
}
def operation(t):
 for m in re.finditer(r'\{',t):
  try:d,_=json.JSONDecoder().raw_decode(t[m.start():])
  except (ValueError,TypeError):continue
  if isinstance(d,dict) and 'op' in d:return d
 return None
def raw_content(path):
 t=path.read_text();out=[]
 for line in t.splitlines():
  if line.startswith('data: '):
   try:d=json.loads(line[6:])
   except ValueError:continue
   for c in d.get('choices',[]):
    x=c.get('delta',{}).get('content');
    if x:out.append(x)
 return ''.join(out)
media=read(OUT/'media_manifest.json')['images']
pixels={v['world']:v for v in read(OUT/'occlusion_pixel_audit.json')['worlds']}
(OUT/'evidence').mkdir(exist_ok=True)
cases=[];raw_checks=[]
for selection in selected:
 w=selection['world'];note=notes[w];gtp=ROOT/'scenes'/w/'private/gt.json';gt=read(gtp);audit=read(ROOT/'scenes'/w/'private/audit.json'); outcomes=[]; transcripts=[]
 for mode,arm in MODES:
  p=ROOT/'results'/mode/arm/w;s=state(w,mode,arm);pr=pred(w,mode,arm);ph=p/'phases.json';phases=read(ph) if ph.exists() else {};calls=[]
  for cp in sorted((p/'calls').iterdir()):
   if not cp.is_dir():continue
   content=cp/'content.txt';raw=cp/'response.raw';meta=cp/'meta.json';t=content.read_text() if content.exists() else '';mt=read(meta);op=operation(t)
   rc=raw_content(raw) if raw.exists() else None
   raw_checks.append({'world':w,'mode':mode,'arm':arm,'call':cp.name,'sse_content_exact':rc==t,'sse_content_trimmed':rc.strip()==t.strip() if rc is not None else False})
   cm={'id':cp.name,'source_directory':rel(cp),'content':t,'parsed_first_operation':op,'meta':{k:mt.get(k) for k in ['status','seconds','usage','finish_reason','error']},'source_hashes':{f.name:sha(f) for f in [content,raw,meta] if f.exists()}}
   calls.append(cm)
  rejections=[];receipts=[]
  for phase,messages in phases.items():
   for i,msg in enumerate(messages):
    if msg.get('role')=='user' and isinstance(msg.get('content'),list):
     for block in msg['content']:
      t=block.get('text','')
      if t.startswith('Rejected:') or '"error"' in t:rejections.append({'phase':phase,'message_index':i,'text':t})
      if t.startswith('{"points":'):receipts.append({'phase':phase,'message_index':i,'text':t})
  objects=[]
  for ob in (pr or {}).get('objects',[]):
   row=dict(ob)
   if ob.get('x') is not None and ob.get('y') is not None:
    near=min(gt['objects'],key=lambda g:math.hypot(ob['x']-g['x'],ob['y']-g['y']))
    row['nearest_gt_ignoring_category']={'id':near['id'],'category':near['category'],'distance_m':math.hypot(ob['x']-near['x'],ob['y']-near['y'])}
   objects.append(row)
  outcomes.append({'mode':mode,'arm':'new' if arm==NEW else arm,'archive_arm':arm,'status':s['status'],'f1':s['primary_f1'],'f1_025':s.get('metrics_025',{}).get('object_f1',0),'metrics':s.get('metrics'),'metrics_025':s.get('metrics_025'),'frames':s.get('frames'),'calls':s.get('calls'),'metered_request_attempts':s.get('metered_request_attempts'),'failure_classification':s.get('failure_classification'),'hidden_target':s.get('hidden_target'),'private_diagnostics':s.get('private_diagnostics'),'initial_request_messages_sha256':s.get('initial_request_messages_sha256'),'prediction':pr,'prediction_diagnostics':objects,'near_coincident_same_category_pairs_under_025m':close_pairs((pr or {}).get('objects',[])),'rejections':rejections,'source_directory':rel(p),'source_hashes':{f.name:sha(f) for f in [p/'status.json',p/'prediction.json',ph] if f.exists()},'readout_operations':[{'call':v['id'],'op':v['parsed_first_operation'].get('op') if v['parsed_first_operation'] else None,'point_count':len(v['parsed_first_operation'].get('points',[])) if v['parsed_first_operation'] else None} for v in calls if v['id'].startswith('readout')]})
  transcripts.append({'mode':mode,'arm':'new' if arm==NEW else arm,'calls':calls,'public_request_history':phases})
 key=[]
 for mode,arm,call,quote in note['quotes']:
  p=ROOT/'results'/mode/arm/w/'calls'/call/'content.txt';t=p.read_text();assert quote in t,(w,call,quote)
  key.append({'world':w,'mode':mode,'arm':'new' if arm==NEW else arm,'call':call,'quote':quote,'source_file':rel(p),'source_line':t[:t.index(quote)].count('\n')+1,'sha256':sha(p),'kind':'model_output_not_observation_truth'})
 cp={**selection,**{k:v for k,v in note.items() if k!='quotes'},'analysis_status':'事后探索性案例；按结果选取机制极值，不代表总体频率','family':state(w)['family'],'split':state(w)['split'],'gt':gt,'gt_source':rel(gtp),'gt_sha256':sha(gtp),'occlusion_target_id':audit.get('required_recovery_id'),'outcomes':outcomes,'critical_turns':key,'media':[v for v in media if v['world']==w],'pixel_audit':pixels.get(w),'evidence_file':f'evidence/{w}.json'}
 cases.append(cp)
 (OUT/'evidence'/f'{w}.json').write_text(json.dumps({'scope':'Sanitized archive excerpts; relative source paths. Private GT is audit-only and never model input.','world':w,'transcripts':transcripts},ensure_ascii=False,indent=2))
report={'schema_version':1,'analysis_status':'post_hoc_exploratory','created_date':'2026-09-21','scope':'8 mechanism cases selected by explicit result-based rules; no new model calls. Results do not estimate case prevalence.','new_arm':NEW,'coordinate_frame':'+x initial right, +y initial forward; meters','selection_tie_break':'lexicographic world ID','source_root_alias':'sealed_EVAL/a_single_seed_20260920','source_hashes':{'analysis.json':sha(ROOT/'analysis.json'),'source_snapshot/environment.py':sha(ROOT/'source_snapshot/environment.py'),'source_snapshot/scoring_frozen.py':sha(ROOT/'source_snapshot/scoring_frozen.py')},'visibility_definition':'observed means at least one frame has >=263 segmentation pixels for this GT instance; false does not mean zero pixels','cases':cases}
(OUT/'selected_cases.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
(OUT/'raw_response_verification.json').write_text(json.dumps({'scope':'Concatenate SSE choices.delta.content; compare against archived content.txt without altering either','checked_calls':len(raw_checks),'exact_count':sum(v['sse_content_exact'] for v in raw_checks),'trimmed_count':sum(v['sse_content_trimmed'] for v in raw_checks),'checks':raw_checks},ensure_ascii=False,indent=2))
print(json.dumps({'selected':[v['world'] for v in cases],'candidate_counts':{v['id']:v['eligible_count'] for v in selected},'raw_calls_checked':len(raw_checks),'exact_sse_content':sum(v['sse_content_exact'] for v in raw_checks),'trimmed_sse_content':sum(v['sse_content_trimmed'] for v in raw_checks)},indent=2))
