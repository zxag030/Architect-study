const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(file))});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const engine=process.env.TEST_WEBKIT?webkit:chromium;
 const browser=await engine.launch(engine===chromium?{headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180},hasTouch:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   const card={id:'workbook-fixture',q:'다음 정답을 정확히 따라 쓰시오.',answer:'가설지지체\n작업공간\n태핑 3회 (A/B)',blanks:['가설지지체','작업공간','태핑'],page:80,kind:'빈출',category:'테스트'};
   data.cards.push(card);data.progress[card.id]={status:'weak',count:1};startSession([card],'review','manual','copy');
   window.originalCopyRows=[...document.querySelectorAll('.copyInput')];
  });
  assert.equal(await page.locator('.copyInput').count(),3);
  assert.equal(await page.locator('.copyInput[oninput]').count(),0);
  assert.equal(await page.locator('.copyInput').evaluateAll(rows=>new Set(rows.map(row=>row.id)).size),3);
  async function fill(index,text){await page.waitForFunction(()=>!studyInputBusy());const row=page.locator('.copyInput').nth(index);await row.click();await row.fill(text)}
  await fill(0,'  \n\t');await fill(1,'가설지지체\n작업공간\n태핑 3회 (A/B)');await fill(2,'가설지지체\n작업공간');
  assert.match(await page.locator('#copy-progress-text').innerText(),/작성 2\/3회/);
  await page.locator('button[onclick="advance()"]').click();
  assert.equal(await page.evaluate(()=>session.repeat),1);
  assert.equal(await page.locator('button[onclick="completeModeReview()"]').isDisabled(),true);
  assert.equal(await page.evaluate(()=>originalCopyRows.every(row=>row.isConnected)),true);
  await page.locator('#copy-answer-toggle').click();assert.equal(await page.locator('#copy-reference').isHidden(),true);
  await page.locator('#copy-answer-toggle').click();assert.equal(await page.locator('#copy-reference').isVisible(),true);
  assert.equal(await page.evaluate(()=>originalCopyRows.every(row=>row.isConnected)),true);
  // Only spacing/newlines and canonical Korean composition may differ. Numeric
  // signs, content omissions and punctuation remain significant to matching.
  assert.deepEqual(await page.evaluate(()=>({space:copyComparisonText('가 설\n지지체')===copyComparisonText('가설지지체'),nfc:copyComparisonText('가'.normalize('NFD'))===copyComparisonText('가'),sign:copyComparisonText('-3')===copyComparisonText('3'),slash:copyComparisonText('A/B')===copyComparisonText('AB')})),{space:true,nfc:true,sign:false,slash:false});
  await fill(0,'가설 지지체 작업공간 태핑3회(A/B)');await fill(2,'가설지지체 작업공간 태핑3회(AB)');
  await page.locator('button[onclick="advance()"]').click();assert.equal(await page.evaluate(()=>session.repeat),2);
  await fill(2,'가설지지체 작업공간 태핑3회(A/B)');await page.locator('button[onclick="advance()"]').click();
  assert.equal(await page.evaluate(()=>session.repeat),3);assert.equal(await page.evaluate(()=>session.copyChecked),true);
  assert.equal(await page.locator('button[onclick="completeModeReview()"]').isEnabled(),true);
  await fill(0,'변경');assert.equal(await page.evaluate(()=>session.copyChecked),false);assert.equal(await page.evaluate(()=>session.repeat),0);
  assert.equal(await page.locator('button[onclick="completeModeReview()"]').isDisabled(),true);
  // Actual OS IME is untested. Simulated composition handoff verifies that a
  // second row cannot receive a stale composition and no editor is replaced.
  await page.locator('.copyInput').nth(0).click();
  const handoff=await page.evaluate(()=>{
   const [a,b]=originalCopyRows;a.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));a.value='가설';
   a.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText'}));
   render();renderSession();b.focus();
   const allowed=b.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,isComposing:true,inputType:'insertCompositionText',data:'가설지지체'}));
   const result={allowed,readonly:b.readOnly,stable:originalCopyRows.every(row=>row.isConnected),value:b.value};
   a.value='가설지지체';a.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));a.dispatchEvent(new InputEvent('input',{bubbles:true}));return result;
  });
  assert.equal(handoff.allowed,false);assert.equal(handoff.readonly,true);assert.equal(handoff.stable,true);assert.equal(handoff.value,'가설지지체\n작업공간\n태핑 3회 (A/B)');
  await page.waitForFunction(()=>!studyInputBusy());
  assert.equal(await page.evaluate(()=>session.copyDrafts[0]),'가설지지체');
  await fill(0,'가설지지체\n작업공간\n태핑 3회 (A/B)');
  await page.locator('button[onclick="advance()"]').click();
  await page.locator('button[onclick="completeModeReview()"]').click();await page.waitForFunction(()=>!session);
  assert.equal(await page.evaluate(()=>pr('workbook-fixture').status),'weak');
  assert.equal(await page.evaluate(()=>reviewStats().concepts),1);
  assert.equal(await page.evaluate(()=>dailyStats().completed),0);
  await page.evaluate(()=>startSession([data.cards.find(card=>card.id==='workbook-fixture')],'learn','manual'));
  assert.equal(await page.locator('.copyInput').count(),10);
  assert.equal(await page.locator('.copyInput').evaluateAll(rows=>new Set(rows.map(row=>row.id)).size),10);
  for(let index=0;index<10;index++)await fill(index,'가설지지체\n작업공간\n태핑 3회 (A/B)');
  await page.locator('button[onclick="advance()"]').click();await page.waitForFunction(()=>session.stage===2);
  assert.equal(await page.locator('.blankInput').count(),3);
  for(const width of [375,820,1024]){
   await page.setViewportSize({width,height:1180});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  // A rating cannot use a comparison rendered for an earlier free-recall draft.
  await page.evaluate(()=>startSession([data.cards.find(card=>card.id==='workbook-fixture')],'review','manual','free'));
  await page.locator('#freeInput').fill('가설지지체 작업공간 태핑');await page.locator('#free-compare-button').click();
  await page.waitForFunction(()=>session.revealed);
  await page.evaluate(()=>{window.originalFree=document.getElementById('freeInput')});
  await page.locator('#freeInput').fill('새로 수정한 답안');
  assert.equal(await page.evaluate(()=>session.revealed),false);
  assert.equal(await page.locator('#free-comparison').isHidden(),true);
  assert.equal(await page.evaluate(()=>originalFree.isConnected&&originalFree===document.getElementById('freeInput')),true);
  assert.equal(await page.evaluate(()=>session.answerViewed),true);
  await page.locator('#free-compare-button').click();await page.waitForFunction(()=>session.revealed);
  assert.equal(await page.locator('#free-comparison').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log(engine.name()+': 3/10 stable multi-row copy editors, strict whitespace/NFC matching, nonblank/progress/feedback, invalidation, IME handoff and independent completion passed; real iPad keyboard untested');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exit(1)});
