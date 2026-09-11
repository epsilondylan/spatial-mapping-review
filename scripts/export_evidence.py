"""Export allowlisted experiment evidence, deduplicating image bytes. No inference calls."""
import sys,json,re,hashlib,base64,datetime,shutil,collections
from pathlib import Path
SITE=Path(__file__).resolve().parents[1];ROOT=SITE.parent;PUBLIC=SITE/'public';DATA=PUBLIC/'data'
sys.path.insert(0,str(ROOT/'src'))
from bridge import decode_tools
from readout_format import extract
from scoring import score
from diagnostics import diagnose
for d in ['data/runs','data/calls','data/requests','data/references','data/blocks','media']:(PUBLIC/d).mkdir(parents=True,exist_ok=True)
BLOCKS=collections.defaultdict(dict)
def block(value):
 encoded=json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'));sha=hashlib.sha256(encoded.encode()).hexdigest();BLOCKS[sha[:2]][sha]=value;return {'$block':sha}
def packed_request(req):
 payload={**req,'messages':[block(m) for m in req.get('messages',[])]}
 if 'tools' in payload:payload['tools']=block(payload['tools'])
 return {'format':'spatial-blocks-v1','payload':payload}
def read(p,default=None):
 try:return json.loads(p.read_text())
 except (ValueError,FileNotFoundError):return default
def lines(p):
 result=[]
 if p.exists():
  for l in p.read_text().splitlines():
   try:result.append(json.loads(l))
   except ValueError:pass
 return result
def write(rel,d):
 p=PUBLIC/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,separators=(',',':')));return '/'+rel
def media(raw,ext='png'):
 sha=hashlib.sha256(raw).hexdigest();p=PUBLIC/'media'/f'{sha}.{ext}'
 if not p.exists():p.write_bytes(raw)
 return '/media/'+p.name
def replace_images(obj):
 if isinstance(obj,dict):return {k:replace_images(v) for k,v in obj.items()}
 if isinstance(obj,list):return [replace_images(v) for v in obj]
 if isinstance(obj,str) and obj.startswith('data:image/'):
  head,b64=obj.split(',',1);ext='jpg' if 'jpeg' in head else 'png';return media(base64.b64decode(b64),ext)
 return obj
def images(req):
 out=[]
 for m in req.get('messages',[]):
  if isinstance(m.get('content'),list):
   out.extend(b['image_url']['url'] for b in m['content'] if b.get('type')=='image_url')
 return out
def model_output(response):
 if response.get('object')=='response' or 'output' in response and 'choices' not in response:
  thought=[];answer=[];calls=[]
  for item in response.get('output',[]):
   if item.get('type')=='reasoning':thought.extend(x.get('text','') for x in item.get('summary',[]))
   elif item.get('type')=='message':answer.extend(x.get('text','') for x in item.get('content',[]) if x.get('type')=='output_text')
   elif item.get('type') in ['function_call','custom_tool_call']:
    raw=item.get('arguments',item.get('input',''))
    try:raw=json.loads(raw)
    except (ValueError,TypeError):pass
    calls.append({'name':item.get('name'),'input':raw})
  return '\n\n'.join(thought),'\n\n'.join(answer),calls,response.get('status')
 choice=(response.get('choices') or [{}])[0];msg=choice.get('message') or {};text=msg.get('content') or '';thought=msg.get('reasoning_content') or ''
 match=re.search(r'<\|channel>thought\n(.*?)<channel\|>',text,re.S)
 if match:thought=thought or match[1];text=text[match.end():]
 calls=[]
 for x in msg.get('tool_calls') or []:
  try:args=json.loads(x['function']['arguments'])
  except ValueError:args=x['function']['arguments']
  calls.append({'name':x['function']['name'],'input':args})
 return thought,text,calls or decode_tools(text),choice.get('finish_reason')
def frames(source):
 result=[];seen_hashes={}
 for ev in lines(source/'private/events.jsonl'):
  receipt=ev['public'];n=receipt['frame'];p=source/'work/observations'/Path(receipt['image']).name
  if not p.exists():continue
  raw=p.read_bytes();sha=hashlib.sha256(raw).hexdigest();evaluation=[]
  action=receipt.get('requested_action',{})
  if receipt.get('collision'):evaluation.append({'kind':'fact','text':'执行回执报告碰撞/部分移动；不能把请求位移当作实际位移。'})
  if sha in seen_hashes:evaluation.append({'kind':'fact','text':f'图像字节与第{seen_hashes[sha]}帧一致，本次没有新增视觉画面。'})
  elif action.get('move_m')==0:evaluation.append({'kind':'fact','text':'本次未请求平移；转向角和返回图像见回执。'})
  else:evaluation.append({'kind':'fact','text':'本次返回了一张新的RGB；执行状态和请求动作可在回执中核对。'})
  seen_hashes.setdefault(sha,n)
  result.append({'id':n,'image':media(raw),'sha256':sha,'receipt':receipt,'evaluation':evaluation,'reference':{'visible_count':len(ev.get('visible',[])),'seen_count':len(ev.get('seen',[])),'camera_xy':[ev['pose'][0],-ev['pose'][1]-.7]}})
 return result
def export_call(run_id,ident,request,response,meta=None,extras=None):
 meta=meta or {};extras=extras or {};req=replace_images(request);ims=images(req)
 thought,answer,tools,finish=model_output(response)
 uid=run_id+'--'+ident;request_url=write('data/requests/'+uid+'.json',packed_request(req))
 evaluation=[]
 evaluation.append({'kind':'fact','text':f'该次请求实际包含{len(ims)}幅图像；完整输入页保留所有文字、历史消息和工具定义。'})
 if meta.get('omitted'):evaluation.append({'kind':'fact','text':f'近期8图harness移除了{meta["omitted"]}个旧图像块，移除标记仍在输入中。'})
 if not thought:evaluation.append({'kind':'limit','text':'记录中没有返回思考正文。不能据此推断模型没有思考，也不能还原未返回的内部过程。'})
 if tools:evaluation.append({'kind':'fact','text':f'该次返回{len(tools)}项工具请求。是否执行及其返回值应核对后续调用中的工具回执和观察帧。'})
 if extras.get('status')=='FAILED':evaluation.append({'kind':'warning','text':'此读取未通过协议校验：'+str(extras.get('error','未知原因'))+'。保留原文，不将坐标诊断当正式成功评分。'})
 if run_id.startswith('common-91100-gemma') and extras.get('budget')==200 and 'full_nothink' not in run_id and '-full' in run_id:
  evaluation.append({'kind':'finding','text':'人工核查：生成分析把第9–13帧移动后的(-2.12,2.12)位置套给了第8帧；但前8帧只有旋转。可切到观察帧8/13核对。'})
 if run_id.startswith('common-91100-qwen') and extras.get('budget')==200 and '-full' in run_id:
  evaluation.append({'kind':'finding','text':'人工核查：输出frame为[0,0]，不符合start_camera_xy要求；原坐标中的落地灯位置误差约2.93m，仅作诊断。'})
 if run_id.startswith('common-91101-flash') and extras.get('budget')==200:
  evaluation.append({'kind':'finding','text':'离线核查：相较20帧，此例位置误差增大，类别匹配中位误差约0.84m；去掉位置门槛后的辅助方向正确率仍100%。不能直接称为遗忘。'})
 if run_id.startswith('common-91100-flash') and extras.get('budget')==200:
  evaluation.append({'kind':'finding','text':'离线核查：落地灯定位误差约0.13m，类别匹配位置中位误差约0.11m；蓝色花瓶被称为bottle，严格类别评分扣除。'})
 detail={'id':uid,'request_url':request_url,'request_sha256':hashlib.sha256(json.dumps(request,sort_keys=True).encode()).hexdigest(),'images':ims,'thinking':thought,'answer':answer,'tools':tools,'response':response,'finish_reason':finish,'usage':response.get('usage',{}),'evaluation':evaluation,**extras}
 url=write('data/calls/'+uid+'.json',detail)
 return {'id':uid,'detail_url':url,'request_url':request_url,'image_count':len(ims),'thinking_chars':len(thought),'tool_names':[t['name'] for t in tools],'label':extras.get('label') or (' → '.join(t['name'] for t in tools) if tools else '模型回答'),'time':meta.get('time'),'budget':extras.get('budget'),'status':extras.get('status','RECORDED'),'preview':(thought or answer)[:160]}
def export_common(seed):
 source=ROOT/'common_history'/str(seed);fs=frames(source);case={'id':f'common-{seed}','title':f'场景 {seed}','kind':'common','description':'相同脚本轨迹的整段读取 · 三模型对照','runs':[]}
 for arm in ['qwen','gemma','flash']:
  modes=['full','last8','full_nothink','caption','caption_latest1'] if arm!='flash' else ['full']
  for mode in modes:
   rid=f'common-{seed}-{arm}-{mode}';calls=[]
   for cp in [20,80,200]:
    if arm=='flash':
     reqpath=ROOT/'api_examples'/f's{seed}_b{cp}_request.json';respath=ROOT/'api_examples'/f's{seed}_b{cp}_response.json';response=read(respath);meta=read(ROOT/'api_examples'/f's{seed}_b{cp}_meta.json',{});result=next((x for x in read(ROOT/'results/api_summary.json',[]) if x['seed']==seed and x['checkpoint']==cp),{})
    else:
     reqpath=ROOT/'replay'/f'{arm}_{seed}_{cp}_{mode}.raw.request.json';raw=read(ROOT/'replay'/f'{arm}_{seed}_{cp}_{mode}.raw.json',{});response=raw.get('response');meta=raw;result=read(ROOT/'replay'/f'{arm}_{seed}_{cp}_{mode}.json',{})
    request=read(reqpath)
    if not response or not request or 'choices' not in response:continue
    prediction=result.get('prediction')
    if not prediction:
     try:prediction=extract(response['choices'][0]['message'].get('content') or '')
     except:pass
    status=result.get('status','COMPLETE');err=result.get('error')
    if prediction and (prediction.get('frame')!='start_camera_xy' or prediction.get('units')!='meters'):status='FAILED';err='WRONG_COORDINATE_SCHEMA'
    calls.append(export_call(rid,str(cp),request,response,meta,{'label':f'{cp}帧整段读取','budget':cp,'status':status,'error':err,'prediction':prediction,'metrics':result.get('metrics')}))
   if not calls:continue
   manifest={'id':rid,'case_id':case['id'],'model':arm,'mode':mode,'kind':'common','status':'SNAPSHOT','description':'图像由固定脚本采集，动作不是该模型选择。模型在检查点一次读取整段历史；不存在每帧独立思考记录。','frames':fs,'calls':calls,'reference_url':write(f'data/references/{case["id"]}.json',read(source/'private/gt.json'))}
   case['runs'].append({'id':rid,'model':arm,'mode':mode,'status':'SNAPSHOT','frames':len(fs),'calls':len(calls),'manifest':write('data/runs/'+rid+'.json',manifest)})
 return case
def checkpoints(source,state):
 result=[];gt=read(source/'private/gt.json')
 for cp in state.get('completed_checkpoints',[]):
  mp=source/'maps'/f'{cp}.json';pred=read(mp);meta=read(source/'maps'/f'{cp}.meta.json',{})
  if not pred or not meta:continue
  valid=pred.get('frame')=='start_camera_xy' and pred.get('units')=='meters' and isinstance(pred.get('objects'),list) and hashlib.sha256(mp.read_bytes()).hexdigest()==meta.get('map_sha256')
  metrics=None
  if valid and gt:
   metrics=score(pred,gt);metrics.update(diagnose(pred,gt));metrics={k:v for k,v in metrics.items() if k not in ['pairs','matches']}
  result.append({'budget':cp,'prediction':pred,'meta':meta,'valid':valid,'metrics':metrics})
 return result
def native_message(item):
 typ=item.get('type');role=item.get('role')
 if not role:role='assistant' if typ in ['reasoning','function_call','custom_tool_call'] else 'tool' if typ in ['function_call_output','custom_tool_call_output'] else 'user'
 content=item.get('content')
 if content is None:content=item.get('output',item.get('input',item.get('arguments','')))
 if isinstance(content,list):
  blocks=[]
  for b in content:
   if b.get('type') in ['input_text','output_text']:blocks.append({'type':'text','text':b.get('text','')})
   elif b.get('type')=='input_image':blocks.append({'type':'image_url','image_url':{'url':b.get('image_url'),'detail':b.get('detail','auto')}})
   else:blocks.append(b)
  content=blocks
 elif content is None:content=item.get('output',item.get('input',item.get('arguments','')))
 return {'role':role,'content':content,'native_input_item':item}
def export_astra(source,case,rid,state,fs):
 calls=[]
 for reqp in sorted((source/'requests').glob('*.upstream_input.json')):
  ident=reqp.name.split('.')[0];native=read(reqp);resfile=reqp.with_name(ident+'.response.sse');response=None;events=[]
  if not native or not resfile.exists():continue
  for line in resfile.read_text().splitlines():
   if not line.startswith('data:'):continue
   try:event=json.loads(line[5:])
   except ValueError:continue
   events.append(event)
   if event.get('type') in ['response.completed','response.incomplete','response.failed']:response=event.get('response')
  if response is None:continue
  meta=read(reqp.with_name(ident+'.meta.json'),{});messages=[]
  if native.get('instructions'):messages.append({'role':'system','content':native['instructions']})
  messages.extend(native_message(i) for i in native.get('input',[]))
  req={**{k:v for k,v in native.items() if k not in ['instructions','input']},'messages':messages}
  rawurl=write('data/requests/'+rid+'--'+ident+'.native.json',replace_images(native))
  extras={'native_request_url':rawurl,'reasoning_visibility':'summary_only','status':'RECORDED' if response.get('status')=='completed' else 'FAILED','label':'Codex · '+('工具调用' if any(i.get('type') in ['function_call','custom_tool_call'] for i in response.get('output',[])) else '模型回答')}
  exported=export_call(rid,ident,req,response,{'time':meta.get('started'),'omitted':max(0,meta.get('images_before',0)-meta.get('images_after',0))},extras);calls.append(exported)
 manifest={'id':rid,'case_id':case['id'],'model':'astra','mode':'codex_last8','kind':'active','status':state.get('status'),'description':'GPT‑6 Astra 在独立 bwrap 中运行原生 Codex。动作环境与帧预算相同，工具框架与 Claude Code 不同。实际输入保留最近8图；推理只展示服务返回的摘要。','state':state,'isolation':read(source/'private/isolation.json'),'checkpoints':checkpoints(source,state),'frames':fs,'calls':calls,'reference_url':write(f'data/references/{case["id"]}.json',read(source/'private/gt.json'))}
 return {'id':rid,'model':'astra','mode':'codex_last8','status':state.get('status'),'frames':len(fs),'calls':len(calls),'manifest':write('data/runs/'+rid+'.json',manifest)}
def export_active(seed):
 case={'id':f'active-{seed}','title':f'自主探索 {seed}','kind':'active','description':'真实Claude Code · 按调用审阅工具执行与上下文','runs':[]}
 for arm in ['qwen','gemma','flash','astra']:
  source=ROOT/('api_autonomous' if arm in ['flash','astra'] else 'runs')/f'{arm}_{seed}';state=read(source/'state.json',{});fs=frames(source)
  if not state:continue
  rid=f'active-{seed}-{arm}';
  if arm=='astra':
   exported=export_astra(source,case,rid,state,fs)
   case['runs'].append(exported);continue
  ledger={x['id']:x for x in lines(source/'requests/ledger.jsonl')};calls=[]
  for reqp in sorted((source/'requests').glob('*_request.json'),key=lambda p:p.stat().st_mtime):
   if reqp.name.endswith('_claude_request.json'):continue
   ident=reqp.name.removesuffix('_request.json');response=read(reqp.with_name(ident+'_response.json'));request=read(reqp)
   if not request:continue
   meta=ledger.get(ident,{});extra={}
   if not response:
    http=reqp.with_name(ident+'_http.txt')
    if not http.exists() or http.read_text().startswith('200'):continue
    response={'model':arm,'error':http.read_text()};extra={'status':'FAILED','error':http.read_text(),'label':'接口错误（无模型回答）'}
   calls.append(export_call(rid,ident,request,response,meta,extra))
  manifest={'id':rid,'case_id':case['id'],'model':arm,'mode':'claude_last8','kind':'active','status':state.get('status'),'description':'模型通过Claude Code选择工具和动作。每次模型调用的实际输入已保存，包含近期8图移除标记；观察帧列表记录实际执行回执。','state':state,'isolation':read(source/'private/isolation.json'),'checkpoints':checkpoints(source,state),'frames':fs,'calls':calls,'reference_url':write(f'data/references/{case["id"]}.json',read(source/'private/gt.json'))}
  case['runs'].append({'id':rid,'model':arm,'mode':'claude_last8','status':state.get('status'),'frames':len(fs),'calls':len(calls),'manifest':write('data/runs/'+rid+'.json',manifest)})
 return case
cases=[export_common(s) for s in [91100,91101]]
for seed in range(91100,91110):
 c=export_active(seed)
 if c['runs']:cases.append(c)
for prefix,values in BLOCKS.items():write('data/blocks/'+prefix+'.json',values)
write('data/index.json',{'snapshot_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'title':'空间建图复盘','cases':cases,'notes':['这是导出时刻的真实记录快照；后台实验仍可能继续。','Flash记录保留接口实际返回的回答/工具请求及思考token计数；思考正文只有实际返回时才展示。','研究者评价与GT只用于离线复盘，不是模型输入。','图片与上下文采用无损去重存储，原始文字和工具定义保留。'],'summary':{'cases':len(cases),'runs':sum(len(c['runs']) for c in cases),'calls':sum(r['calls'] for c in cases for r in c['runs'])}})
print(json.dumps(read(DATA/'index.json')['summary']),flush=True)
