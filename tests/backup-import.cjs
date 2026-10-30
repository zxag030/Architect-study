const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}
 res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(file));
});
const card=(id,extra={})=>({id,q:'백업 확인 '+id,answer:'원래 정답 '+id,blanks:['정답'],kind:'빈출',category:'테스트',page:80,...extra});
const event=(id,cardId,date,mode,extra={})=>({id,cardId,date,at:date+'T10:00:00.000Z',mode,status:'weak',nextDue:'2026-10-31',intervalDays:2,...extra});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium'});
 try{
  const page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[],dialogs=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',async dialog=>{dialogs.push({type:dialog.type(),message:dialog.message()});await dialog.accept()});
  await page.clock.install({time:new Date('2026-10-29T12:00:00Z')});
  await page.goto('http://127.0.0.1:'+server.address().port);
  const local={
   cards:[card('shared'),card('local-only')],
   progress:{shared:{status:'master',count:8,reviewCount:3,first:'2026-10-20',last:'2026-10-28',due:'2026-11-01',updatedAt:'2026-10-28T10:00:00Z',learningCompleted:true},'local-only':{status:'weak',count:5,reviewCount:2,first:'2026-10-21'}},
   dailyCompletions:{'2026-10-28':['shared','local-only']},
   reviewDays:{'2026-10-28':{shared:{completed:true,attempts:1,retries:0,modes:['free']}}},
   reviewHistory:[event('local-event','shared','2026-10-28','free',{status:'master',nextDue:'2026-11-01'})],
   settings:{dailyTargets:{'2026-10-29':7},localSetting:{keep:true}},
   futureLocal:{nested:{keep:'local'}},selected:'2026-10-29',version:2,exportedAt:'2026-10-01'
  };
  await page.evaluate(payload=>{data=normalizeStudyData(payload);localStorage.setItem(STORE_KEY,JSON.stringify(data));view='today';render()},local);
  const before=await page.evaluate(()=>JSON.stringify(data));
  const legacy={cards:[card('shared',{answer:'다른 기기의 정답'}),card('legacy-only')],progress:{shared:{status:'unknown',count:6,reviewCount:1,first:'2026-10-22',last:'2026-10-29',due:'2026-10-30',updatedAt:'2026-10-29T10:00:00Z'},'legacy-only':{status:'unrated',count:1,first:'2026-10-28',due:'2026-10-29'}},dailyCompletions:{'2026-10-28':['legacy-only']},settings:{dailyTargets:{'2026-10-29':12},remoteSetting:true,reviewSetup:{mode:'copy',target:'all',limit:'all',grades:['master'],shuffle:false}},futureRemote:{keep:[1,2]},version:2,exportedAt:'2026-10-02'};
  async function importAndApply(payload){
   const untouched=await page.evaluate(()=>JSON.stringify(data));
   await page.evaluate(payload=>importJSON({text:async()=>JSON.stringify(payload)}),payload);
   assert.equal(await page.evaluate(()=>modal?.type),'backup');
   assert.equal(await page.evaluate(()=>JSON.stringify(data)),untouched,'Preview cannot mutate active records');
   await page.locator('#backup-apply').click();
   await page.waitForFunction(()=>modal?.type!=='backup');
  }
  await importAndApply(legacy);
  const first=await page.evaluate(()=>({data:JSON.parse(JSON.stringify(data)),snapshot:localStorage.getItem(STORE_KEY+'-before-import')}));
  assert.equal(first.snapshot,before);
  await page.evaluate(()=>nav('review'));assert.equal(await page.locator('#review-form [name=mode]').inputValue(),'copy');assert.equal(await page.locator('#review-form [name=grades]:checked').count(),1);
  assert.deepEqual(first.data.cards.map(c=>c.id),['shared','local-only','legacy-only']);
  assert.equal(first.data.progress.shared.status,'unknown');assert.equal(first.data.progress.shared.due,'2026-10-30');
  assert.equal(first.data.progress.shared.count,8);assert.equal(first.data.progress.shared.reviewCount,3);
  assert.equal(first.data.progress.shared.learningCompleted,true);assert.equal(first.data.progress['local-only'].count,5);
  assert.deepEqual(first.data.dailyCompletions['2026-10-28'],['shared','local-only','legacy-only']);
  assert.deepEqual(first.data.futureLocal,{nested:{keep:'local'}});assert.deepEqual(first.data.futureRemote,{keep:[1,2]});
  assert.equal(first.data.settings.localSetting.keep,true);assert.equal(first.data.settings.remoteSetting,true);
  assert.ok(first.data.backupConflicts.some(c=>c.path==='/cards/shared'&&c.values.some(v=>v.answer==='다른 기기의 정답')));
  assert.ok(first.data.backupConflicts.some(c=>c.path==='/progress/shared'&&c.values.some(v=>v.status==='master')));
  assert.ok(first.data.backupConflicts.some(c=>c.path==='/settings/dailyTargets/2026-10-29'&&c.values.includes(12)));
  async function exported(){return page.evaluate(()=>{let result;const previous=download;try{download=(name,text,type)=>{result={name,text,type}};exportJSON()}finally{download=previous}return result})}
  const file=await exported(),parsed=JSON.parse(file.text);
  assert.equal(file.type,'application/json');assert.match(file.name,/2026-10-29/);
  assert.equal(parsed.exportedAt,'2026-10-29','Export metadata must use the current date, not preserved old metadata');
  assert.deepEqual(parsed.futureRemote,first.data.futureRemote);assert.deepEqual(parsed.backupConflicts,first.data.backupConflicts);
  const device={...parsed,reviewHistory:[...parsed.reviewHistory,event('device-event-1','shared','2026-10-29','blank',{status:'unknown',nextDue:'2026-10-30'}),event('device-event-2','local-only','2026-10-29','copy')],dailyCompletions:{...parsed.dailyCompletions,'2026-10-29':['legacy-only']},reviewDays:{...parsed.reviewDays,'2026-10-29':{shared:{completed:true,attempts:1,modes:['blank']},'local-only':{completed:true,attempts:1,modes:['copy']}}}};
  await importAndApply(device);
  const merged=await page.evaluate(()=>JSON.stringify(data));
  assert.equal(JSON.parse(merged).reviewHistory.length,3);
  assert.deepEqual(JSON.parse(merged).dailyCompletions['2026-10-29'],['legacy-only']);
  assert.equal(JSON.parse(merged).reviewDays['2026-10-29'].shared.completed,true);
  assert.deepEqual(JSON.parse(merged).reviewDays['2026-10-29']['local-only'].modes,['copy']);
  await importAndApply(device);
  assert.equal(await page.evaluate(()=>JSON.stringify(data)),merged,'Repeated device backup import must be idempotent');
  const roundTrip=JSON.parse((await exported()).text);
  await importAndApply(roundTrip);
  assert.deepEqual(await page.evaluate(()=>data.cards.map(c=>c.id)),roundTrip.cards.map(c=>c.id));
  assert.deepEqual(await page.evaluate(()=>data.reviewHistory),roundTrip.reviewHistory);
  assert.deepEqual(await page.evaluate(()=>data.dailyCompletions),roundTrip.dailyCompletions);
  assert.equal(await page.evaluate(()=>data.progress['local-only'].count),5);
  // Invalid JSON/cards must not alter either live data or persisted state/snapshot.
  const stable=await page.evaluate(()=>({live:JSON.stringify(data),stored:localStorage.getItem(STORE_KEY),snapshot:localStorage.getItem(STORE_KEY+'-before-import')}));
  await page.evaluate(()=>importJSON({text:async()=>'{broken json'}));
  await page.evaluate(()=>importJSON({text:async()=>JSON.stringify({cards:[{id:'broken'}]})}));
  assert.deepEqual(await page.evaluate(()=>({live:JSON.stringify(data),stored:localStorage.getItem(STORE_KEY),snapshot:localStorage.getItem(STORE_KEY+'-before-import')})),stable);
  // Fail only the merged main-key write. The safety snapshot may be written,
  // but the app and its existing persisted record must remain byte-for-byte intact.
  const quotaResult=await page.evaluate(async()=>{
   const live=JSON.stringify(data),stored=localStorage.getItem(STORE_KEY),setter=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){if(key===STORE_KEY)throw new DOMException('quota','QuotaExceededError');return setter.call(this,key,value)};
   try{await importJSON({text:async()=>JSON.stringify({cards:[{id:'must-not-appear',q:'q',answer:'a',blanks:[]}]})});await applyBackupMerge()}finally{Storage.prototype.setItem=setter}
   return {beforeLive:live,beforeStored:stored,afterLive:JSON.stringify(data),afterStored:localStorage.getItem(STORE_KEY),snapshot:localStorage.getItem(STORE_KEY+'-before-import')};
  });
  assert.equal(quotaResult.afterLive,quotaResult.beforeLive);assert.equal(quotaResult.afterStored,quotaResult.beforeStored);assert.equal(quotaResult.snapshot,quotaResult.beforeLive);
  await page.reload();
  assert.equal(await page.evaluate(()=>data.cards.some(c=>c.id==='must-not-appear')),false);
  assert.equal(await page.evaluate(()=>data.reviewHistory.length),3);
  assert.ok(dialogs.some(d=>d.type==='alert'&&d.message.includes('가져오기 실패')));
  assert.deepEqual(errors,[]);
  console.log('Chromium: actual legacy/device import merge, full conflicts, export round-trip, idempotence, corrupt input and quota-safe live/persisted state passed');
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);process.exit(1)});
