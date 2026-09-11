import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1500,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4173/chat.html?run=active-91100-astra');await page.waitForSelector('#reply-0',{timeout:60000});
 const data=await page.evaluate(async()=>{const {get}=await import('/evidence.js');const r=await get('/data/runs/active-91100-astra.json');for(let i=0;i<r.calls.length;i++){const d=await get(r.calls[i].detail_url);if(d.images.length)return {i,d}}throw new Error('No image request exported')});
 await page.selectOption('#jump-call',String(data.i));await page.waitForSelector('#reply-'+data.i,{timeout:60000});
 if(await page.locator('#call-'+data.i+' .chat-image').count()!==data.d.images.length)throw new Error('Nested tool output images omitted');
 if(!(await page.locator('#call-'+data.i).innerText()).includes('实际发送的原生 Responses 请求'))throw new Error('Native request missing');
 if(data.d.thinking&&!(await page.locator('#reply-'+data.i).innerText()).includes('推理摘要（不是完整内部思考）'))throw new Error('Reasoning summary mislabeled');
 if(!(await page.locator('#chat-description').innerText()).includes('Codex'))throw new Error('Wrong framework label');
 const exact=await page.evaluate(async i=>{const {get,getRequest}=await import('/evidence.js');const r=await get('/data/runs/active-91100-astra.json'),d=await get(r.calls[i].detail_url),n=await get(d.native_request_url),v=await getRequest(d.request_url);return {nativeImages:JSON.stringify(n).split('"type":"input_image"').length-1,visible:d.images.length,items:v.messages.filter(m=>m.native_input_item).map(m=>m.native_input_item),input:n.input}},data.i);
 if(exact.nativeImages!==exact.visible||JSON.stringify(exact.items)!==JSON.stringify(exact.input))throw new Error('Native input normalization lost information');
 await page.screenshot({path:'test-results/chat-astra.png'});if(errors.length)throw new Error(errors.join('\n'));console.log('Astra native transcript, tool images and summary provenance verified.');
}finally{await browser.close()}
