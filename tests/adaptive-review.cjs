const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}
 res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const engine=process.env.TEST_WEBKIT?webkit:chromium;
 const browser=await engine.launch(engine===chromium?{headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-25T12:00:00')});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   for(const [id,status] of [['q002','master'],['q003','weak'],['q011','unknown']]){
    data.progress[id]={status,first:'2026-10-20',last:plusDays(today,-1),due:plusDays(today,4),count:5,reviewCount:4};
   }save();
  });
  assert.deepEqual(await page.evaluate(()=>reviewQueue().map(c=>c.id)),['q011','q003','q002']);
  async function copy(times,testWrong=false){
   if(testWrong){await page.locator('#typing').fill('틀린 답안');await page.locator('button[onclick="advance()"]').click();assert.equal(await page.evaluate(()=>session.repeat),0)}
   for(let i=0;i<times;i++){
    await page.locator('#typing').fill(await page.evaluate(()=>activeCard().answer));
    await page.locator('button[onclick="advance()"]').click();await page.waitForFunction(n=>session.repeat===n,i+1);
    if(i+1<times){assert.equal(await page.evaluate(()=>session.stage),1);assert.equal(await page.evaluate(()=>session.repeat),i+1);assert.equal(await page.locator('#typing').inputValue(),'')}
   }
   assert.equal(await page.evaluate(()=>session.stage),2);
  }
  async function blanks(testWrong=false){
   if(testWrong){
    await page.locator('button[onclick="checkBlanks()"]').click();await page.waitForFunction(()=>session.checked);assert.equal(await page.evaluate(()=>session.blankPassed),false);
    assert.equal(await page.locator('button[onclick="advance()"]').isDisabled(),true);
    await page.locator('button[onclick="retryBlanks()"]').click();await page.waitForFunction(()=>!session.checked);
   }
   const inputs=page.locator('.blankInput');
   for(let i=0;i<await inputs.count();i++){await inputs.nth(i).click();await inputs.nth(i).fill(await inputs.nth(i).getAttribute('data-key'));}
   await page.locator('button[onclick="checkBlanks()"]').click();await page.waitForFunction(()=>session.blankPassed);
   await page.locator('button[onclick="advance()"]').click();
   assert.equal(await page.evaluate(()=>session.stage),3);
  }
  async function free(text,manual){
   await page.locator('#freeInput').fill(text);
   await page.locator('button[onclick="reveal()"]').click();await page.waitForFunction(()=>session.revealed);
   assert.match(await page.locator('.studybox').innerText(),/AI 의미 채점이 아니며/);
   if(manual)await page.locator(`button[onclick="rate('${manual}')"]`).click();
   else await page.locator('button[onclick="autoRate()"]').click();
  }
  async function unknownRoute(testWrong=false){
   assert.equal(await page.evaluate(()=>session.stage),0);
   assert.equal(await page.locator('#typing').count(),0);
   assert.match(await page.locator('.studybox').innerText(),/정답 확인/);
   await page.locator('button[onclick="advance()"]').click();
   assert.equal(await page.evaluate(()=>session.answerConfirmed),true);
   assert.equal(await page.evaluate(()=>session.copyTarget),3);
   await copy(3,testWrong);await blanks(testWrong);
  }
  // Master: free recall once, old scheduling/first/counts retained.
  await page.evaluate(()=>startOne('q002','review'));
  assert.equal(await page.evaluate(()=>session.stage),3);
  await free(await page.evaluate(()=>activeCard().answer));
  assert.equal(await page.evaluate(()=>pr('q002').due), '2026-10-29');
  assert.equal(await page.evaluate(()=>pr('q002').first), '2026-10-20');
  assert.equal(await page.evaluate(()=>pr('q002').reviewCount),5);
  assert.equal(await page.evaluate(()=>reviewQueue().some(c=>c.id==='q002')),false);
  assert.equal(await page.evaluate(()=>dailyStats().completed),0);
  // Weak: every blank must pass before free recall; partial answer stays weak.
  await page.evaluate(()=>startOne('q003','review'));
  assert.equal(await page.evaluate(()=>session.stage),2);
  await blanks(true);
  const partial=await page.evaluate(()=>activeCard().blanks.slice(0,2).join(' '));
  assert.equal(await page.evaluate(text=>autoAssess(activeCard(),text).status,partial),'weak');
  await free(partial);
  assert.equal(await page.evaluate(()=>pr('q003').due),'2026-10-27');
  // Unknown: explicit answer screen + exactly 3 correct copies + blanks.
  await page.evaluate(()=>startOne('q011','review'));
  await unknownRoute(true);await free('전혀 기억하지 못함');
  assert.equal(await page.evaluate(()=>session),null);
  assert.equal(await page.evaluate(()=>pr('q011').due),'2026-10-26');
  assert.deepEqual(await page.evaluate(()=>rereviewQueue().map(c=>c.id)),['q011']);
  assert.equal(await page.evaluate(()=>reviewQueue().length),0);
  // General and random selection both exclude concepts reviewed today.
  await page.evaluate(()=>startRandom());assert.equal(await page.evaluate(()=>session),null);
  await page.evaluate(()=>startOne('q002','random'));assert.equal(await page.evaluate(()=>session),null);
  // One pending entry survives reload; abandoning the retry consumes no allowance.
  await page.reload();await page.evaluate(()=>{nav('review')});
  assert.match(await page.locator('.main').innerText(),/일반 복습 대기/);
  assert.match(await page.locator('.main').innerText(),/오늘의 재복습 대기/);
  await page.getByRole('button',{name:'당일 재복습 시작',exact:true}).click();
  await page.evaluate(()=>nav('review'));
  assert.equal(await page.evaluate(()=>reviewRecord('q011').retries),0);
  for(let attempt=1;attempt<=2;attempt++){
   await page.getByRole('button',{name:'당일 재복습 시작',exact:true}).click();
   await unknownRoute();await free('전혀 기억하지 못함');
   assert.equal(await page.evaluate(()=>session),null);
   assert.equal(await page.evaluate(()=>reviewRecord('q011').retries),attempt);
   assert.equal(await page.evaluate(()=>rereviewQueue().length),attempt===1?1:0);
   assert.equal(await page.evaluate(()=>reviewQueue().length),0);
   await page.evaluate(()=>nav('review'));
  }
  assert.equal(await page.getByRole('button',{name:'당일 재복습 시작',exact:true}).isDisabled(),true);
  await page.evaluate(()=>startOne('q011','rereview'));assert.equal(await page.evaluate(()=>session),null);
  // Reaching the retry cap cannot be bypassed by a same-day random session.
  await page.evaluate(()=>startOne('q011','random'));assert.equal(await page.evaluate(()=>session),null);
  assert.equal(await page.evaluate(()=>reviewRecord('q011').retries),2);
  assert.equal(await page.evaluate(()=>dailyStats().completed),0);
  // Backup round-trip preserves the daily cap and the prior record fields.
  await page.evaluate(async()=>{
   let backup;const old=download;download=(name,text)=>{backup=text};exportJSON();download=old;
   const confirmOld=confirm;window.confirm=()=>true;await importJSON({text:async()=>backup});window.confirm=confirmOld;
  });
  assert.equal(await page.evaluate(()=>reviewRecord('q011').retries),2);
  assert.equal(await page.evaluate(()=>dailyStats().completed),0);
  const attempts=await page.evaluate(()=>reviewRecord('q011').attempts);
  assert.equal(await page.evaluate(()=>pr('q011').reviewCount),4+attempts);
  assert.equal(await page.evaluate(()=>reviewStats().concepts),3);
  // Date rollover: old history remains, yesterday's completions are eligible again.
  await page.clock.fastForward(24*60*60*1000);
  assert.equal(await page.evaluate(()=>today),'2026-10-26');
  assert.equal(await page.evaluate(()=>rereviewQueue().length),0);
  assert.equal(await page.evaluate(()=>reviewStats().concepts),0);
  assert.equal(await page.evaluate(()=>data.reviewDays['2026-10-25'].q011.retries),2);
  assert.equal(await page.evaluate(()=>reviewQueue().length),3);
  // Tomorrow random selection uses each saved mastery path and resets no history.
  await page.evaluate(()=>startRandom());
  assert.deepEqual((await page.evaluate(()=>session.ids)).sort(),['q002','q003','q011']);
  for(let i=0;i<3;i++){
   const {status,stage}=await page.evaluate(()=>({status:pr(activeCard().id).status,stage:session.stage}));
   if(status==='master'){assert.equal(stage,3);await free(await page.evaluate(()=>activeCard().answer))}
   else if(status==='weak'){assert.equal(stage,2);await blanks();await free('전혀 모르겠습니다','weak')}
   else{await unknownRoute();await free('전혀 기억하지 못함')}
  }
  assert.equal(await page.evaluate(()=>reviewRecord('q011').retries),0);
  await page.evaluate(()=>startOne('q011','rereview'));await unknownRoute();await free(await page.evaluate(()=>activeCard().answer));
  assert.equal(await page.evaluate(()=>pr('q011').status),'master');
  assert.equal(await page.evaluate(()=>rereviewQueue().length),0);
  // A real legacy v2-shaped backup (no new field) still imports without resetting progress.
  const count=await page.evaluate(()=>pr('q011').count);
  await page.evaluate(async()=>{const legacy=JSON.parse(JSON.stringify(data));delete legacy.reviewDays;const old=confirm;window.confirm=()=>true;await importJSON({text:async()=>JSON.stringify(legacy)});window.confirm=old});
  assert.equal(await page.evaluate(()=>pr('q011').count),count);
  assert.equal(await page.evaluate(()=>pr('q011').status),'master');
  await page.evaluate(()=>startOne('q011','review'));assert.equal(await page.evaluate(()=>session),null);
  await page.clock.fastForward(24*60*60*1000);await page.evaluate(()=>startOne('q011','review'));assert.equal(await page.evaluate(()=>session.stage),3);
  assert.deepEqual(errors,[]);
  console.log(engine.name()+': adaptive master/weak/unknown, random, retry cap/dedup, schedules, new learning, rollover and backup compatibility passed');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exit(1)});
