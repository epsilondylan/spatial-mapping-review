const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const validScope=s=>typeof s==='string'&&s.length<=240&&/^[a-zA-Z0-9:._-]+$/.test(s);
let ready;
async function database(env){
 if(!env.DB)throw new Error('NOTES_DATABASE_UNAVAILABLE');
 if(!ready)ready=env.DB.prepare('CREATE TABLE IF NOT EXISTS review_notes (scope TEXT PRIMARY KEY, note TEXT NOT NULL, verdict TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)').run().catch(e=>{ready=null;throw e});
 await ready;return env.DB;
}
export async function handleAPI(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/api/health')return json({ok:true,storage:env.DB?'cloud':'unavailable'});
 if(!url.pathname.startsWith('/api/notes'))return json({error:'NOT_FOUND'},404);
 if(!['GET','PUT'].includes(request.method))return json({error:'METHOD_NOT_ALLOWED'},405);
 if(request.method==='PUT'&&request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'CROSS_ORIGIN_WRITE_DENIED'},403);
 try{
  const db=await database(env);
  if(url.pathname==='/api/notes/export'&&request.method==='GET'){
   const rows=await db.prepare('SELECT * FROM review_notes ORDER BY updated_at DESC LIMIT 10001').all();
   if(rows.results.length>10000)return json({error:'EXPORT_TOO_LARGE'},413);
   return json({schema_version:1,exported_at:new Date().toISOString(),notes:rows.results});
  }
  const scope=decodeURIComponent(url.pathname.slice('/api/notes/'.length));
  if(!validScope(scope))return json({error:'INVALID_SCOPE'},400);
  if(request.method==='GET')return json(await db.prepare('SELECT * FROM review_notes WHERE scope=?').bind(scope).first()||{scope,note:'',verdict:'neutral',revision:0,updated_at:null});
  const raw=await request.text();if(raw.length>65536)return json({error:'NOTE_TOO_LARGE'},413);
  let body;try{body=JSON.parse(raw)}catch{return json({error:'INVALID_JSON'},400)}
  if(typeof body.note!=='string'||body.note.length>30000||!['neutral','agree','issue','question'].includes(body.verdict)||!Number.isSafeInteger(body.revision)||body.revision<0)return json({error:'INVALID_NOTE'},400);
  const at=new Date().toISOString();let result;
  if(body.revision===0)result=await db.prepare('INSERT OR IGNORE INTO review_notes (scope,note,verdict,revision,updated_at) VALUES (?,?,?,1,?)').bind(scope,body.note,body.verdict,at).run();
  else result=await db.prepare('UPDATE review_notes SET note=?,verdict=?,revision=revision+1,updated_at=? WHERE scope=? AND revision=?').bind(body.note,body.verdict,at,scope,body.revision).run();
  if(!result.meta.changes)return json({error:'REVISION_CONFLICT',current:await db.prepare('SELECT * FROM review_notes WHERE scope=?').bind(scope).first()},409);
  return json({scope,note:body.note,verdict:body.verdict,revision:body.revision+1,updated_at:at});
 }catch(e){return json({error:e.message==='NOTES_DATABASE_UNAVAILABLE'?e.message:'NOTES_STORAGE_ERROR'},503)}
}
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/'))return handleAPI(request,env);
 if(!env.ASSETS)return new Response('Asset binding unavailable',{status:503});
 if(url.pathname==='/')url.pathname='/index.html';
 let response;
 let compressedJSON=false;
 if(url.pathname.endsWith('.json')){
  const compressedURL=new URL(url);compressedURL.pathname+='.gz';
  // The Sites asset binding resolves a plain GET URL reliably.  Reusing the
  // browser request here caused compressed evidence files to fall through to
  // a 404 on a fresh page load.
  response=await env.ASSETS.fetch(new Request(compressedURL.href,{method:'GET'}));
  compressedJSON=response.ok;
 }
 if(!response||!response.ok)response=await env.ASSETS.fetch(new Request(url.href,{method:'GET'}));
 const h=new Headers(response.headers);h.set('x-content-type-options','nosniff');h.set('referrer-policy','same-origin');
 if(compressedJSON){h.set('content-encoding','gzip');h.set('content-type','application/json; charset=utf-8')}
 h.set('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'");
 return new Response(response.body,{status:response.status,headers:h});
}};
