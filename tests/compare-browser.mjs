import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1500,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:4173/compare.html#case=active-91101');await page.waitForSelector('#compare-rows tr');
 const rows=await page.locator('#compare-rows').innerText();if(!rows.includes('Gemini 3.8 Flash')||!rows.includes('60（沿用）'))throw new Error('Missing Flash/early stop rows');
 if(await page.locator('#compare-chart circle').count()<8)throw new Error('Checkpoint curve missing');
 const link=page.locator('#compare-rows a[href*="active-91101-flash"]').first();await link.click();await page.waitForSelector('#reply-0');
 const raw=await page.evaluate(async()=>{const {get,getRequest}=await import('/evidence.js');const r=await get('/data/runs/active-91101-flash.json');const d=await get(r.calls[0].detail_url);return d});
 if(!raw.tools.length)throw new Error('Autonomous Flash has no tool output');
 if(!(await page.locator('#reply-0').innerText()).includes(raw.tools[0].name))throw new Error('Flash tool call not rendered');
 if((await page.locator('#chat-description').innerText()).includes('动作由采集脚本'))throw new Error('Autonomous Flash mislabeled');
 await page.goto('http://127.0.0.1:4173/compare.html#case=active-91101');await page.waitForSelector('#compare-chart circle');await page.screenshot({path:'test-results/compare-desktop.png'});
 await page.selectOption('#compare-metric','diag_ungated_position_median');const download=page.waitForEvent('download');await page.click('#save-chart');await(await download).saveAs('test-results/compare-position.svg');
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw new Error('Mobile overflow');
 if(errors.length)throw new Error(errors.join('\n'));console.log('Comparison curves and autonomous Flash chat verified');
}finally{await browser.close()}
