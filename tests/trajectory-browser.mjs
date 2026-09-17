import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const base = process.env.REVIEW_URL || 'http://127.0.0.1:4174';
const browser = await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROME_EXECUTABLE ? {executablePath:process.env.PLAYWRIGHT_CHROME_EXECUTABLE} : {})});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(base + '/trajectories.html', {waitUntil:'domcontentloaded'});
  await page.waitForSelector('.trajectory-card');
  const count = await page.locator('.trajectory-card').count();
  if (count < 53) throw new Error(`catalog expected at least 53 cards, got ${count}`);
  if (!await page.locator('.trajectory-card', {hasText:'SpatialClaw tools + Codex'}).count()) throw new Error('SpatialClaw card missing');

  await page.goto(base + '/#case=multiroom-distinct-95516&model=flash&mode=active_full_rgb&view=calls&step=0&tab=output', {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#run-description')?.textContent.includes('17 次调用'));
  await page.waitForFunction(() => document.querySelector('#stage-body')?.textContent.includes('exploration_operation'));
  if (!(await page.locator('#stage-body').innerText()).includes('exploration_operation')) throw new Error('Flash operation missing');
  await page.click('#frames-view');
  await page.waitForFunction(() => document.querySelector('#step-title')?.textContent.includes('第 1 帧'));

  await page.goto(base + '/#case=active-91102&model=flash&mode=claude_last8&view=calls&step=0&tab=map', {waitUntil:'domcontentloaded'});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('.trajectory-map-svg', {state:'attached'});
  if (!(await page.locator('.trajectory-review').innerText()).includes('轨迹 × 模型地图 × GT')) throw new Error('trajectory review panel missing');
  if ((await page.locator('.trajectory-frame-marker').count()) < 2) throw new Error('active trajectory markers missing');
  const checkpoints = page.locator('.trajectory-checkpoint-label select');
  await checkpoints.selectOption('0');
  await page.waitForFunction(() => document.querySelector('.trajectory-history-scope')?.textContent.includes('预算 20 帧／实际观察 20 帧'));
  if ((await page.locator('.trajectory-frame-marker').count()) !== 20) throw new Error('20-frame checkpoint did not truncate trajectory');
  if (!(await page.locator('.trajectory-first-entries').innerText()).includes('首次保存')) throw new Error('object first-entry table missing');
  await checkpoints.selectOption('2');
  await page.waitForFunction(() => document.querySelector('.trajectory-history-scope')?.textContent.includes('预算 60 帧／实际观察 60 帧'));
  if ((await page.locator('.trajectory-frame-marker').count()) !== 60) throw new Error('60-frame checkpoint did not restore trajectory history');
  await page.locator('.trajectory-decisions summary').click();
  await page.locator('.trajectory-jump').nth(1).click();
  await page.waitForFunction(() => document.querySelector('#frames-view')?.classList.contains('selected'));

  await page.goto(base + '/#case=multiroom-distinct-95516&model=flash&mode=active_full_rgb&view=calls&step=0&tab=map', {waitUntil:'domcontentloaded'});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('.trajectory-map-svg', {state:'attached'});
  if ((await page.locator('.trajectory-frame-marker').count()) !== 12) throw new Error('multiroom Flash review poses missing');

  await page.goto(base + '/#case=multiroom-distinct-95516&model=luna&mode=static_exact4&view=frames&step=0&tab=output', {waitUntil:'domcontentloaded'});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1000);
  const lunaDescription = await page.locator('#run-description').innerText();
  if (!lunaDescription.includes('四视角盲测')) throw new Error('Luna manifest did not load: ' + lunaDescription);
  const lunaStage = await page.locator('#stage-body').innerText();
  if (!lunaStage.includes('固定盲测视角')) throw new Error('Luna fixed-view provenance missing: ' + lunaStage.slice(0, 300));

  await page.goto(base + '/#case=spatialclaw-0825&model=spatialclaw&mode=tool_audit&view=calls&step=0&tab=output', {waitUntil:'domcontentloaded'});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => document.querySelector('#stage-body')?.textContent.includes('工具审计'));
  if (!(await page.locator('#stage-body').innerText()).includes('audit_toolchain')) throw new Error('Audit tool chain missing');

  await page.goto(base + '/chat.html?run=multiroom-distinct-95516-luna&view=requests', {waitUntil:'domcontentloaded'});
  await page.waitForSelector('#reply-0');
  if (!(await page.locator('#chat-description').innerText()).includes('固定四视角盲测')) throw new Error('Luna condition label missing');
  if ((await page.locator('#trajectory option').count()) < 53) throw new Error('chat selector missing runs');
  await page.screenshot({path:'test-results/new-trajectories.png',fullPage:true});
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({catalogCards:count,flashActive:true,lunaStatic:true,spatialclawAudit:true,selectorRuns:53}));
} finally {
  await browser.close();
}
