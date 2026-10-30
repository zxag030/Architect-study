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
  const page=await browser.newPage({viewport:{width:820,height:1180},hasTouch:true}),errors=[];
  page.on('dialog',dialog=>dialog.accept());
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-29T12:00:00')});
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   const grades=['unknown','weak','master','unrated','new'];
   data.cards=Array.from({length:25},(_,i)=>({id:'review-test-'+String(i).padStart(2,'0'),q:'복습 테스트 '+i,
    answer:'가설지지체\n작업공간\n태핑',blanks:['가설지지체','작업공간','태핑'],page:80+i,kind:'빈출',category:'테스트'}));
   data.progress={};data.dailyCompletions={'2026-10-28':['legacy-learned']};data.reviewDays={'2026-10-28':{'legacy-review':{completed:true,attempts:1,retries:0}}};data.reviewHistory=[];
   data.cards.forEach((c,i)=>{const status=grades[i%grades.length];if(status!=='new')data.progress[c.id]={status,first:'2026-10-20',last:'2026-10-25',due:i<10?'2026-10-29':'2026-11-01',count:7,reviewCount:4}});
   save();nav('review');
  });
  async function setup({mode='free',target='all',limit='all',grades=['unknown','weak','master','unrated','new']}={}){
   await page.evaluate(()=>nav('review'));
   await page.locator('#review-form [name=mode]').selectOption(mode);
   await page.locator('#review-form [name=target]').selectOption(target);
   const boxes=page.locator('#review-form input[name=grades]');
   for(let i=0;i<await boxes.count();i++){
    const box=boxes.nth(i),value=await box.getAttribute('value');
    await box.setChecked(grades.includes(value));
   }
   const shuffle=page.locator('#review-form input[name=shuffle]');if(await shuffle.count())await shuffle.uncheck();
   await page.locator('#review-form [name=limit]').selectOption(limit);
   await page.locator('#review-form').evaluate(form=>form.requestSubmit());
   await page.waitForFunction(()=>session!==null);
  }
  async function leave(){await page.evaluate(()=>nav('review'))}
  async function selectOne(id,mode){
   // Seed a one-card custom selection through the public session entry point,
   // retaining real UI controls for completing each independent mode.
   await page.evaluate(({id,mode})=>startSession([data.cards.find(c=>c.id===id)],'review','manual',mode),{id,mode});
   await page.waitForFunction(()=>session!==null);
  }
  async function fillBlanks(){
   const inputs=page.locator('.blankInput');
   for(let i=0;i<await inputs.count();i++){
    await page.waitForFunction(()=>!studyInputBusy());await inputs.nth(i).click();
    await inputs.nth(i).fill(await inputs.nth(i).getAttribute('data-key'));
   }
  }
  async function classify(id,status,text){
   await selectOne(id,'free');assert.equal(await page.evaluate(()=>session.stage),3);
   const before=await page.evaluate(id=>({history:(data.reviewHistory||[]).length,status:pr(id).status}),id);
   await page.locator('#freeInput').fill(text||await page.evaluate(()=>activeCard().answer));
   await page.locator('button[onclick="reveal()"]').click();await page.waitForFunction(()=>session.revealed);
   assert.equal(await page.evaluate(()=>data.reviewHistory.length),before.history);
   assert.equal(await page.evaluate(id=>pr(id).status,id),before.status);
   await page.locator(`button[onclick="rate('${status}')"]`).click();await page.waitForFunction(()=>!session);
  }
  // Requested batch size, tier priority, whole-bank coverage and explicit grade access.
  await setup({target:'priority',limit:'10'});
  assert.equal(await page.evaluate(()=>session.ids.length),10);
  assert.deepEqual(await page.evaluate(()=>session.ids.map(id=>pr(id).status)),Array(5).fill('unknown').concat(Array(5).fill('weak')));
  assert.equal(await page.evaluate(()=>new Set(session.ids).size),10);await leave();
  await setup({limit:'20'});assert.equal(await page.evaluate(()=>session.ids.length),20);await leave();
  await setup();assert.equal(await page.evaluate(()=>session.ids.length),25);await leave();
  for(const grade of ['unknown','weak','master','unrated','new']){
   await setup({grades:[grade]});assert.equal(await page.evaluate(()=>session.ids.length),5);
   assert.equal(await page.evaluate(grade=>session.ids.every(id=>pr(id).status===grade),grade),true);await leave();
  }
  await setup({target:'due'});
  assert.equal(await page.evaluate(()=>session.ids.every(id=>{const p=pr(id);return p.due&&p.due<=today})),true);
  assert.ok(await page.evaluate(()=>session.ids.length>0));await leave();
  // Copy review finishes after three exact repetitions, without blanks or free recall.
  await selectOne('review-test-00','copy');assert.equal(await page.evaluate(()=>session.stage),1);
  assert.equal(await page.locator('.copyInput').count(),3);
  await page.locator('.copyInput').first().click();await page.locator('.copyInput').first().fill('오답');await page.locator('button[onclick="advance()"]').click();
  assert.equal(await page.evaluate(()=>session.repeat),0);
  for(let i=0;i<3;i++){
   await page.waitForFunction(()=>!studyInputBusy());await page.locator('.copyInput').nth(i).click();
   await page.locator('.copyInput').nth(i).fill(await page.evaluate(()=>activeCard().answer));
  }
  await page.locator('button[onclick="advance()"]').click();await page.waitForFunction(()=>session.repeat===3);
  assert.equal(await page.evaluate(()=>session.stage),1);
  assert.equal(await page.locator('.blankInput,#freeInput').count(),0);
  await page.locator('button[onclick="completeModeReview()"]').click();await page.waitForFunction(()=>!session);
  assert.equal(await page.evaluate(()=>pr('review-test-00').status),'unknown');
  assert.equal(await page.evaluate(()=>dailyStats().completed),0);
  assert.equal(await page.evaluate(()=>reviewStats().concepts),1);
  assert.equal(await page.evaluate(()=>data.reviewHistory.at(-1).mode),'copy');
  assert.equal(await page.evaluate(()=>pr('review-test-00').reviewCount),5);
  // Blanks: first-character hint, answer reveal without completion or promotion, complete reset.
  await selectOne('review-test-00','blank');assert.equal(await page.evaluate(()=>session.stage),2);
  const historyBefore=await page.evaluate(()=>data.reviewHistory.length);
  await page.locator('[data-study-hint]').click();await page.waitForFunction(()=>session.hint);
  const hint=await page.locator('#study-hint').innerText();
  assert.ok(hint.length>0);assert.equal(hint.includes('가설지지체'),false);assert.equal(hint.includes('작업공간'),false);
  await page.locator('button[onclick="showReviewAnswer()"]').click();
  await page.waitForFunction(()=>session.answerSeen);
  await page.evaluate(()=>openSource(activeCard().page));await page.getByRole('button',{name:'닫기',exact:true}).click();
  assert.equal(await page.locator('#review-answer').isVisible(),true);
  assert.equal(await page.evaluate(()=>data.reviewHistory.length),historyBefore);
  assert.equal(await page.evaluate(()=>pr('review-test-00').status),'unknown');
  await page.locator('button[onclick="checkBlanks()"]').click();await page.waitForFunction(()=>session.checked);
  assert.equal(await page.evaluate(()=>session.blankPassed),false);
  await page.locator('button[onclick="retryBlanks()"]').click();
  await page.waitForFunction(()=>!session.checked&&!session.hint&&!session.answerSeen);
  assert.deepEqual(await page.locator('.blankInput').evaluateAll(els=>els.map(el=>el.value)),['','','']);
  assert.equal(await page.locator('.blankInput.right,.blankInput.wrong,.blank-feedback').count(),0);
  await fillBlanks();await page.locator('button[onclick="checkBlanks()"]').click();await page.waitForFunction(()=>session.blankPassed);
  assert.equal(await page.evaluate(()=>session.stage),2);
  assert.equal(await page.locator('#freeInput,.copyInput').count(),0);
  await page.locator('button[onclick="completeModeReview()"]').click();await page.waitForFunction(()=>!session);
  assert.equal(await page.evaluate(()=>reviewStats().concepts),1); // same card/day, different mode
  assert.equal(await page.evaluate(()=>reviewStats().attempts),2);
  assert.equal(await page.evaluate(()=>pr('review-test-00').reviewCount),5);
  assert.equal(await page.evaluate(()=>data.reviewHistory.length),historyBefore+1);
  assert.equal(await page.evaluate(()=>data.reviewHistory.at(-1).hintUsed),true);
  assert.equal(await page.evaluate(()=>data.reviewHistory.at(-1).answerViewed),true);
  assert.equal(await page.evaluate(()=>pr('review-test-00').status),'unknown');
  // Manual free-recall rating wins over the keyword recommendation and gives base intervals.
  await classify('review-test-01','master','전혀 모르겠습니다');
  assert.equal(await page.evaluate(()=>pr('review-test-01').status),'master');
  assert.equal(await page.evaluate(()=>pr('review-test-01').due),'2026-11-02');
  const event=await page.evaluate(()=>data.reviewHistory.at(-1));
  assert.equal(event.cardId,'review-test-01');assert.equal(event.date,'2026-10-29');
  assert.equal(event.mode,'free');assert.equal(event.status,'master');assert.equal(event.nextDue,'2026-11-02');assert.ok(event.id);
  await classify('review-test-02','weak');assert.equal(await page.evaluate(()=>pr('review-test-02').due),'2026-10-31');
  await classify('review-test-03','unknown');assert.equal(await page.evaluate(()=>pr('review-test-03').due),'2026-10-30');
  // Arbitrary practice remains available for a mastered card already reviewed today.
  await classify('review-test-01','master');assert.equal(await page.evaluate(()=>pr('review-test-01').due),'2026-11-02');
  assert.equal(await page.evaluate(()=>reviewStats().concepts),4);
  // A later-day repeated strong recall adjusts spacing, then a downgrade resets it.
  await page.clock.fastForward(24*60*60*1000);
  await classify('review-test-01','master');assert.equal(await page.evaluate(()=>pr('review-test-01').due),'2026-11-07');
  await page.clock.fastForward(24*60*60*1000);
  await classify('review-test-01','weak');assert.equal(await page.evaluate(()=>pr('review-test-01').due),'2026-11-02');
  // Reviewing a never-learned problem cannot count as completion of new stages 1-3.
  await classify('review-test-04','master');
  assert.equal(await page.evaluate(()=>isNewConcept(data.cards.find(c=>c.id==='review-test-04'))),true);
  assert.equal(await page.evaluate(()=>pr('review-test-04').learningCompleted),false);
  assert.equal(await page.evaluate(()=>dailyStats().completed),0);
  assert.equal(await page.evaluate(()=>pr('review-test-04').first),undefined);
  assert.deepEqual(await page.evaluate(()=>data.dailyCompletions['2026-10-28']),['legacy-learned']);
  assert.equal(await page.evaluate(()=>data.reviewDays['2026-10-28']['legacy-review'].completed),true);
  // Persistent history and daily unique completion survive reopening.
  const history=await page.evaluate(()=>data.reviewHistory.length);await page.reload();
  assert.equal(await page.evaluate(()=>data.reviewHistory.length),history);
  assert.equal(await page.evaluate(()=>new Set(data.reviewHistory.map(e=>e.id)).size),history);
  for(const width of [375,820,1024]){
   await page.setViewportSize({width,height:1180});await page.evaluate(()=>nav('review'));
   assert.equal(await page.locator('#review-form').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  }
  assert.deepEqual(errors,[]);
  console.log(engine.name()+': quantity/tier/target selection, independent copy/blank/free, hints/retry, manual ratings/spacing, dedup/history, unlearned separation and responsive UI passed');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exit(1)});
