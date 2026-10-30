const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(file))});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const engine=process.env.TEST_WEBKIT?webkit:chromium;
 const browser=await engine.launch(engine===chromium?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.clock.install({time:new Date('2026-10-25T12:00:00')});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   data.progress.q003={status:'weak',count:4,first:'2026-10-20',last:'2026-10-24',due:'2026-10-27',reviewCount:2};
   data.progress.q004={status:'master',count:1,first:'2026-10-24',last:'2026-10-24',due:'2026-10-28'};
   data.dailyCompletions['2026-10-24']=['q003','q004'];save();startOne('q002','learn');
  });
  assert.equal(await page.locator('.copyInput').count(),10);
  for(let i=0;i<10;i++){
   await page.waitForFunction(()=>!studyInputBusy());await page.locator('.copyInput').nth(i).click();
   await page.locator('.copyInput').nth(i).fill(await page.evaluate(()=>activeCard().answer));
  }
  await page.locator('button[onclick="advance()"]').click();
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
  assert.equal(await page.evaluate(()=>availableReview(data.cards.find(c=>c.id==='q002'))),true);
  await page.evaluate(()=>nav('review'));assert.match(await page.locator('.main').innerText(),/평가 대기/);
  // Ambiguous legacy classifications, completed reviews and old progress remain unchanged.
  assert.equal(await page.evaluate(()=>pr('q003').status),'weak');assert.equal(await page.evaluate(()=>pr('q004').status),'master');
  assert.deepEqual(await page.evaluate(()=>data.dailyCompletions['2026-10-24']),['q003','q004']);
  // Relearning a classified legacy card never reinterprets its old rating or due date.
  await page.evaluate(()=>{startOne('q003','learn');session.stage=3;session.copyDrafts=Array(10).fill(activeCard().answer);session.copyChecked=true;session.repeat=10;session.blankPassed=true;session.free=activeCard().answer;completeLearning()});
  assert.equal(await page.evaluate(()=>pr('q003').status),'weak');assert.equal(await page.evaluate(()=>pr('q003').due),'2026-10-27');
  assert.equal(await page.evaluate(()=>pr('q003').reviewCount),2);
  assert.equal(await page.evaluate(()=>dailyStats().completed),1);
  assert.equal(await page.evaluate(()=>data.dailyCompletions[today].includes('q003')),false);
  await page.evaluate(async()=>{let backup;const d=download;download=(n,t)=>{backup=t};exportJSON();download=d;const c=confirm;window.confirm=()=>true;await importJSON({text:async()=>backup});await applyBackupMerge();window.confirm=c});
  await page.reload();assert.equal(await page.evaluate(()=>pr('q002').status),'unrated');
  await page.clock.fastForward(24*60*60*1000);
  assert.equal(await page.evaluate(()=>reviewQueue().some(c=>c.id==='q002')),true);
  await page.evaluate(()=>startSession([data.cards.find(c=>c.id==='q002')],'review','manual','free'));
  assert.equal(await page.evaluate(()=>session.stage),3);assert.equal(await page.evaluate(()=>session.copyTarget),0);
  assert.equal(await page.locator('[data-study-hint]').count(),1);
  await page.locator('[data-study-hint]').click();await page.waitForFunction(()=>session.hint);
  assert.equal((await page.locator('#study-hint').innerText()).includes('높이 기준'),false);
  await page.locator('#freeInput').fill(await page.evaluate(()=>activeCard().answer));
  await page.locator('button[onclick="reveal()"]').click();await page.waitForFunction(()=>session.revealed);
  assert.match(await page.locator('.studybox').innerText(),/키워드 기반 자동 평가/);
  await page.locator('button[onclick="rate(\'weak\')"]').click();await page.waitForFunction(()=>!session);
  assert.equal(await page.evaluate(()=>pr('q002').status),'weak');assert.equal(await page.evaluate(()=>pr('q002').assessmentOrigin),'review');
  assert.equal(await page.evaluate(()=>pr('q002').firstAssessedAt),'2026-10-26');
  assert.equal(await page.evaluate(()=>dailyStats().completed),0);
  assert.equal(await page.evaluate(()=>reviewQueue().some(c=>c.id==='q002')),false);
  assert.equal(await page.evaluate(()=>availableReview(data.cards.find(c=>c.id==='q002'))),true);
  // Explicit review is available for every grade even after today's unique completion.
  await page.evaluate(()=>startSession([data.cards.find(c=>c.id==='q002')],'review','manual','free'));
  assert.equal(await page.evaluate(()=>session.stage),3);
  assert.equal(await page.evaluate(()=>reviewStats().concepts),1);
  await page.evaluate(()=>nav('review'));
  // Tomorrow modes remain independent of saved mastery, rather than forced adaptive chains.
  await page.clock.fastForward(24*60*60*1000);
  await page.evaluate(()=>startSession([data.cards.find(c=>c.id==='q002')],'review','manual','copy'));
  assert.equal(await page.evaluate(()=>session.stage),1);assert.equal(await page.evaluate(()=>session.copyTarget),3);
  await page.evaluate(()=>{nav('today');startSession([data.cards.find(c=>c.id==='q004')],'review','manual','blank')});
  assert.equal(await page.evaluate(()=>session.stage),2);
  await page.evaluate(()=>{nav('today');data.progress.q005={status:'unknown',count:1,first:'2026-10-20',last:'2026-10-24',due:today};startSession([data.cards.find(c=>c.id==='q005')],'review','manual','free')});
  assert.equal(await page.evaluate(()=>session.stage),3);
  // Importing an older backup without provenance is non-destructive and does not guess ratings.
  await page.evaluate(async()=>{nav('today');const legacy=JSON.parse(JSON.stringify(data));delete legacy.reviewDays;for(const p of Object.values(legacy.progress)){delete p.assessmentOrigin;delete p.firstAssessedAt;delete p.lastAssessedAt}const c=confirm;window.confirm=()=>true;await importJSON({text:async()=>JSON.stringify(legacy)});await applyBackupMerge();window.confirm=c});
  assert.equal(await page.evaluate(()=>pr('q003').reviewCount),2);assert.equal(await page.evaluate(()=>pr('q004').status),'master');
  assert.deepEqual(errors,[]);console.log(engine.name()+': unchanged new-learning stages, initial unrated, independent manual review, unique completion, legacy records and backup passed');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
