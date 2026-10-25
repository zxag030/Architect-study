const { chromium, webkit } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const server = require('node:http').createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.resolve(__dirname,'../index.html')))});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 for(const engine of (process.env.TEST_WEBKIT ? [chromium,webkit] : [chromium])){
 const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}:{})});
 const page=await browser.newPage({viewport:{width:820,height:1180}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-25T12:00:00')});
 await page.goto('http://127.0.0.1:'+server.address().port);
 const stats=()=>page.evaluate(()=>dailyStats());
 assert.deepEqual(await stats(),{goal:18,completed:0,remaining:18,percent:0});
 await page.evaluate(()=>{data.progress.q002={status:'weak',first:today,last:today,count:2};save();selectDay('2026-10-26')});
 assert.equal((await stats()).goal,18);
 // Exercise the actual ten-copy, blank-check, assessment, and save flow.
 async function complete(){
 await page.evaluate(()=>startOne('q001','learn'));
 for(let i=0;i<10;i++){await page.locator('#typing').fill(await page.evaluate(()=>activeCard().answer));await page.locator('button[onclick="advance()"]').click()}
 assert.equal(await page.evaluate(()=>session.stage),2);
 await page.locator('button[onclick="checkBlanks()"]').click();
 assert.equal(await page.evaluate(()=>session.blankPassed),false);
 const blanks=page.locator('.blankInput');
 for(let i=0;i<await blanks.count();i++)await blanks.nth(i).fill(await blanks.nth(i).getAttribute('data-key'));
 await page.locator('button[onclick="checkBlanks()"]').click();
 await page.locator('button[onclick="advance()"]').click();
 assert.equal((await stats()).completed,0);
 await page.locator('#freeInput').fill(await page.evaluate(()=>activeCard().answer));
 await page.locator('button[onclick="reveal()"]').click();
 await page.locator('button[onclick="autoRate()"]').click();
 }
 await complete();
 assert.deepEqual(await stats(),{goal:18,completed:1,remaining:17,percent:6});
 // Repeat without the pre-save assertion, then verify no duplicate.
 await page.evaluate(()=>{startOne('q001','learn');session.stage=3;session.repeat=10;session.blankPassed=true;session.revealed=true;rate('weak')});
 assert.equal((await stats()).completed,1);
 await page.evaluate(()=>{startOne('q003','review');session.revealed=true;rate('master')});
 assert.equal((await stats()).completed,1);
 assert.equal(await page.locator('[role=progressbar]').first().getAttribute('aria-valuenow'),'6');
 // JSON backup round trip retains both new completions and existing records.
 await page.evaluate(async()=>{
  let backup;const original=download;download=(name,text)=>{backup=text};exportJSON();download=original;
  const oldConfirm=window.confirm;window.confirm=()=>true;
  await importJSON({text:async()=>backup});window.confirm=oldConfirm;
 });
 assert.equal((await stats()).completed,1);
 await page.reload();assert.equal((await stats()).completed,1);
 assert.equal(await page.evaluate(()=>data.progress.q002.count),2);
 await page.clock.fastForward(24*60*60*1000);
 assert.deepEqual(await stats(),{goal:9,completed:0,remaining:9,percent:0});
 assert.equal(await page.evaluate(()=>data.dailyCompletions['2026-10-25'].length),1);
 assert.deepEqual(await page.evaluate(()=>dailyStats('2026-11-05')),{goal:0,completed:0,remaining:0,percent:0});
 assert.equal(await page.evaluate(()=>dailyStats('2027-01-01').percent),0);
 await page.evaluate(()=>{data.dailyCompletions[today]=Array.from({length:12},(_,i)=>'test'+i);render()});
 assert.equal((await stats()).percent,100);assert.equal((await stats()).remaining,0);
 for(const width of [820,1024,375]){await page.setViewportSize({width,height:1180});assert.equal(await page.locator('.daily-progress').evaluate(el=>el.scrollWidth<=el.clientWidth),true)}
 assert.deepEqual(errors,[]);
 console.log(engine.name()+': all daily progress and UI checks passed');await browser.close();
 }
 server.close();
})().catch(e=>{console.error(e);process.exit(1)});
