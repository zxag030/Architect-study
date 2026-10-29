const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(file))});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const engine=process.env.TEST_WEBKIT?webkit:chromium;
 const browser=await engine.launch(engine===chromium?{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{const card={id:'ime-fixture',q:'입력 테스트',answer:'가설지지체\n작업공간\n태핑',blanks:['가설지지체','작업공간','태핑'],kind:'빈출',category:'테스트',page:80};data.cards.push(card);data.progress[card.id]={status:'weak',count:7};startSession([card],'review','manual','blank');window.originalBlanks=[...document.querySelectorAll('.blankInput')]});
  assert.equal(await page.locator('.blankInput[oninput]').count(),0);
  assert.equal(await page.locator('.blankInput').evaluateAll(els=>new Set(els.map(el=>el.id)).size),3);
  // Simulated native event ordering; this is not the actual OS Korean keyboard.
  await page.locator('.blankInput').nth(0).click();
  await page.evaluate(()=>{
   const [a,b]=originalBlanks;
   a.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));a.value='가설ㅈ';
   a.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:'가설ㅈ'}));
   a.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,isComposing:true,inputType:'insertCompositionText',data:'가설ㅈ'}));
   a.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText'}));
   window.selection=a.selectionStart;renderSession();render();shell('must not replace');
   b.focus();
   window.handoffEditable=!b.readOnly;
   window.ghostAllowed=b.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,isComposing:true,inputType:'insertCompositionText',data:'가설지지체'}));
   // A native readonly control cannot apply the stale composition text.
   if(!b.readOnly&&ghostAllowed)b.value='가설지지체';
   a.value='가설지지체';a.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));a.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromComposition'}));
  });
  assert.equal(await page.evaluate(()=>originalBlanks.every(el=>el.isConnected)),true);
  assert.equal(await page.evaluate(()=>handoffEditable),false);assert.equal(await page.evaluate(()=>ghostAllowed),false);
  assert.equal(await page.locator('.blankInput').nth(1).inputValue(),'');
  await page.waitForFunction(()=>!studyInputBusy());
  assert.equal(await page.evaluate(()=>session.blank[0]),'가설지지체');
  async function compose(index,text){
   await page.waitForFunction(()=>!studyInputBusy());
   await page.locator('.blankInput').nth(index).click();
   await page.evaluate(({index,text})=>{const el=document.querySelectorAll('.blankInput')[index];if(el.readOnly)throw Error('editor not activated');el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value=text.slice(0,-1);el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));el.value=text;el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));el.dispatchEvent(new InputEvent('input',{bubbles:true}))},{index,text});
   await page.waitForFunction(()=>!studyInputBusy());
  }
  await compose(1,'작업공간');await compose(2,'태핑');
  assert.deepEqual(await page.evaluate(()=>session.blank),['가설지지체','작업공간','태핑']);
  await page.locator('.blankInput').nth(2).press('Backspace');assert.equal(await page.locator('.blankInput').nth(2).inputValue(),'태');
  await compose(2,'태핑');
  // No app-induced blur during composition; a pending grading action waits for native end.
  const beforeEnd=await page.evaluate(()=>{
   const el=originalBlanks[2];el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='태ㅍ';
   window.blurCalls=0;const blur=el.blur;el.blur=()=>{blurCalls++;return blur.call(el)};
   checkBlanks();const result={checked:session.checked,focused:document.activeElement===el,blurCalls};
   el.value='태핑';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));el.dispatchEvent(new InputEvent('input',{bubbles:true}));return result;
  });
  assert.equal(beforeEnd.checked,false);assert.equal(beforeEnd.focused,true);assert.equal(beforeEnd.blurCalls,0);
  await page.waitForFunction(()=>session.blankPassed);
  await compose(0,'오답');await page.locator('button[onclick="checkBlanks()"]').click();await page.waitForFunction(()=>session.checked);
  assert.equal(await page.evaluate(()=>session.blankPassed),false);
  // Hints update in place, including when requested during composition.
  await page.waitForFunction(()=>!studyInputBusy());await page.locator('.blankInput').nth(0).click();
  await page.evaluate(()=>{const el=originalBlanks[0];el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='가설';toggleStudyHint();el.value='가설지지체';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));el.dispatchEvent(new InputEvent('input',{bubbles:true}))});
  await page.waitForFunction(()=>session.hint);assert.equal(await page.evaluate(()=>originalBlanks.every(el=>el.isConnected)),true);
  await page.waitForFunction(()=>!studyInputBusy());
  // Retry waits for native composition completion, then creates a fresh attempt.
  const kept=await page.evaluate(()=>{const el=originalBlanks[0];el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));retryBlanks();const kept=el.isConnected;el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));return kept});
  assert.equal(kept,true);await page.waitForFunction(()=>!originalBlanks[0].isConnected);
  assert.deepEqual(await page.locator('.blankInput').evaluateAll(els=>els.map(el=>el.value)),['','','']);
  await page.evaluate(()=>{originalBlanks[0].value='stale';originalBlanks[0].dispatchEvent(new InputEvent('input',{bubbles:true}));originalBlanks[0].dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))});
  await compose(0,'가설지지체');await compose(1,'작업공간');await compose(2,'태핑');
  await page.locator('button[onclick="checkBlanks()"]').click();await page.waitForFunction(()=>session.blankPassed);
  await page.locator('button[onclick="completeModeReview()"]').click();await page.waitForFunction(()=>!session);
  assert.equal(await page.evaluate(()=>pr('ime-fixture').status),'weak');
  assert.equal(await page.evaluate(()=>reviewStats().concepts),1);
  assert.equal(await page.evaluate(()=>data.reviewHistory.at(-1).mode),'blank');
  await page.evaluate(()=>startSession([data.cards.find(c=>c.id==='ime-fixture')],'review','manual','free'));
  assert.equal(await page.evaluate(()=>session.stage),3);
  await page.locator('#freeInput').fill('가설지지체\n작업공간\n태핑');
  await page.locator('button[onclick="reveal()"]').click();await page.waitForFunction(()=>session.revealed);
  assert.equal(await page.evaluate(()=>pr('ime-fixture').status),'weak');
  await page.locator('button[onclick="rate(\'master\')"]').click();await page.waitForFunction(()=>!session);
  assert.equal(await page.evaluate(()=>pr('ime-fixture').status),'master');
  assert.equal(await page.evaluate(()=>reviewStats().concepts),1);
  assert.equal(await page.evaluate(()=>reviewStats().attempts),2);
  assert.deepEqual(await page.evaluate(()=>data.reviewHistory.map(e=>e.mode)),['blank','free']);
  const trace=await page.evaluate(()=>studyInputState.trace);
  for(const type of ['focus','blur','compositionstart','compositionupdate','compositionend','beforeinput','input'])assert.ok(trace.some(e=>e.event===type),type);
  assert.equal(JSON.stringify(trace).includes('가설지지체'),false);
  assert.deepEqual(errors,[]);
  console.log(engine.name()+': readonly IME handoff, stale beforeinput, independent values, no forced blur, hint/grade/retry and final review passed; actual iPad keyboard untested');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
