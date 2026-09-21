#!/usr/bin/env python3
"""Post-hoc offline score controls. Python 3 + numpy; no network/model access.
Default: reproduce training-only hotspot priors and exhaustive cross-world swaps.
Optional --oracle: all 838 x 8 train-map transforms per test world, chosen by TEST
GT. --oracle-world ID may be repeated to verify only selected oracle worlds.
See README.md for information privileges and limits.
"""
import argparse, hashlib, json, math, statistics
from pathlib import Path
import numpy as np
ALIASES={'couch':'sofa','lamp':'floor_lamp','floor lamp':'floor_lamp','potted plant':'plant','potted_plant':'plant','desk':'table','cupboard':'cabinet','round_stool':'stool'}
NEW='full838_a_seed20260920'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def canonical_sha(x):return hashlib.sha256(json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def objects(os):
 def cat(c):
  s=str(c).lower().strip();return ALIASES.get(s,s.replace(' ','_'))
 return [(cat(o.get('category')),float(o['x']) if o.get('x') is not None else float('nan'),float(o['y']) if o.get('y') is not None else float('nan')) for o in os]
def score(p,g,t=.75):
 if not p or not g:return 0.
 edges=[[j for j,(c,x,y) in enumerate(g) if c==a and (x-u)**2+(y-v)**2<=t*t] for a,u,v in p];matched={}
 def augment(i,seen):
  for j in edges[i]:
   if j in seen:continue
   seen.add(j)
   if j not in matched or augment(matched[j],seen):matched[j]=i;return True
  return False
 return 2*sum(augment(i,set()) for i in range(len(p)))/(len(p)+len(g))
def summary(values):
 a=np.array(values,dtype=float)
 return {'n':len(a),'mean':float(a.mean()),'median':float(np.median(a)),'q05':float(np.quantile(a,.05)),'q95':float(np.quantile(a,.95)),'min':float(a.min()),'max':float(a.max())}
def grouped(values,test):
 return {'all':summary(values),'ordinary':summary([v for t,v in zip(test,values) if t['split']=='a_confirm_ordinary']),'physical_occlusion':summary([v for t,v in zip(test,values) if t['split']=='a_confirm_occlusion'])}
def room_coords(p,start):
 x,z,h=start;c=math.cos(h);s=math.sin(h)
 return [(a,x+c*u+s*v,z+s*u-c*v) for a,u,v in p]
def camera_coords(p,start):
 x,z,h=start;c=math.cos(h);s=math.sin(h)
 return [(a,c*(u-x)+s*(v-z),s*(u-x)-c*(v-z)) for a,u,v in p]
def transfer(p,source,target):
 a,b=source['room'],target['room']
 q=[(c,(x-a['center'][0])*b['size'][0]/a['size'][0]+b['center'][0],(z-a['center'][1])*b['size'][1]/a['size'][1]+b['center'][1]) for c,x,z in room_coords(p,source['start'])]
 return camera_coords(q,target['start'])
def fit_hotspot(maps,categories):
 hotspots=[]
 for c in categories:
  a=np.array([(x,y) for p in maps for cc,x,y in p if cc==c and math.isfinite(x+y)])
  if len(a)==0:continue
  candidates=np.unique(np.round(a/.25)*.25,axis=0);best=None
  for x,y in candidates:
   hits=sum(any(cc==c and (u-x)**2+(v-y)**2<=.75**2 for cc,u,v in p) for p in maps)
   choice=(hits,-(x*x+y*y),-x,-y)
   if best is None or choice>best[0]:best=(choice,(c,float(x),float(y)))
  hotspots.append((best[0][0],best[1]))
 hotspots.sort(key=lambda a:(-a[0],a[1]));candidates=[[p for _,p in hotspots[:k]] for k in range(1,len(hotspots)+1)]
 means=[statistics.mean(score(p,g) for g in maps) for p in candidates];k=int(np.argmax(means))
 return candidates[k],{'selected_object_count':k+1,'training_fit_f1':means[k],'hotspots':[{'category':p[0],'x':p[1],'y':p[2],'train_world_hits':n} for n,p in hotspots]}
def oracle_for_world(target,train,maps):
 g=objects(target['gt']);best=(-1,None);best_family=(-1,None)
 for t,p in zip(train,maps):
  r=t['room'];q=[(c,(x-r['center'][0])/r['size'][0],(z-r['center'][1])/r['size'][1]) for c,x,z in room_coords(p,t['start'])]
  r=target['room']
  for swap in [False,True]:
   for signx in [-1,1]:
    for signz in [-1,1]:
     moved=[]
     for c,x,z in q:
      a,b=(z,x) if swap else (x,z);moved.append((c,signx*a*r['size'][0]+r['center'][0],signz*b*r['size'][1]+r['center'][1]))
     value=score(camera_coords(moved,target['start']),g)
     selected={'train':t['id'],'swap_axes':swap,'signx':signx,'signz':signz}
     if value>best[0]:best=(value,selected)
     if t['family']==target['family'] and value>best_family[0]:best_family=(value,selected)
 return {'world':target['id'],'f1':best[0],'chosen':best[1],'same_family_f1':best_family[0],'same_family_chosen':best_family[1]}
def close(x,y):assert abs(float(x)-float(y))<=1e-12,(x,y)
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--data',type=Path,default=Path(__file__).with_name('data.json'));ap.add_argument('--metadata',type=Path,default=Path(__file__).with_name('metadata.json'));ap.add_argument('--provenance',type=Path,default=Path(__file__).with_name('provenance.json'));ap.add_argument('--expected',type=Path,default=Path(__file__).with_name('expected_results.json'));ap.add_argument('--out',type=Path,default=Path('reproduction.json'));ap.add_argument('--oracle',action='store_true');ap.add_argument('--oracle-world',action='append',default=[]);ap.add_argument('--skip-priors',action='store_true');ap.add_argument('--skip-swaps',action='store_true');args=ap.parse_args()
 provenance=read(args.provenance);input_paths={'data.json':args.data,'metadata.json':args.metadata,'expected_results.json':args.expected}
 for item in provenance['source_to_public']:assert sha(input_paths[item['public_file']])==item['public_sha256'], item['public_file']
 data=read(args.data);meta=read(args.metadata);expected=read(args.expected);
 public_records={r['id']:r for r in meta['training']+meta['test']}
 for record in provenance['records']:assert canonical_sha(public_records[record['id']])==record['public_record_canonical_sha256']
 test=meta['test'];train=meta['training'];worlds={w['id']:w for w in data['worlds']};ids=[w['id'] for w in test];assert len(test)==128 and len(train)==838 and set(ids)==set(worlds)
 gt=[objects(t['gt']) for t in test];maps=[objects(t['finish_map']) for t in train];pred={};checks=0
 for t,g in zip(test,gt):assert g==objects(worlds[t['id']]['gt'])
 for mode,arms in [('e2e',['base','full128','new']),('reader',['base','new'])]:
  for arm in arms:
   key=mode+'/'+(NEW if arm=='new' else arm);pred[key]=[]
   for sid,g in zip(ids,gt):
    o=worlds[sid]['outputs'][mode][arm];p=objects(o['prediction']) if o['status']=='COMPLETE' else [];pred[key].append(p)
    close(score(p,g),o['primary_f1']);checks+=1
    close(score(p,g,.25),o.get('metrics_025',{}).get('object_f1',0));checks+=1
 result={'status':'POST_HOC_EXPLORATORY_OFFLINE_SCORING_ONLY','model_calls':0,'training_seed':20260920,'metric':'Per-parent one-to-one category-gated object F1 at .75m; failed predictions empty. 96 ordinary/32 physical occlusion, equal parent weights.','inputs_sha256':{'data.json':sha(args.data),'metadata.json':sha(args.metadata)},'saved_score_checks':checks,'public_record_hash_checks':len(provenance['records']),'script_sha256':sha(Path(__file__)),'numpy_version':np.__version__}
 if not args.skip_priors:
  categories=sorted({c for p in maps for c,_,_ in p});p,fit=fit_hotspot(maps,categories);prior={}
  prior['global_training_hotspot']={'score':grouped([score(p,g) for g in gt],test),'fit':fit}
  families={f:fit_hotspot([p for t,p in zip(train,maps) if t['family']==f],categories)[0] for f in sorted({t['family'] for t in train})}
  prior['family_metadata_oracle_training_hotspot']={'score':grouped([score(families[t['family']],g) for t,g in zip(test,gt)],test)}
  hot={h['category']:(h['x'],h['y']) for h in fit['hotspots']}
  for key in ['e2e/'+NEW,'reader/'+NEW]:prior['replace_coordinates/'+key]={'score':grouped([score([(c,*hot.get(c,(float('nan'),float('nan')))) for c,_,_ in p],g) for p,g in zip(pred[key],gt)],test)}
  for key,value in prior.items():
   for group in ['all','ordinary','physical_occlusion']:close(value['score'][group]['mean'],expected['priors'][key]['score'][group]['mean'])
  result['priors']=prior;print('Verified training-only hotspot controls.')
 if not args.skip_swaps:
  swaps={}
  for key,pp in pred.items():
   swaps[key]={}
   for method in (['egocentric','room_normalized_oracle'] if key in ['e2e/'+NEW,'reader/'+NEW] else ['egocentric']):
    matrix=np.zeros((128,128))
    for j,g in enumerate(gt):
     for i,p in enumerate(pp):matrix[j,i]=score(p if method=='egocentric' else transfer(p,test[i],test[j]),g)
    for restriction in ['all','stratum','stratum_and_family']:
     values=[];pairs=0
     for j,t in enumerate(test):
      donors=[i for i,s in enumerate(test) if i!=j and (restriction=='all' or t['split']==s['split']) and (restriction!='stratum_and_family' or t['family']==s['family'])]
      pairs+=len(donors);values.append(float(matrix[j,donors].mean()))
     name=method+'/'+restriction;original=expected['swaps'][key][name]
     assert pairs==original['donor_recipient_ordered_pairs']
     for sid,value in zip(ids,values):close(value,original['per_world'][sid])
     swaps[key][name]={'score':grouped(values,test),'ordered_pairs':pairs,'per_world':dict(zip(ids,values))}
  result['swaps']=swaps;print('Verified exhaustive cross-world swaps for every target.')
 if args.oracle or args.oracle_world:
  selected=[t for t in test if not args.oracle_world or t['id'] in args.oracle_world]
  assert selected and (not args.oracle_world or len(selected)==len(set(args.oracle_world))), 'Unknown oracle world ID'
  originals={r['world']:r for r in expected['aligned_oracle']['per_world']};rows=[]
  for t in selected:
   row=oracle_for_world(t,train,maps);old=originals[row['world']];close(row['f1'],old['f1']);close(row['same_family_f1'],old['same_family_f1']);assert row['chosen']==old['chosen'] and row['same_family_chosen']==old['same_family_chosen'];rows.append(row);print('Verified oracle:',t['id'])
  result['aligned_oracle']={'information':'TEST GT selects best of 838 maps x 8 D4 transforms, with PRIVATE source/target poses and room sizes. This is an oracle diagnostic, never a deployable no-image baseline.','target_worlds':len(rows),'transforms_scored':len(rows)*838*8,'mean_f1':statistics.mean(r['f1'] for r in rows),'same_family_mean_f1':statistics.mean(r['same_family_f1'] for r in rows),'per_world':rows}
  if len(rows)==128:close(result['aligned_oracle']['mean_f1'],expected['aligned_oracle']['mean_f1'])
 result['expected_results_verified']=True;args.out.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False));print('Saved',args.out)
if __name__=='__main__':main()
