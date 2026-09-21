"""Post-hoc TEST-GT-SELECTED diagnostic. NOT deployable and NOT model inference.
For each test target, retrieve best of 838 train final maps, after private-pose
inversion, room-size normalization and one of all eight square symmetries.
"""
import json, math, hashlib
from pathlib import Path
from collections import Counter
import numpy as np
D=Path(__file__).resolve().parent;W=D.parents[2];E=W/'outputs/final_evaluation_evidence_v1/a_single_seed_20260920';read=lambda p:json.loads(p.read_text())
train=read(D/'training_metadata.json')['records'];manifest=read(E/'manifest.json')
ALIASES={'couch':'sofa','lamp':'floor_lamp','floor lamp':'floor_lamp','potted plant':'plant','potted_plant':'plant','desk':'table','cupboard':'cabinet','round_stool':'stool'}
def objects(d):
 def cat(c):
  c=str(c).lower().strip();return ALIASES.get(c,c.replace(' ','_'))
 return [(cat(o['category']),float(o['x']) if o.get('x') is not None else float('nan'),float(o['y']) if o.get('y') is not None else float('nan')) for o in d['objects']]
def score(p,g):
 edges=[[j for j,(c,x,y) in enumerate(g) if c==a and (x-u)**2+(y-v)**2<=.75**2] for a,u,v in p];match={}
 def augment(i,seen):
  for j in edges[i]:
   if j in seen:continue
   seen.add(j)
   if j not in match or augment(match[j],seen):match[j]=i;return True
  return False
 return 2*sum(augment(i,set()) for i in range(len(p)))/(len(p)+len(g))
def normalized_train(t):
 sx,sz,h=t['start'];ch=math.cos(h);sh=math.sin(h);r=t['world']['room'];rw,rd=r['size'];cx,cz=r['center']
 p=objects(t['frozen_rows']['maps'][-1]);assert len(p)==len(t['frozen_rows']['maps'][-1]['objects'])
 return [(c,(sx+ch*x+sh*y-cx)/rw,(sz+sh*x-ch*y-cz)/rd) for c,x,y in p]
T=[normalized_train(t) for t in train];results=[]
for m in manifest:
 d=E/'scenes'/m['id']/'private';g=objects(read(d/'gt.json'));sx,sz,h=read(d/'start.json');ch=math.cos(h);sh=math.sin(h);r=read(d/'world.json')['rooms'][0];rw,rd=r['size'];cx,cz=r['center'];best=(-1,None);best_family=(-1,None)
 for t,p in zip(train,T):
  for swap in [False,True]:
   for signx in [-1,1]:
    for signz in [-1,1]:
     q=[]
     for c,x,z in p:
      a,b=(z,x) if swap else (x,z);dx=signx*a*rw+cx-sx;dz=signz*b*rd+cz-sz;q.append((c,ch*dx+sh*dz,sh*dx-ch*dz))
     f=score(q,g)
     if f>best[0]:best=(f,{'train':t['scene'],'swap_axes':swap,'signx':signx,'signz':signz})
     if t['family']==m['family'] and f>best_family[0]:best_family=(f,{'train':t['scene'],'swap_axes':swap,'signx':signx,'signz':signz})
 results.append({'world':m['id'],'f1':best[0],'chosen':best[1],'same_family_f1':best_family[0],'same_family_chosen':best_family[1]})
 print(m['id'],best[0],flush=True)
x={'status':'POST_HOC_EXPLORATORY_ONLY','model_calls':0,'candidate_maps':838,'transforms_per_map':8,'target_worlds':128,'total_map_transforms_scored':838*8*128,'metric':'object F1 at .75m','information':'Test GT chooses the best training target and symmetry. Uses private true start poses and room dimensions; not a deployable no-image baseline. Allows reusing an entire memorized train map after affine room normalization plus D4. Does not allow independent per-object edits, arbitrary learned deformations, or category reassignment.','mean_f1':float(np.mean([r['f1'] for r in results])),'same_family_mean_f1':float(np.mean([r['same_family_f1'] for r in results])),'perfect_worlds':sum(r['f1']==1 for r in results),'max_world_f1':max(r['f1'] for r in results),'per_world':results,'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
(D/'aligned_training_oracle.json').write_text(json.dumps(x,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in x.items() if k!='per_world'},indent=2))
