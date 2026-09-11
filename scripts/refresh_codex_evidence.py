"""Refresh native Codex traces without re-exporting unchanged Claude trajectories."""
import datetime,json
import export_evidence as e
index=e.read(e.DATA/'index.json');count=0
for case in index['cases']:
 if case['kind']!='active':continue
 seed=case['id'].split('-')[-1]
 for arm in ['astra','luna']:
  source=e.ROOT/'api_autonomous'/f'{arm}_{seed}';state=e.read(source/'state.json')
  if not state:continue
  rid=f'active-{seed}-{arm}';run=e.export_astra(source,case,rid,state,e.frames(source));case['runs']=[x for x in case['runs'] if x['id']!=rid]+[run];count+=1
for prefix,values in e.BLOCKS.items():
 existing=e.read(e.DATA/'blocks'/f'{prefix}.json',{});existing.update(values);e.write('data/blocks/'+prefix+'.json',existing)
index['snapshot_at']=datetime.datetime.now(datetime.timezone.utc).isoformat();index['summary']={'cases':len(index['cases']),'runs':sum(len(c['runs']) for c in index['cases']),'calls':sum(r['calls'] for c in index['cases'] for r in c['runs'])};e.write('data/index.json',index)
print(json.dumps({'native_runs_refreshed':count,**index['summary']}))
