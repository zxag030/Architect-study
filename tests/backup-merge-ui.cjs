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
const card=id=>({id,q:'병합 시험 '+id,answer:'가설지지체 작업공간 태핑',blanks:['가설지지체','작업공간','태핑'],page:80,kind:'빈출',category:'가설'});
const event=(id,cardId,date,status)=>({id,cardId,date,at:date+'T10:00:00Z',mode:'free',status,nextDue:status==='master'?'2026-11-01':'2026-10-31'});
const draft=(id,mode,ids,idx=0)=>({version:1,id,mode:'review',reviewMode:mode,ids,idx,completedIds:idx?[ids[0]]:[],eventIds:[],drafts:{},
 savedAt:'2026-10-29T12:00:00Z',startedAt:'2026-10-29T11:00:00Z',stage:mode==='copy'?1:2,copyTarget:mode==='copy'?3:0,
 requiresBlanks:mode==='blank',copyDrafts:mode==='copy'?['기기별 입력','','']:[],blank:mode==='blank'?['가설지지체']:[],free:'',repeat:0,label:'review'});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const engine=process.env.TEST_WEBKIT?webkit:chromium;
 const browser=await engine.launch(engine===chromium?{headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[],alerts=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{alerts.push(dialog.message());await dialog.accept()});
  await page.clock.install({time:new Date('2026-10-29T12:00:00Z')});
  await page.goto('http://127.0.0.1:'+server.address().port);
  const local={cards:[card('shared'),card('local')],progress:{shared:{status:'master',first:'2026-10-20',last:'2026-10-28',due:'2026-11-01',count:6,reviewCount:3,updatedAt:'2026-10-28T10:00:00Z'}},
   dailyCompletions:{'2026-10-28':['shared']},reviewDays:{'2026-10-28':{shared:{completed:true,attempts:1,modes:['free']}}},reviewHistory:[event('local-event','shared','2026-10-28','master')],
   reviewSession:draft('local-session','blank',['shared','local'],1),settings:{keep:true},version:2};
  const incoming={cards:[{...card('shared'),answer:'다른 원본 정답'},card('remote')],progress:{shared:{status:'weak',first:'2026-10-22',last:'2026-10-29',due:'2026-10-31',count:3,reviewCount:1,updatedAt:'2026-10-29T10:00:00Z'}},
   dailyCompletions:{'2026-10-28':['remote'],'2026-10-29':['remote']},reviewDays:{'2026-10-29':{shared:{completed:true,attempts:1,modes:['free']}}},reviewHistory:[event('remote-event','shared','2026-10-29','weak')],
   reviewSession:draft('remote-session','copy',['remote','shared']),settings:{other:true},version:2};
  await page.evaluate(value=>{data=normalizeStudyData(value);save();nav('settings')},local);
  const original=await page.evaluate(()=>({live:JSON.stringify(data),stored:localStorage.getItem(STORE_KEY),snapshot:localStorage.getItem(STORE_KEY+'-before-import')}));
  assert.equal(await page.locator('#backup-import-file').count(),1);assert.equal(await page.locator('#backup-merge-file').count(),1);
  async function preview(value,intent='merge'){
   const input=intent==='merge'?'#backup-merge-file':'#backup-import-file';
   await page.locator(input).setInputFiles({name:'device-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
   await page.waitForSelector('#backup-apply');
  }
  await preview(incoming);
  assert.deepEqual(await page.evaluate(()=>({live:JSON.stringify(data),stored:localStorage.getItem(STORE_KEY),snapshot:localStorage.getItem(STORE_KEY+'-before-import')})),original,'Preview is read-only');
  assert.equal(await page.locator('#backup-apply').isDisabled(),true,'Conflicting sessions have no default winner');
  assert.ok((await page.locator('#backup-conflict-list').innerText()).includes('/reviewSession'));
  const originals=await page.evaluate(()=>{let file;const previous=download;try{download=(name,text,type)=>{file={name,text,type}};downloadPendingBackupOriginal()}finally{download=previous}return file});
  assert.equal(originals.text,original.live);assert.equal(originals.type,'application/json');
  await page.locator('#backup-cancel').click();await page.waitForFunction(()=>modal===null);
  assert.deepEqual(await page.evaluate(()=>({live:JSON.stringify(data),stored:localStorage.getItem(STORE_KEY),snapshot:localStorage.getItem(STORE_KEY+'-before-import')})),original,'Cancel preserves the previous file and live record');
  await preview(incoming);
  await page.locator('input[name="backup-session-choice"][value="incoming"]').check();
  assert.equal(await page.locator('#backup-apply').isEnabled(),true);
  assert.deepEqual(await page.evaluate(()=>pendingBackupMerge.merged.reviewSession),incoming.reviewSession,'Preview reflects the selected whole session before applying');
  const beforeApply=await page.evaluate(()=>JSON.stringify(data));
  await page.locator('#backup-apply').click();await page.waitForFunction(()=>modal===null);
  const merged=await page.evaluate(()=>JSON.parse(JSON.stringify(data)));
  assert.equal(merged.cards.length,3);assert.equal(merged.cards.filter(card=>card.id==='shared').length,1);
  assert.deepEqual(merged.dailyCompletions['2026-10-28'],['shared','remote']);assert.deepEqual(merged.dailyCompletions['2026-10-29'],['remote']);
  assert.deepEqual(merged.reviewHistory.map(event=>event.id),['local-event','remote-event']);
  assert.equal(merged.progress.shared.status,'weak');assert.equal(merged.progress.shared.due,'2026-10-31');assert.equal(merged.progress.shared.count,6);assert.equal(merged.progress.shared.first,'2026-10-20');
  assert.deepEqual(merged.reviewSession,incoming.reviewSession,'The selected session is kept as a whole');
  assert.ok(merged.reviewSessionArchive.some(value=>value.id==='local-session'));assert.ok(merged.reviewSessionArchive.some(value=>value.id==='remote-session'));
  assert.equal(await page.evaluate(()=>localStorage.getItem(STORE_KEY+'-before-import')),beforeApply);
  await page.locator('#backup-show-conflicts').click();
  await page.locator('.backup-conflict').first().locator('summary').first().click();
  assert.ok((await page.locator('#backup-conflict-list').innerText()).includes('현재 기기')===false,'Stored conflicts use neutral original labels');
  assert.ok((await page.locator('#backup-conflict-list').innerText()).includes('보존 원본'));
  for(const width of [375,820,1024]){
   await page.setViewportSize({width,height:1180});
   assert.equal(await page.locator('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Conflict details fit narrow screens');
  }
  await page.getByRole('button',{name:'닫기',exact:true}).click();
  // A legacy import has no draft choice, and does not discard the selected draft.
  await preview({cards:[card('legacy')],progress:{legacy:{status:'unrated',first:'2026-10-25'}},dailyCompletions:{'2026-10-25':['legacy']}},'restore');
  assert.equal(await page.locator('input[name="backup-session-choice"]').count(),0);
  await page.locator('#backup-apply').click();await page.waitForFunction(()=>modal===null);
  assert.equal(await page.evaluate(()=>data.reviewSession.id),'remote-session');
  assert.equal(await page.evaluate(()=>data.cards.some(card=>card.id==='legacy')),true);
  const beforeQuota=await page.evaluate(()=>({live:JSON.stringify(data),stored:localStorage.getItem(STORE_KEY)}));
  await preview({cards:[card('quota-card')]});
  const quota=await page.evaluate(()=>{
   const previous=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===STORE_KEY)throw new DOMException('quota','QuotaExceededError');return previous.call(this,key,value)};
   try{applyBackupMerge()}finally{Storage.prototype.setItem=previous}
   return {live:JSON.stringify(data),stored:localStorage.getItem(STORE_KEY),snapshot:localStorage.getItem(STORE_KEY+'-before-import')};
  });
  assert.equal(quota.live,beforeQuota.live);assert.equal(quota.stored,beforeQuota.stored);assert.equal(quota.snapshot,beforeQuota.live);
  assert.equal(await page.locator('#backup-apply').count(),1,'Failed save keeps a retryable preview');
  await page.locator('#backup-cancel').click();
  await page.reload();assert.equal(await page.evaluate(()=>data.cards.some(card=>card.id==='quota-card')),false);
  assert.equal(await page.evaluate(()=>data.reviewSession.id),'remote-session');
  assert.ok(alerts.some(message=>message.includes('가져오기 실패')));assert.deepEqual(errors,[]);
  console.log(engine.name()+': read-only merge preview/cancel, original download, explicit whole-session choice/archive, legacy restore, conflict inspection and quota-safe retry passed');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exit(1)});
