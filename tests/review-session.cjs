const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}
 res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
 try{
  let page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[],rejectNextConfirm=false;
  function bind(p){p.on('pageerror',e=>errors.push(e.message));p.on('dialog',async dialog=>{if(dialog.type()==='confirm'&&rejectNextConfirm){rejectNextConfirm=false;await dialog.dismiss()}else await dialog.accept()})}
  async function resume(){
   await page.getByRole('button',{name:'이어하기',exact:true}).click();
   const state=await page.evaluate(()=>({active:!!session,mode:session?.reviewMode,idx:session?.idx,saved:data.reviewSession,busy:studyInputBusy(),external:reviewExternalStorageChange,body:document.body.innerText.slice(0,1400)}));
   assert.equal(state.active,true,'Resume did not activate: '+JSON.stringify(state));
  }
  bind(page);await page.goto('http://127.0.0.1:'+server.address().port);
  await page.evaluate(()=>{
   data.cards=Array.from({length:3},(_,i)=>({id:'resume-'+i,q:'복습 이어하기 '+i,answer:'가설지지체\n작업공간\n태핑',blanks:['가설지지체','작업공간','태핑'],page:81+i,kind:'빈출',category:'테스트'}));
   data.progress=Object.fromEntries(data.cards.map(c=>[c.id,{status:'weak',first:'2026-10-20',count:2,reviewCount:1}]));
   data.dailyCompletions={'2026-10-20':['resume-0']};data.reviewDays={};data.reviewHistory=[];data.reviewSession=null;data.reviewSessionArchive=[];save();
   startSession([data.cards[2],data.cards[0],data.cards[1]],'review','resume test','free');
  });
  const started=await page.evaluate(()=>structuredClone(data.reviewSession));
  assert.deepEqual(started.ids,['resume-2','resume-0','resume-1']);
  await page.locator('#freeInput').fill('가설지지체 작성 중');
  // Persist the newest composing DOM text on pagehide without completing or
  // rewriting the native editor/session's committed value.
  const composing=await page.evaluate(()=>{
   const el=document.getElementById('freeInput');el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:'중'}));
   el.value='가설지지체 미완료 초안';el.dispatchEvent(new InputEvent('input',{bubbles:true,data:'안',inputType:'insertCompositionText',isComposing:true}));
   const committed=session.free;window.dispatchEvent(new Event('pagehide'));
   return {committed,dom:el.value,saved:data.reviewSession.free};
  });
  assert.equal(composing.saved,'가설지지체 미완료 초안');assert.equal(composing.dom,composing.saved);
  assert.notEqual(composing.committed,composing.saved);
  await page.reload();assert.equal(await page.evaluate(()=>session),null);
  assert.equal(await page.locator('#resume-review-title').count(),1);
  // Reload can deliver an old document's already-loaded storage event late.
  // It must not disable resume when the actual stored bytes are still known.
  const staleEvent=await page.evaluate(()=>{const current=localStorage.getItem(STORE_KEY);window.dispatchEvent(new StorageEvent('storage',{key:STORE_KEY,oldValue:'old document value',newValue:current}));return {blocked:reviewExternalStorageChange,allowed:reviewStorageWriteAllowed()}});
  assert.equal(staleEvent.blocked,false);assert.equal(staleEvent.allowed,true);
  // A delayed IndexedDB restore failure can arrive between pointerdown and
  // pointerup. Updating PDF status must not replace the resume button mid-tap.
  await page.evaluate(()=>{window.originalPdfStore=pdfStore;pdfStore=()=>new Promise((resolve,reject)=>{window.rejectDelayedRestore=reject});window.delayedRestore=restorePdf()});
  const resumeBox=await page.getByRole('button',{name:'이어하기',exact:true}).boundingBox();
  await page.mouse.move(resumeBox.x+resumeBox.width/2,resumeBox.y+resumeBox.height/2);await page.mouse.down();
  await page.evaluate(async()=>{window.rejectDelayedRestore(new Error('delayed IndexedDB failure'));await window.delayedRestore;pdfStore=window.originalPdfStore});
  await page.mouse.up();
  const tapState=await page.evaluate(()=>({active:!!session,external:reviewExternalStorageChange,busy:studyInputBusy(),saved:data.reviewSession,body:document.body.innerText.slice(0,1400)}));
  assert.equal(tapState.active,true,'Background PDF restoration swallowed the resume tap: '+JSON.stringify(tapState));
  assert.equal(await page.locator('#freeInput').inputValue(),'가설지지체 미완료 초안');
  assert.equal(await page.evaluate(()=>session.id),started.id);assert.deepEqual(await page.evaluate(()=>session.ids),started.ids);
  await page.locator('button[onclick="reveal()"]').click();await page.locator('button[onclick="rate(\'unknown\')"]').click();
  assert.equal(await page.evaluate(()=>session.idx),1);
  assert.equal(await page.evaluate(()=>data.reviewSession.idx),1);
  assert.deepEqual(await page.evaluate(()=>data.reviewSession.completedIds),['resume-2']);
  assert.equal(await page.evaluate(()=>data.reviewHistory[0].id),started.id+':0');
  assert.equal(await page.evaluate(()=>reviewStats().concepts),1);assert.equal(await page.evaluate(()=>dailyStats().completed),0);
  await page.locator('#freeInput').fill('두 번째 문제 답안');await page.locator('button[onclick="leaveStudySession()"]').click();
  assert.equal(await page.evaluate(()=>session),null);assert.equal(await page.evaluate(()=>data.reviewSession.free),'두 번째 문제 답안');
  // A fresh browser context has the same localStorage after reopening. The app
  // resumes only after explicit selection, with stable order and session event IDs.
  const storageState=await page.context().storageState();await page.context().close();
  const context=await browser.newContext({storageState,viewport:{width:820,height:1180}});page=await context.newPage();bind(page);
  await page.goto('http://127.0.0.1:'+server.address().port);await resume();
  assert.equal(await page.locator('#freeInput').inputValue(),'두 번째 문제 답안');assert.equal(await page.evaluate(()=>session.idx),1);
  // A rejected storage write must not commit a grade/history/next-position.
  await page.locator('button[onclick="reveal()"]').click();
  const failed=await page.evaluate(()=>{
   const before=JSON.stringify(data),id=session.id,idx=session.idx,previous=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){if(key===STORE_KEY)throw new DOMException('quota','QuotaExceededError');return previous.call(this,key,value)};
   try{rate('master')}finally{Storage.prototype.setItem=previous}
   return {before,after:JSON.stringify(data),id,afterId:session.id,idx,afterIdx:session.idx};
  });
  assert.equal(failed.after,failed.before);assert.equal(failed.afterId,failed.id);assert.equal(failed.afterIdx,failed.idx);
  await page.locator('button[onclick="rate(\'master\')"]').click();
  assert.equal(await page.evaluate(()=>session.idx),2);assert.equal(await page.evaluate(()=>data.reviewHistory.length),2);
  // Reconcile a stale device snapshot against saved event IDs instead of
  // offering already-completed questions and double-counting their history.
  const staleWithAnswer={...started,free:'이미 완료한 문제의 이전 답안',drafts:{...started.drafts,[started.ids[0]]:{...started.drafts[started.ids[0]],free:'이미 완료한 문제의 이전 답안'}}};
  await page.evaluate(stale=>{session=null;data.reviewSession=stale;save();nav('review')},staleWithAnswer);
  await resume();assert.equal(await page.evaluate(()=>session.idx),2);
  assert.equal(await page.evaluate(()=>data.reviewHistory.length),2);
  assert.equal(await page.locator('#freeInput').inputValue(),'','Skipping a completed card must not copy its old answer into the next card');
  await page.locator('#freeInput').fill('마지막 답안');await page.locator('button[onclick="reveal()"]').click();await page.locator('button[onclick="rate(\'weak\')"]').click();
  assert.equal(await page.evaluate(()=>session),null);assert.equal(await page.evaluate(()=>data.reviewSession),null);
  assert.equal(await page.evaluate(()=>data.reviewHistory.length),3);assert.equal(await page.evaluate(()=>new Set(data.reviewHistory.map(e=>e.id)).size),3);
  assert.equal(await page.evaluate(()=>data.reviewSessionArchive.at(-1).archiveReason),'completed');
  assert.equal(await page.evaluate(()=>data.reviewSessionArchive.at(-1).completedIds.length),3);
  // Three copy drafts, hidden reference and successful validation survive refresh.
  await page.evaluate(()=>startSession([data.cards[0]],'review','copy resume','copy'));
  for(let i=0;i<3;i++){const row=page.locator('.copyInput').nth(i);await row.click();await row.fill('가설 지지체\n작업 공간 태핑')}
  await page.locator('#copy-answer-toggle').click();await page.locator('button[onclick="advance()"]').click();
  await page.evaluate(()=>flushReviewDraftSave());await page.reload();await resume();
  assert.deepEqual(await page.locator('.copyInput').evaluateAll(rows=>rows.map(row=>row.value)),Array(3).fill('가설 지지체\n작업 공간 태핑'));
  assert.equal(await page.locator('#copy-reference').isHidden(),true);assert.equal(await page.evaluate(()=>copyWorkbookReady()),true);
  await page.locator('button[onclick="completeModeReview()"]').click();assert.equal(await page.evaluate(()=>session),null);
  assert.equal(await page.evaluate(()=>pr('resume-0').status),'master');
  // Blank drafts and ever-used aids remain separate from visible retry flags.
  await page.evaluate(()=>startSession([data.cards[1]],'review','blank resume','blank'));
  await page.locator('[data-study-hint]').click();await page.locator('button[onclick="showReviewAnswer()"]').click();await page.locator('button[onclick="retryBlanks()"]').click();
  await page.locator('.blankInput').nth(0).click();await page.locator('.blankInput').nth(0).fill('가설지지체');
  await page.evaluate(()=>flushReviewDraftSave());await page.reload();await resume();
  assert.equal(await page.locator('.blankInput').nth(0).inputValue(),'가설지지체');assert.equal(await page.evaluate(()=>session.hintUsed&&session.answerViewed),true);
  assert.equal(await page.evaluate(()=>session.hint||session.answerSeen||session.checked||session.blankPassed),false);
  // Choosing a fresh session requires a user decision; cancellation preserves
  // the existing active snapshot and all its drafts.
  await page.locator('button[onclick="leaveStudySession()"]').click();
  const beforeNew=await page.evaluate(()=>data.reviewSession.id);rejectNextConfirm=true;
  await page.evaluate(()=>startSession([data.cards[0]],'review','cancel replacement','free'));
  assert.equal(await page.evaluate(()=>data.reviewSession.id),beforeNew);assert.equal(await page.evaluate(()=>session),null);
  await page.evaluate(()=>startSession([data.cards[0]],'review','accepted replacement','free'));
  assert.notEqual(await page.evaluate(()=>session.id),beforeNew);
  assert.equal(await page.evaluate(id=>data.reviewSessionArchive.some(s=>s.id===id&&s.blank[0]==='가설지지체'),beforeNew),true);
  // Ending preserves completed data and an exact archived draft.
  await page.locator('#freeInput').fill('종료 전 초안');await page.locator('button[onclick="leaveStudySession()"]').click();
  await page.getByRole('button',{name:'복습 종료',exact:true}).click();
  assert.equal(await page.evaluate(()=>data.reviewSession),null);assert.equal(await page.evaluate(()=>data.reviewSessionArchive.at(-1).free),'종료 전 초안');
  assert.equal(await page.evaluate(()=>data.reviewHistory.length),4);
  assert.deepEqual(await page.evaluate(()=>data.dailyCompletions['2026-10-20']),['resume-0']);
  // A changed problem keeps the text but invalidates an old correctness claim;
  // the complete old draft remains archived for inspection/backup.
  await page.evaluate(()=>startSession([data.cards[0]],'review','changed question','copy'));
  await page.locator('.copyInput').nth(0).click();await page.locator('.copyInput').nth(0).fill('이전 문제 초안');
  await page.evaluate(()=>{flushReviewDraftSave();data.cards[0].answer='변경된 정답';session=null;save();nav('review')});
  await resume();
  assert.equal(await page.locator('.copyInput').nth(0).inputValue(),'이전 문제 초안');assert.equal(await page.evaluate(()=>session.copyChecked),false);
  assert.equal(await page.evaluate(()=>data.reviewSessionArchive.at(-1).archiveReason),'question-changed');
  // Debounced autosave must never overwrite progress written by another tab.
  const other=await page.context().newPage();bind(other);await other.goto('http://127.0.0.1:'+server.address().port);
  await other.evaluate(()=>{data.externalTabMarker='keep other tab';data.progress['resume-0'].count=77;save()});
  await page.waitForFunction(()=>reviewExternalStorageChange);
  await page.locator('.copyInput').nth(0).click();await page.locator('.copyInput').nth(0).fill('현재 탭에만 있는 마지막 초안');
  assert.equal(await page.evaluate(()=>persistReviewSession()),false);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(STORE_KEY)).externalTabMarker),'keep other tab');
  assert.equal(await page.evaluate(()=>save()),false);
  const exported=await page.evaluate(()=>{let file;const previous=download;try{download=(name,text)=>{file=JSON.parse(text)};exportJSON()}finally{download=previous}return file});
  assert.equal(exported.reviewSession.copyDrafts[0],'현재 탭에만 있는 마지막 초안');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(STORE_KEY)).progress['resume-0'].count),77);
  assert.match(await page.locator('#review-draft-status').innerText(),/다른 탭/);
  await other.close();await page.reload();assert.equal(await page.evaluate(()=>data.externalTabMarker),'keep other tab');
  assert.deepEqual(errors,[]);
  console.log('Chromium: review order/mode/draft resume, native composition pagehide, reopened context, atomic completion/quota rollback, stale snapshot deduplication, copy/blank aid preservation, explicit restart/end and changed-problem preservation and concurrent-tab overwrite protection passed');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exit(1)});
