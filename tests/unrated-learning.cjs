const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(file))});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const engine=process.env.TEST_WEBKIT?webkit:chromium;
 const browser=await engine.launch(engine===chromium?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-25T12:00:00')});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   data.progress.q003={status:'weak',count:4,first:'2026-10-20',last:'2026-10-24',due:'2026-10-27',reviewCount:2};
   data.progress.q004={status:'master',count:1,first:'2026-10-24',last:'2026-10-24',due:'2026-10-28'};
   data.dailyCompletions['2026-10-24']=['q003','q004'];save();startOne('q002','learn');
  });
  for(let i=1;i<=10;i++){
   await page.locator('#typing').fill(await page.evaluate(()=>activeCard().answer));await page.locator('button[onclick="advance()"]').click();
   await page.waitForFunction(n=>session.repeat===n,i);
  }
  await page.waitForFunction(()=>session.stage===2);
  const blanks=page.locator('.blankInput');
  for(let i=0;i<await blanks.count();i++){await blanks.nth(i).click();await blanks.nth(i).fill(await blanks.nth(i).getAttribute('data-key'))}
  await page.locator('button[onclick="checkBlanks()"]').click();await page.waitForFunction(()=>session.blankPassed);
  await page.locator('button[onclick="advance()"]').click();await page.waitForFunction(()=>session.stage===3);
  assert.equal(await page.locator('button[onclick="reveal()"]').count(),0);
  assert.equal(await page.locator('button[onclick="autoRate()"]').count(),0);
  assert.equal(await page.locator('.assess').count(),0);
  assert.match(await page.locator('.studybox').innerText(),/최초 학습에서는 숙지도를 평가하지 않습니다/);
  await page.locator('#freeInput').fill(await page.evaluate(()=>activeCard().answer));
  // Classification entry points cannot assign a rating during initial learning.
  await page.evaluate(()=>{rate('master');autoRate()});assert.equal(await page.evaluate(()=>pr('q002').status),'new');
  await page.locator('button[onclick="completeLearning()"]').click();await page.waitForFunction(()=>!session);
  assert.equal(await page.evaluate(()=>pr('q002').status),'unrated');
  assert.equal(await page.evaluate(()=>pr('q002').due),'2026-10-26');
  assert.equal(await page.evaluate(()=>pr('q002').reviewCount),0);
  assert.equal(await page.evaluate(()=>dailyStats().completed),1);
  assert.equal(await page.evaluate(()=>reviewStats().concepts),0);
  assert.equal(await page.evaluate(()=>pillStatus('unrated')),'평가 대기');
  assert.equal(await page.evaluate(()=>availableReview(data.cards.find(c=>c.id==='q002'))),false);
  await page.evaluate(()=>nav('review'));assert.match(await page.locator('.main').innerText(),/평가 대기/);
  // Ambiguous legacy classifications, completed reviews and old progress remain unchanged.
  assert.equal(await page.evaluate(()=>pr('q003').status),'weak');assert.equal(await page.evaluate(()=>pr('q004').status),'master');
  assert.deepEqual(await page.evaluate(()=>data.dailyCompletions['2026-10-24']),['q003','q004']);
  // Relearning a classified legacy card never reinterprets its old rating or due date.
  await page.evaluate(()=>{startOne('q003','learn');session.stage=3;session.repeat=10;session.blankPassed=true;session.free=activeCard().answer;completeLearning()});
  assert.equal(await page.evaluate(()=>pr('q003').status),'weak');assert.equal(await page.evaluate(()=>pr('q003').due),'2026-10-27');
  assert.equal(await page.evaluate(()=>pr('q003').reviewCount),2);
  await page.evaluate(async()=>{let backup;const d=download;download=(n,t)=>{backup=t};exportJSON();download=d;const c=confirm;window.confirm=()=>true;await importJSON({text:async()=>backup});window.confirm=c});
  await page.reload();assert.equal(await page.evaluate(()=>pr('q002').status),'unrated');
  await page.clock.fastForward(24*60*60*1000);
  assert.equal(await page.evaluate(()=>reviewQueue().some(c=>c.id==='q002')),true);
  await page.evaluate(()=>startOne('q002','review'));
  assert.equal(await page.evaluate(()=>session.stage),3);assert.equal(await page.evaluate(()=>session.copyTarget),0);
  assert.equal(await page.locator('[data-study-hint]').count(),0);
  await page.evaluate(()=>toggleStudyHint());assert.equal(await page.evaluate(()=>session.hint),false);
  await page.locator('#freeInput').fill(await page.evaluate(()=>activeCard().answer));
  await page.locator('button[onclick="reveal()"]').click();await page.waitForFunction(()=>session.revealed);
  assert.match(await page.locator('.studybox').innerText(),/키워드 기반 자동 평가/);
  await page.locator('button[onclick="rate(\'weak\')"]').click();await page.waitForFunction(()=>!session);
  assert.equal(await page.evaluate(()=>pr('q002').status),'weak');assert.equal(await page.evaluate(()=>pr('q002').assessmentOrigin),'review');
  assert.equal(await page.evaluate(()=>pr('q002').firstAssessedAt),'2026-10-26');
  assert.equal(await page.evaluate(()=>dailyStats().completed),0);
  assert.equal(await page.evaluate(()=>reviewQueue().some(c=>c.id==='q002')),false);
  assert.equal(await page.evaluate(()=>availableReview(data.cards.find(c=>c.id==='q002'))),false);
  await page.evaluate(()=>startOne('q002','random'));assert.equal(await page.evaluate(()=>session),null);
  // Tomorrow uses the first saved review rating, and all classified paths remain distinct.
  await page.clock.fastForward(24*60*60*1000);
  await page.evaluate(()=>startOne('q002','review'));assert.equal(await page.evaluate(()=>session.stage),2);
  await page.evaluate(()=>{nav('today');startOne('q004','review')});assert.equal(await page.evaluate(()=>session.stage),3);
  await page.evaluate(()=>{nav('today');data.progress.q005={status:'unknown',count:1,first:'2026-10-20',last:'2026-10-24',due:today};startOne('q005','review')});assert.equal(await page.evaluate(()=>session.stage),0);
  // Importing an older backup without provenance is non-destructive and does not guess ratings.
  await page.evaluate(async()=>{nav('today');const legacy=JSON.parse(JSON.stringify(data));delete legacy.reviewDays;for(const p of Object.values(legacy.progress)){delete p.assessmentOrigin;delete p.firstAssessedAt;delete p.lastAssessedAt}const c=confirm;window.confirm=()=>true;await importJSON({text:async()=>JSON.stringify(legacy)});window.confirm=c});
  assert.equal(await page.evaluate(()=>pr('q003').reviewCount),2);assert.equal(await page.evaluate(()=>pr('q004').status),'master');
  assert.deepEqual(errors,[]);console.log(engine.name()+': initial unrated, no initial assessment, next-day first assessment without hints, same-day exclusions, distinct paths, records and backup passed');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
