import {chromium} from 'playwright';import fs from 'node:fs/promises';
const base=process.env.REVIEW_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.REVIEW_AUTH_TOKEN?{proxy:{server:process.env.HTTPS_PROXY}}:{})});
const context=await browser.newContext({viewport:{width:1500,height:1000}});
if(process.env.REVIEW_AUTH_TOKEN)await context.route('**/*',async route=>{const headers={...route.request().headers()};if(new URL(route.request().url()).origin===new URL(base).origin)headers['OAI-Sites-Authorization']='Bearer '+process.env.REVIEW_AUTH_TOKEN;else delete headers['OAI-Sites-Authorization'];await route.continue({headers})});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/chat.html?run=common-91100-flash-full#call=0&focus=reply');await page.waitForSelector('#reply-0 .complete-answer',{timeout:90000});
 const evidence=await page.evaluate(async()=>{
  const {get,getRequest}=await import('/evidence.js');const r=await get('/data/runs/common-91100-flash-full.json');const d=await get(r.calls[0].detail_url),req=await getRequest(d.request_url);
  return {answer:d.answer,messages:req.messages.length,images:d.images.length};
 });
 if(await page.locator('#reply-0 .complete-answer').textContent()!==evidence.answer)throw new Error('Flash answer truncated or modified');
 if(await page.locator('#call-0 .chat-event.incoming').count()!==evidence.messages)throw new Error('Missing user input');
 if(await page.locator('#call-0 .chat-image').count()!==evidence.images)throw new Error('Missing input images');
 if(!(await page.locator('#chat-description').innerText()).includes('动作由采集脚本产生'))throw new Error('Flash action provenance missing');
 await page.selectOption('#jump-call','1');await page.click('#jump-output');await page.waitForSelector('#reply-1 .complete-answer',{timeout:90000});
 const last=await page.evaluate(async()=>{const {get}=await import('/evidence.js');const r=await get('/data/runs/common-91100-flash-full.json');return (await get(r.calls[1].detail_url)).answer});
 if(await page.locator('#reply-1 .complete-answer').textContent()!==last)throw new Error('200-frame answer mismatch');
 await page.screenshot({path:'test-results/chat-flash.png'});
 // Use a dedicated scope for the persistence check, without changing any case annotation.
 await page.evaluate(async()=>{const {mountNotes}=await import('/chat-notes.js');await mountNotes(document.querySelector('#annotation'),'verification:chat-browser')});
 await page.getByLabel('聊天逐步评价').fill('浏览器核验 <script>inert</script> '+Date.now());await page.getByRole('button',{name:'保存评价',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.chat-note-status').textContent==='已保存到云端');
 const saved=await page.getByLabel('聊天逐步评价').inputValue();
 await page.evaluate(async()=>{const {mountNotes}=await import('/chat-notes.js');await mountNotes(document.querySelector('#annotation'),'verification:chat-browser')});
 if(await page.getByLabel('聊天逐步评价').inputValue()!==saved)throw new Error('Chat annotation did not persist');
 await page.evaluate(()=>localStorage.setItem('spatial-review-draft:verification:chat-browser',JSON.stringify({note:'stale draft',verdict:'issue',baseRevision:0})));
 await page.evaluate(async()=>{const {mountNotes}=await import('/chat-notes.js');await mountNotes(document.querySelector('#annotation'),'verification:chat-browser')});
 await page.waitForFunction(()=>document.querySelector('.chat-note-status').textContent.includes('云端已有新版本'));
 const stored=await page.evaluate(async()=>await(await fetch('/api/notes/verification:chat-browser')).json());if(stored.note!==saved)throw new Error('Stale draft overwrote cloud');
 await page.evaluate(async()=>{const u='/api/notes/verification:chat-browser',r=await(await fetch(u)).json();const cleared=await fetch(u,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({note:'',verdict:'neutral',revision:r.revision})});if(!cleared.ok)throw new Error('Failed to clear verification note');localStorage.removeItem('spatial-review-draft:verification:chat-browser')});
 await page.goto(base+'/chat.html?run=active-91100-qwen#call=4&focus=reply');await page.waitForSelector('#reply-4 .complete-answer',{timeout:90000});
 const exact=await page.evaluate(async()=>{const {get,getRequest}=await import('/evidence.js');const run=await get('/data/runs/active-91100-qwen.json');const d=await get(run.calls[4].detail_url),req=await getRequest(d.request_url);const rows=[...document.querySelectorAll('#call-4 .chat-event:not(.chat-answer)')];return {roles:rows.map(r=>r.dataset.role),expected:req.messages.map(m=>m.role),raw:rows.map(r=>JSON.parse(r.querySelector('.chat-raw:last-child pre').textContent)),messages:req.messages,thinking:d.thinking,answer:d.answer}});
 if(JSON.stringify(exact.roles)!==JSON.stringify(exact.expected)||JSON.stringify(exact.raw)!==JSON.stringify(exact.messages))throw new Error('Full message order/content mismatch');
 if(await page.locator('#reply-4 .complete-answer').textContent()!==exact.answer)throw new Error('Active response mismatch');
 if(exact.thinking&&await page.locator('#reply-4 .chat-reasoning').textContent()!==exact.thinking)throw new Error('Returned thought text mismatch');
 await page.screenshot({path:'test-results/chat-active.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/chat-mobile.png'});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw new Error('Mobile overflow');
 await page.goto(base+'/#case=common-91100&model=flash&mode=full&view=calls&step=0&tab=output');await page.waitForFunction(()=>document.querySelector('#stage-body')?.textContent.includes('模型返回正文'),undefined,{timeout:90000});
 if(!(await page.locator('#chat-link').getAttribute('href')).includes('common-91100-flash-full'))throw new Error('Missing run chat link');
 if(errors.length)throw new Error(errors.join('\n'));
 const report={passed:true,base,flash_complete_answers:true,all_input_images:true,exact_active_messages_and_roles:true,returned_thoughts_preserved:true,script_action_provenance:true,cloud_notes_and_conflicts:true,mobile_no_overflow:true,direct_output_link:true};await fs.writeFile('test-results/chat-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close()}
