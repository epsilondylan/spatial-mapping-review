import test from 'node:test';import assert from 'node:assert/strict';import {handleAPI} from '../worker/index.mjs';import {sqliteBinding} from '../scripts/local-db.mjs';
const DB=sqliteBinding(),env={DB};
const call=(method,scope,body,origin='https://review.example')=>handleAPI(new Request('https://review.example/api/notes/'+scope,{method,headers:{'content-type':'application/json',origin},body:method==='GET'?undefined:JSON.stringify(body)}),env);
test('notes persist UTF-8 and preserve model-shaped text as inert data',async()=>{
 let r=await call('GET','call:demo');assert.equal((await r.json()).revision,0);
 r=await call('PUT','call:demo',{note:'检查第8帧 <script>alert(1)</script>',verdict:'question',revision:0});assert.equal(r.status,200);
 const stored=await (await call('GET','call:demo')).json();assert.equal(stored.note,'检查第8帧 <script>alert(1)</script>');assert.equal(stored.revision,1);
});
test('concurrent stale edit cannot silently overwrite a newer annotation',async()=>{
 await call('PUT','frame:run:8',{note:'first',verdict:'neutral',revision:0});
 assert.equal((await call('PUT','frame:run:8',{note:'new',verdict:'issue',revision:1})).status,200);
 const stale=await call('PUT','frame:run:8',{note:'stale',verdict:'neutral',revision:1});assert.equal(stale.status,409);assert.equal((await stale.json()).current.note,'new');
});
test('rejects cross-origin changes and malformed payloads',async()=>{
 assert.equal((await call('PUT','call:demo',{note:'bad',verdict:'neutral',revision:1},'https://evil.example')).status,403);
 assert.equal((await call('PUT','call:demo',{note:'x',verdict:'invalid',revision:1})).status,400);
 assert.equal((await call('GET','invalid%2Fscope')).status,400);
});
test('exports stored annotations and reports missing database honestly',async()=>{
 const out=await (await call('GET','export')).json();assert(out.notes.some(n=>n.scope==='frame:run:8'&&n.note==='new'));
 const fail=await handleAPI(new Request('https://review.example/api/notes/call:test'),{});assert.equal(fail.status,503);
});
