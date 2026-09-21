"""POST-HOC EXPLORATORY. Offline scoring only, never a model/image intervention.
Run with numpy; default inputs are frozen evidence + collect_training.py output.
F1 uses independent maximum-cardinality category/radius matching, checked against
all saved .75m/.25m scores. No image download, model/service/train call.
"""
import argparse, collections, hashlib, json, math, statistics, sys
from pathlib import Path
import numpy as np
P=argparse.ArgumentParser();P.add_argument('--workspace',type=Path,default=Path(__file__).resolve().parents[3]);args=P.parse_args()
W=args.workspace;OUT=Path(__file__).resolve().parent;E=W/'outputs/final_evaluation_evidence_v1/a_single_seed_20260920'
N='full838_a_seed20260920';read=lambda p:json.loads(p.read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest=read(E/'manifest.json');train=read(OUT/'training_metadata.json')['records'];ids=[m['id'] for m in manifest]
ALIASES={'couch':'sofa','lamp':'floor_lamp','floor lamp':'floor_lamp','potted plant':'plant','potted_plant':'plant','desk':'table','cupboard':'cabinet','round_stool':'stool'}
def cat(c):
 s=str(c).lower().strip();return ALIASES.get(s,s.replace(' ','_'))
def objs(d):
 return [(cat(o.get('category')),float(o['x']) if o.get('x') is not None else float('nan'),float(o['y']) if o.get('y') is not None else float('nan')) for o in d.get('objects',[])]
def f1(p,g,t=.75):
 if not p or not g:return 0.
 r2=t*t
 edges=[[j for j,(c,x,y) in enumerate(g) if c==pc and (x-px)**2+(y-py)**2<=r2] for pc,px,py in p]
 match={}
 def augment(i,seen):
  for j in edges[i]:
   if j in seen:continue
   seen.add(j)
   if j not in match or augment(match[j],seen):match[j]=i;return True
  return False
 n=sum(augment(i,set()) for i in range(len(p)))
 return 2*n/(len(p)+len(g))
def summary(vals):
 a=np.array(vals,dtype=float)
 return {'n':len(a),'mean':float(a.mean()),'median':float(np.median(a)),'q05':float(np.quantile(a,.05)),'q95':float(np.quantile(a,.95)),'min':float(a.min()),'max':float(a.max())}
def grouped(vals):
 return {'all':summary(vals),'ordinary':summary([v for m,v in zip(manifest,vals) if m['split']=='a_confirm_ordinary']),'physical_occlusion':summary([v for m,v in zip(manifest,vals) if m['split']=='a_confirm_occlusion'])}
def simple(o):return {'objects':[{'category':c,'x':x,'y':y} for c,x,y in o]}
def signature(p):return json.dumps(sorted((c,round(x,6),round(y,6)) for c,x,y in p),allow_nan=True)
G=[];worlds=[];starts=[];audit=[]
for sid in ids:
 d=E/'scenes'/sid/'private';G.append(objs(read(d/'gt.json')));worlds.append(read(d/'world.json'));starts.append(read(d/'start.json'));audit.append(read(d/'audit.json'))

def to_room(p,start):
 sx,sz,h=start;c=math.cos(h);s=math.sin(h)
 return [(a,sx+c*x+s*y,sz+s*x-c*y) for a,x,y in p]
def to_camera(p,start):
 sx,sz,h=start;c=math.cos(h);s=math.sin(h)
 return [(a,c*(x-sx)+s*(z-sz),s*(x-sx)-c*(z-sz)) for a,x,z in p]
def map_transfer(p,i,j,normalize=False):
 q=to_room(p,starts[i])
 if normalize:
  a=worlds[i]['rooms'][0];b=worlds[j]['rooms'][0]
  q=[(c,(x-a['center'][0])*b['size'][0]/a['size'][0]+b['center'][0],(z-a['center'][1])*b['size'][1]/a['size'][1]+b['center'][1]) for c,x,z in q]
 return to_camera(q,starts[j])
coordinate_errors=[]
for g,w,s in list(zip(G,worlds,starts))+[(objs(t['gt']),{'objects':t['world']['objects']},t['start']) for t in train]:
 expected=to_camera([(o['category'],o['position'][0],o['position'][2]) for o in w['objects']],s)
 assert [o[0] for o in g]==[o[0] for o in expected]
 coordinate_errors.extend(math.hypot(x-x2,y-y2) for (_,x,y),(_,x2,y2) in zip(g,expected))
assert max(coordinate_errors)<1e-8
states={};preds={};score_checks=0;status_hashes={}
for mode,arms in [('e2e',['base','full128',N]),('reader',['base',N])]:
 for arm in arms:
  key=mode+'/'+arm;ss=[];pp=[]
  for sid,g in zip(ids,G):
   d=E/'results'/mode/arm/sid;s=read(d/'status.json');ss.append(s);status_hashes[str((d/'status.json').relative_to(E))]=sha(d/'status.json')
   p=objs(read(d/'prediction.json')) if s['status']=='COMPLETE' else [];pp.append(p)
   for t,k in [(.75,'metrics'),(.25,'metrics_025')]:
    v=f1(p,g,t);assert abs(v-(s[k]['object_f1'] if p else 0))<1e-12,(key,sid,t,v);score_checks+=1
  states[key]=ss;preds[key]=pp
original=read(E/'analysis.json');assert status_hashes==original['status_hashes']
print('validated',score_checks,'scores',flush=True)

# Exhaustive source/recipient wrong-world pairs; target average preserves the
# original 96:32 parent weighting. Eligibility may contain uneven donor counts.
swap={}
for key,pp in preds.items():
 methods=['egocentric','room_normalized_oracle'] if key in ['e2e/'+N,'reader/'+N] else ['egocentric']
 matrices={}
 for method in methods:
  mat=np.zeros((128,128))
  for j,g in enumerate(G):
   for i,p in enumerate(pp):
    if i==j:mat[j,i]=f1(p,g);continue
    q=p if method=='egocentric' else map_transfer(p,i,j,True)
    mat[j,i]=f1(q,g)
  matrices[method]=mat
  for restriction in ['all','stratum','stratum_and_family']:
   rows=[];pair_count=0
   for j,m in enumerate(manifest):
    donors=[i for i,v in enumerate(manifest) if i!=j and (restriction=='all' or m['split']==v['split']) and (restriction!='stratum_and_family' or m['family']==v['family'])]
    assert donors;pair_count+=len(donors);rows.append(float(mat[j,donors].mean()))
   name=method+'/'+restriction
   swap.setdefault(key,{})[name]={'donor_recipient_ordered_pairs':pair_count,'target_worlds':128,'repetitions':'exhaustive eligible donor average per target; no Monte Carlo','score':grouped(rows),'per_world':dict(zip(ids,rows))}
 print('swaps',key,flush=True)

# Fit no-image prior ONLY to last finish maps actually in frozen train.jsonl.
T=[]
for t in train:
 maps=t['frozen_rows']['maps'];assert len(maps)==1,(t['scene'],len(maps));T.append(objs(maps[-1]))
assert read(OUT/'training_metadata.json')['train_sha256']==read(W/'outputs/training_data_manifest.json')['train_sha256']
categories=sorted({c for p in T for c,_,_ in p})
def fit_prior(indices):
 pool=[T[i] for i in indices];hotspots=[]
 for c in categories:
  a=np.array([(x,y) for p in pool for cc,x,y in p if cc==c and math.isfinite(x+y)])
  if len(a)==0:continue
  candidates=np.unique(np.round(a/.25)*.25,axis=0)
  best=None
  for x,y in candidates:
   hit=sum(any(cc==c and (xx-x)**2+(yy-y)**2<=.75**2 for cc,xx,yy in p) for p in pool)
   choice=(hit,-(x*x+y*y),-x,-y)
   if best is None or choice>best[0]:best=(choice,(c,float(x),float(y)))
  hotspots.append((best[0][0],best[1]))
 hotspots.sort(key=lambda a:(-a[0],a[1]))
 candidate_maps=[[q for _,q in hotspots[:k]] for k in range(1,len(hotspots)+1)]
 means=[statistics.mean(f1(p,g) for g in pool) for p in candidate_maps]
 k=int(np.argmax(means));return candidate_maps[k],{'training_worlds':len(indices),'selected_object_count':k+1,'training_fit_f1':means[k],'candidate_counts_fit_f1':means,'hotspots':[{'category':q[0],'x':q[1],'y':q[2],'train_world_hits':h} for h,q in hotspots]}
prior,fit=fit_prior(list(range(838)))
prior_scores=[f1(prior,g) for g in G]
priors={'global_training_hotspot':{'fit':fit,'map':simple(prior),'score':grouped(prior_scores),'information':'No evaluation GT used for fitting; frozen supervised finish targets only. One hotspot per category at 0.25m grid, rank by train per-world 0.75m hit rate, choose prefix length maximizing train target F1. Fixed map for all worlds.'}}
family_fit={};family_scores=[]
for fam in sorted({t['family'] for t in train}):
 p,details=fit_prior([i for i,t in enumerate(train) if t['family']==fam]);family_fit[fam]=(p,details)
for m,g in zip(manifest,G):family_scores.append(f1(family_fit[m['family']][0],g))
priors['family_metadata_oracle_training_hotspot']={'score':grouped(family_scores),'information':'Hotspots fitted solely to train targets; recipient family is private test metadata and not given in actual prompt. Conditional offline oracle, not deployable no-image baseline. Physical occlusion uses ordinary train occlusion family.','fit':{f:{'map':simple(p),**d} for f,(p,d) in family_fit.items()}}
# Replace model's positions with a single train hotspot per predicted category;
# keep predicted category multiset and failure zeros. This uses visual model
# category output, so not itself a no-image baseline.
hot={x['category']:(x['x'],x['y']) for x in fit['hotspots']}
for key in ['e2e/'+N,'reader/'+N]:
 vals=[f1([(c,*hot.get(c,(float('nan'),float('nan')))) for c,x,y in p],g) for p,g in zip(preds[key],G)]
 priors['replace_coordinates/'+key]={'score':grouped(vals),'information':'Retains saved model category/count output, replaces every coordinate by train hotspot; post-hoc scoring proxy, not model intervention.'}
print('priors fitted',flush=True)

# Pairwise maximal-map match is an explicitly GT-selected retrieval oracle.
# A strong upper score here does not establish copying; exact equality matters.
train_sigs={signature(p):[] for p in T}
for t,p in zip(train,T):train_sigs[signature(p)].append(t['scene'])
retrieval={}
for key in ['e2e/'+N,'reader/'+N]:
 exact=[];nearest=[]
 for sid,p in zip(ids,preds[key]):
  if signature(p) in train_sigs:exact.append({'world':sid,'training_worlds':train_sigs[signature(p)]})
  values=[f1(q,p) for q in T];ix=int(np.argmax(values));nearest.append({'world':sid,'max_f1_to_training_target':values[ix],'train_world':train[ix]['scene']})
 retrieval[key]={'exact_canonical_category_coordinate_copies':exact,'nearest_training_target_similarity':summary([d['max_f1_to_training_target'] for d in nearest]),'per_world':nearest,'information':'Canonical equality ignores IDs/evidence/order; coordinates rounded 1e-6. F1 similarity selected against saved prediction, threshold .75m; proximity is not proof of memorization.'}
oracle=[];matched_family=[]
for j,g in enumerate(G):
 vals=[f1(p,g) for p in T];i=int(np.argmax(vals));oracle.append(vals[i]);matched_family.append(max(v for t,v in zip(train,vals) if t['family']==manifest[j]['family']))
retrieval['test_GT_selected_training_map_oracle']={'score':grouped(oracle),'family_matched_score':grouped(matched_family),'candidate_training_maps':838,'information':'Uses recipient evaluation GT to select best training map; severe oracle advantage, purely a memorization diagnostic, not a deployable baseline, not model evidence of copying.'}

# Saved action canonical signatures: drop notes/reasons, preserve action args.
def parse(s):
 try:return json.loads(s)
 except Exception:
  try:return json.loads(s[s.index('{'):s.rindex('}')+1])
  except Exception:return None
def action_sig(op):
 k=op.get('op')
 if k=='step':return ['step',round(float(op.get('turn_deg',0)),6),round(float(op.get('move_m',0)),6)]
 if k=='step_sequence':return ['step_sequence',[[round(float(s.get('turn_deg',0)),6),round(float(s.get('move_m',0)),6)] for s in op.get('steps',[])]]
 if k=='inspect':return ['inspect',op.get('frame'),op.get('bbox')]
 return [k]
def compact(x):return json.dumps(x,separators=(',',':'),sort_keys=True)
def action_stats(lists):
 first=collections.Counter(compact(x[0]) if x else 'MISSING' for x in lists)
 pairs=collections.Counter(compact(x[:2]) for x in lists)
 full=collections.Counter(compact(x) for x in lists)
 step=collections.Counter()
 for acts in lists:
  for a in acts:
   if a[0]=='step':step[compact(a[1:])]+=1
   if a[0]=='step_sequence':step.update(compact(s) for s in a[1])
 return {'worlds':len(lists),'unique_first_action':len(first),'unique_first_two_actions':len(pairs),'unique_full_acquisition_sequences':len(full),'first_action_top10':first.most_common(10),'first_two_top10':pairs.most_common(10),'full_sequence_top5':full.most_common(5),'step_turn_move_top10':step.most_common(10)}
actions={};sequences={}
for key in ['e2e/base','e2e/full128','e2e/'+N]:
 lists=[]
 for sid in ids:
  d=E/'results'/key/sid/'calls';seq=[]
  for f in sorted(d.glob('acquire_*/content.txt')):
   op=parse(f.read_text())
   if isinstance(op,dict):seq.append(action_sig(op))
  lists.append(seq)
 sequences[key]=lists;actions[key]=action_stats(lists)
actions['interpretation']='Canonical requested action sequences from saved generated content, including rejected requested operations; notes/reasons removed and numeric arguments rounded 1e-6. Not actual trajectory equality or proof of visual independence.'
actions['frozen_train']=action_stats([[action_sig(o) for o in t['frozen_rows']['actions']] for t in train])
# Within-world permutation of categories over fixed saved coordinate slots.
rng=np.random.default_rng(20260921);shuffle={}
for key in ['e2e/'+N,'reader/'+N]:
 byworld=[]
 for p,g in zip(preds[key],G):
  vals=[]
  for _ in range(200):
   perm=rng.permutation(len(p));q=[(p[i][0],p[int(j)][1],p[int(j)][2]) for i,j in enumerate(perm)];vals.append(f1(q,g))
  byworld.append(float(np.mean(vals)))
 shuffle[key]={'repetitions_per_parent':200,'statistical_permutation_seed':20260921,'seed_scope':'Offline scoring permutation RNG only; not a training seed. Original sole training seed remains 20260920.','score':grouped(byworld),'information':'Uniform permutation of coordinate slots among saved objects, including identity permutations and repeated categories. Preserves category multiset/count and spatial point cloud; offline scoring only.'}

# Asset and split corroboration; original exclusion test is a prior audit,
# not repeated here across all 4428 prior worlds.
asset_sig=lambda o:compact(o['asset'])
ta={asset_sig(o) for t in train for o in t['world']['objects']};ea={asset_sig(o) for w in worlds for o in w['objects']}
leak={'train_worlds':838,'eval_worlds':128,'shared_scene_ids':sorted(set(ids)&{t['scene'] for t in train}),'train_asset_definitions':len(ta),'eval_asset_definitions':len(ea),'eval_assets_seen_in_train':len(ea&ta),'new_eval_asset_definitions':len(ea-ta),'train_categories':categories,'eval_categories':sorted({c for g in G for c,x,y in g}),'shared_layout_families':sorted({m['family'] for m in manifest}&{t['family'] for t in train}),'prior_split_audit':read(E/'split_audit.json'),'prior_data_audit':read(W/'outputs/data_audit_summary.json'),'coordinate_transform_max_abs_distance_error':max(coordinate_errors),'coordinate_validation_objects':len(coordinate_errors),'visibility_threshold_pixels':263,'visibility_interpretation':'observed false means no single frame with >=263 segmentation pixels; does not establish zero visual evidence.'}
finish={}
for mode,comp in [('e2e','base'),('e2e','full128'),('reader','base')]:
 a=states[mode+'/'+N];b=states[mode+'/'+comp];complete=[i for i,s in enumerate(b) if s['status']=='COMPLETE'];failed=[i for i,s in enumerate(b) if s['status']!='COMPLETE']
 delta=statistics.mean(x['primary_f1']-y['primary_f1'] for x,y in zip(a,b))
 complete_gain=sum(a[i]['primary_f1']-b[i]['primary_f1'] for i in complete)/128
 failure_gain=sum(a[i]['primary_f1'] for i in failed)/128
 finish[mode+'/'+comp]={'total_delta':delta,'comparator_completed_worlds':len(complete),'comparator_failed_worlds':len(failed),'gain_on_comparator_completed_worlds_div128':complete_gain,'gain_on_comparator_failed_worlds_div128':failure_gain,'optimistic_score1_repair_of_every_comparator_failure_delta_ceiling':len(failed)/128,'gain_after_imputing_comparator_failure_f1_1':delta-len(failed)/128,'information':'Descriptive arithmetic, not causal mediation. Imputation generously awards every failed baseline perfect score; it does not repair predictions.'}
result={'analysis_status':'POST_HOC_EXPLORATORY_ONLY','created_date':'2026-09-21','not_model_intervention':True,'model_calls':0,'training_updates':0,'python':sys.version,'numpy':np.__version__,'verification':{'saved_f1_checks':score_checks,'status_hashes_unchanged':True,'original_analysis_sha256':sha(E/'analysis.json'),'script_sha256':sha(Path(__file__)),'training_metadata_sha256':sha(OUT/'training_metadata.json'),'train_jsonl_sha256':read(OUT/'training_metadata.json')['train_sha256']},'methodology':{'metric':'mean per-parent category-gated one-to-one object F1 radius .75m','parent_weights':'96 ordinary +32 physical occlusion, equal parent weighting = .75/.25 stratum weighting','scoring_engine':'independent maximum cardinality bipartite matching reproduces all 1280 stored F1 checks; frozen Hungarian matching cardinality equivalent because invalid cost 1e6 dominates <=10 valid distances','confidence':'No new confirmatory p-values or CIs. Pair-swap exhaustive means and posthoc descriptive quantiles only; not population CIs.','coordinate_system':'start_camera_xy meters, validated against private world x,z and start[x,z,yaw] for every train/eval object; room transfer uses private metadata and is explicitly oracle aided.'},'finish_format':finish,'offline_cross_world_swap':swap,'training_prior_controls':priors,'training_map_retrieval':retrieval,'acquisition_templates':actions,'coordinate_category_assignment_shuffle':shuffle,'leakage_and_scope':leak}
(OUT/'shortcut_analysis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False))
print(json.dumps({'finish':finish,'priors':{k:v['score']['all']['mean'] for k,v in priors.items()},'new_swaps':{k:v['score']['all']['mean'] for k,v in swap['e2e/'+N].items()},'new_first_actions':actions['e2e/'+N]['first_action_top10'],'oracle':retrieval['test_GT_selected_training_map_oracle']['score']['all']},ensure_ascii=False,indent=2))
