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
// Synthetic browser composition events exercise app logic; this is NOT native iPad IME input.
async function compose(page,index,text){
 await page.evaluate(({index,text})=>{
  const el=document.querySelectorAll('.blankInput')[index];el.focus();
  el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
  el.value=text.slice(0,-1);
  el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText'}));
  el.value=text;
  el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:text}));
  // WebKit may deliver the final input after compositionend. Store whole values, not suffixes.
  el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
  el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}));
 },{index,text});
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const engine=process.env.TEST_WEBKIT?webkit:chromium;
 const browser=await engine.launch(engine===chromium?{headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180},hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   data.progress.q001={status:'weak',count:7,last:'2026-10-24'};save();
   const card={id:'ime-fixture',q:'입력 회귀 테스트',answer:'가설지지체\n작업공간\n태핑',blanks:['가설지지체','작업공간','태핑'],kind:'빈출',category:'테스트',page:80};
   data.cards.push(card);startSession([card],'learn','test');session.stage=2;renderSession();
   window.originalBlanks=[...document.querySelectorAll('.blankInput')];
   window.mutationsDuringComposition=0;
   new MutationObserver(records=>{
    if(studyInputState.composing.size&&records.some(r=>[...r.removedNodes].some(n=>originalBlanks.some(el=>n===el||n.contains?.(el)))))mutationsDuringComposition++;
   }).observe(document.getElementById('root'),{childList:true,subtree:true});
  });
  assert.equal(await page.locator('.blankInput').evaluateAll(inputs=>new Set(inputs.map(el=>el.id)).size),3);
  // Explicit render and background updates must preserve nodes, selection, focus and preedit.
  await page.evaluate(()=>{
   const el=originalBlanks[0];el.focus();
   el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
   el.value='가설ㅈ';el.setSelectionRange(3,3);
   el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
   renderSession();render();shell('must not replace inputs');
  });
  assert.equal(await page.evaluate(()=>document.activeElement===originalBlanks[0]&&document.querySelector('.blankInput')===originalBlanks[0]),true);
  assert.equal(await page.locator('.blankInput').nth(0).inputValue(),'가설ㅈ');
  assert.equal(await page.locator('.blankInput').nth(0).evaluate(el=>el.selectionStart),3);
  assert.notEqual(await page.evaluate(()=>session.blank[0]),'가설ㅈ');
  await compose(page,0,'가설지지체');await compose(page,1,'작업공간');await compose(page,2,'태핑');
  assert.deepEqual(await page.evaluate(()=>session.blank),['가설지지체','작업공간','태핑']);
  // Deletion and reinsertion affect only the originating blank.
  await page.locator('.blankInput').nth(2).press('Backspace');
  assert.equal(await page.locator('.blankInput').nth(2).inputValue(),'태');
  await compose(page,2,'태핑');
  // A late compositionend from the previous field cannot write into the new focused field.
  await page.evaluate(()=>{
   const [a,b]=originalBlanks;a.focus();a.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));a.value='가설지지';
   b.focus();b.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));b.value='작업ㄱ';b.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
   a.value='가설지지체';a.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));a.dispatchEvent(new InputEvent('input',{bubbles:true}));
  });
  assert.equal(await page.locator('.blankInput').nth(1).inputValue(),'작업ㄱ');
  await compose(page,1,'작업공간');
  // Grading must wait for the commit, even when click precedes compositionend.
  const checkedBeforeCommit=await page.evaluate(()=>{
   const el=originalBlanks[2];el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='태ㅍ';
   el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));
   document.querySelector('button[onclick="checkBlanks()"]').click();
   const checked=session.checked;
   el.value='태핑';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));el.dispatchEvent(new InputEvent('input',{bubbles:true}));
   return checked;
  });
  assert.equal(checkedBeforeCommit,false);
  await page.waitForFunction(()=>session.blankPassed);
  assert.deepEqual(await page.evaluate(()=>session.blank),['가설지지체','작업공간','태핑']);
  await page.evaluate(()=>originalBlanks[2].dispatchEvent(new InputEvent('input',{bubbles:true,data:'태핑'})));
  assert.equal(await page.evaluate(()=>session.blankPassed),true);
  // After an edit, a previously passed assessment cannot skip the new grading.
  await compose(page,0,'오답');assert.equal(await page.evaluate(()=>session.blankPassed),false);
  await page.getByRole('button',{name:'빈칸 채점',exact:true}).click();
  assert.equal(await page.evaluate(()=>session.checked&&!session.blankPassed),true);
  // Retry waits for composition and only then resets/replaces the fields.
  const retryWasDeferred=await page.evaluate(()=>{
   const el=document.querySelectorAll('.blankInput')[1];el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='작업ㄱ';
   document.querySelector('button[onclick="retryBlanks()"]').click();
   window.retryNode=el;const connected=el.isConnected;
   el.value='작업공간';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));return connected;
  });
  assert.equal(retryWasDeferred,true);
  await page.waitForFunction(()=>!retryNode.isConnected);
  assert.deepEqual(await page.locator('.blankInput').evaluateAll(inputs=>inputs.map(el=>el.value)),['','','']);
  await page.evaluate(()=>{retryNode.value='late stale';retryNode.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))});
  assert.deepEqual(await page.evaluate(()=>session.blank),[]);
  await compose(page,0,'가설지지체');await compose(page,1,'작업공간');await compose(page,2,'태핑');
  // WebKit blur path without compositionend: wait one frame and read that node's final value.
  await page.evaluate(()=>{
   const el=document.querySelectorAll('.blankInput')[2];el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='태핑';checkBlanks();
  });
  await page.waitForFunction(()=>session.blankPassed);
  // Explicit render while typing non-composing text is delayed until focus leaves.
  await page.locator('.blankInput').nth(0).focus();
  await page.evaluate(()=>{window.beforeRender=document.activeElement;render()});
  assert.equal(await page.evaluate(()=>beforeRender===document.activeElement&&beforeRender.isConnected),true);
  await page.locator('.blankInput').nth(0).blur();
  await page.waitForFunction(()=>!beforeRender.isConnected);
  assert.deepEqual(await page.locator('.blankInput').evaluateAll(inputs=>inputs.map(el=>el.value)),['가설지지체','작업공간','태핑']);
  // PDF opening commits the active input; closing preserves the three answers.
  await page.locator('.blankInput').nth(1).focus();await page.evaluate(()=>openSource(80));
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  assert.deepEqual(await page.locator('.blankInput').evaluateAll(inputs=>inputs.map(el=>el.value)),['가설지지체','작업공간','태핑']);
  // Stage 1 must commit before advancing and clear the finished repetition.
  const repeatBeforeCommit=await page.evaluate(()=>{
   session.stage=1;renderSession();const el=document.getElementById('typing');el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='중간';advance();const repeat=session.repeat;
   el.value=activeCard().answer;el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));el.dispatchEvent(new InputEvent('input',{bubbles:true}));return repeat;
  });
  assert.equal(repeatBeforeCommit,0);
  await page.waitForFunction(()=>session.repeat===1);
  assert.equal(await page.locator('#typing').inputValue(),'');
  // Stage 3 must classify the final committed answer, not preedit text.
  const revealedBeforeCommit=await page.evaluate(()=>{
   session.stage=3;renderSession();const el=document.getElementById('freeInput');el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='가설';reveal();const revealed=session.revealed;
   el.value=activeCard().answer;el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));el.dispatchEvent(new InputEvent('input',{bubbles:true}));return revealed;
  });
  assert.equal(revealedBeforeCommit,false);
  await page.waitForFunction(()=>session.revealed);
  assert.equal(await page.locator('#freeInput').inputValue(),'가설지지체\n작업공간\n태핑');
  assert.equal(await page.evaluate(()=>autoAssess(activeCard(),session.free).status),'master');
  // Re-editing a revealed answer must commit before automatic classification/save.
  const statusBeforeCommit=await page.evaluate(()=>{
   const el=document.getElementById('freeInput');el.focus();el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='가';autoRate();
   const status=data.progress['ime-fixture']?.status;
   el.value='전혀 다른 답';el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));el.dispatchEvent(new InputEvent('input',{bubbles:true}));return status;
  });
  assert.equal(statusBeforeCommit,undefined);
  await page.waitForFunction(()=>data.progress['ime-fixture']?.status==='unknown');
  assert.equal(await page.evaluate(()=>data.progress.q001.count),7);
  assert.equal(await page.evaluate(()=>dailyStats().completed),0);
  assert.equal(await page.evaluate(()=>mutationsDuringComposition),0);
  assert.deepEqual(errors,[]);
  console.log(engine.name()+': synthetic Korean composition, deletion, field isolation, deferred grade/retry/render, stages 1/3, PDF and records passed; native iPad IME untested');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exit(1)});
