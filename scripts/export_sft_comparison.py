"""Read-only remote export. Stream normalized, byte-preserving evidence as tar."""
import base64, gzip, hashlib, io, json, math, re, sys, tarfile
from pathlib import Path

ROOT = Path('/mnt/shared-storage-user/mllm/zhaoyufeng/active_mapping_0911/teacher_distill_0920')
EVAL = ROOT / 'a_single_seed_20260920'
OUT = tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz')
seen = set()
sources = {}
counts = dict(runs=0, calls=0, images=0, frames=0)

def read(p, default=None):
    return json.loads(p.read_text()) if p.exists() else default

def blob(name, data):
    if name in seen: return
    seen.add(name)
    t = tarfile.TarInfo(name); t.size = len(data); t.mtime = 0
    OUT.addfile(t, io.BytesIO(data))

def asset(name, obj):
    blob(name + '.gz', gzip.compress(json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0))
    return '/' + name

def media(data, ext='png'):
    name = 'sft-data/media/' + hashlib.sha256(data).hexdigest() + '.' + ext
    if name not in seen: counts['images'] += 1
    blob(name, data)
    return '/' + name

def replace(v):
    if isinstance(v, str) and v.startswith('data:image/'):
        head, encoded = v.split(',', 1)
        return media(base64.b64decode(encoded), 'jpg' if 'jpeg' in head else 'png')
    if isinstance(v, list): return [replace(x) for x in v]
    if isinstance(v, dict): return {k: replace(x) for k,x in v.items()}
    return v

def xy(p, start):
    dx, dz = p[0]-start[0], p[1]-start[1]
    return [dx*math.cos(start[2])+dz*math.sin(start[2]), dx*math.sin(start[2])-dz*math.cos(start[2])]

def export_run(mode, arm, scene, start):
    folder = EVAL / 'results' / mode / arm / scene
    status = read(folder/'status.json')
    assert status and status['status'] in ('COMPLETE','FAILED'), folder
    run = {k:status[k] for k in ('status','error','frames','calls','metrics','split','family') if k in status}
    run.update(arm=arm, mode=mode, frames=[], calls=[], prediction=read(folder/'prediction.json'))
    run['model'] = status.get('route',{}).get('model')
    run['f1'] = (status.get('metrics') or {}).get('object_f1',0) if status['status']=='COMPLETE' else 0
    sources[str(folder/'status.json')] = hashlib.sha256((folder/'status.json').read_bytes()).hexdigest()
    events = folder/'private/events.jsonl'
    if events.exists():
        for line in events.read_text().splitlines():
            event=json.loads(line); rec=event['public']; n=rec['frame']
            image=(folder/'public'/f'obs_{n:04}.png').read_bytes()
            assert hashlib.sha256(image).hexdigest()==event['image_sha256']
            run['frames'].append(dict(id=n,image=media(image),receipt=rec,xy=xy(event['pose'],start),heading=math.degrees(event['pose'][2]-start[2]),distance=event.get('distance'),seen=event.get('seen',[])))
    elif mode=='reader':
        scan=EVAL/'fixed_scan'/scene
        manifest=read(scan/'scan_manifest.json')
        for rec in manifest['receipts']:
            n=rec['frame']; p=folder/'public'/f'obs_{n:04}.png'
            if not p.exists(): p=scan/'public'/f'obs_{n:04}.png'
            run['frames'].append(dict(id=n,image=media(p.read_bytes()),receipt=rec,xy=[0,0],heading=(n-1)*22.5))
    for call in sorted((folder/'calls').iterdir()):
        if not call.is_dir(): continue
        req=read(call/'request.json'); meta=read(call/'meta.json',{})
        if req is None: continue
        raw=(call/'request.json').read_bytes()
        request=replace(req)
        content=(call/'content.txt').read_text() if (call/'content.txt').exists() else ''
        reason=(call/'reasoning.txt').read_text() if (call/'reasoning.txt').exists() else ''
        images=[b['image_url']['url'] for m in request.get('messages',[]) if isinstance(m.get('content'),list) for b in m['content'] if b.get('type')=='image_url']
        detail=dict(request=request,answer=content,reasoning=reason,meta=meta,source_request_sha256=hashlib.sha256(raw).hexdigest())
        url=asset(f'sft-data/calls/{mode}-{arm}-{scene}-{call.name}.json',detail)
        try: op=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$', '', content.strip()))
        except Exception: op={}
        run['calls'].append(dict(id=call.name,url=url,phase='acquire' if call.name.startswith('acquire') else 'map',operation=op.get('op') if isinstance(op,dict) else None,status=meta.get('status','UNKNOWN'),finish_reason=meta.get('finish_reason'),images=images))
        counts['calls']+=1
    counts['runs']+=1; counts['frames']+=len(run['frames'])
    return run

index=[]
for n,scene in enumerate(sorted(p.name for p in (EVAL/'results/e2e/base').iterdir() if p.is_dir())):
    scene_dir=EVAL/'scenes'/scene/'private'
    start=read(scene_dir/'start.json'); world=read(scene_dir/'world.json'); gt=read(scene_dir/'gt.json')
    rooms=[]
    for r in world['rooms']:
        cx,cz=r['center']; w,d=r['size']
        rooms.append([xy([cx+sx*w/2,cz+sz*d/2],start) for sx,sz in [(-1,-1),(1,-1),(1,1),(-1,1)]])
    modes={}
    for mode in ('e2e','reader'):
        pair={key:export_run(mode,arm,scene,start) for key,arm in [('base','base'),('sft','full838_a_seed20260920')]}
        url=asset(f'sft-data/pairs/{scene}-{mode}.json',dict(scene=scene,mode=mode,gt=gt,rooms=rooms,runs=pair))
        modes[mode]=dict(url=url,base=pair['base']['f1'],sft=pair['sft']['f1'],base_status=pair['base']['status'],sft_status=pair['sft']['status'])
    index.append(dict(id=scene,family=pair['base'].get('family'),split=pair['base'].get('split'),modes=modes))
    print(f'exported {n+1}/128 {scene}',file=sys.stderr,flush=True)

asset('sft-data/index.json',dict(checkpoint='full838_a_seed20260920_attempt03',optimizer_steps=419,training_worlds=838,seed=20260920,cases=index,counts=counts,source_root=str(EVAL)))
asset('sft-data/provenance.json',dict(counts=counts,status_sha256=sources,source_root=str(EVAL),image_policy='Original PNG/JPEG bytes, SHA256 content-addressed; raw request inline image bytes preserved.',pose_policy='Recorded offline environment poses transformed by the frozen start-camera coordinate formula. Reader uses the sealed fixed rotation scan, not model-chosen actions.'))
OUT.close()
print(json.dumps(counts),file=sys.stderr)
