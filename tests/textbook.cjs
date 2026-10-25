const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
// Synthetic textbook: no copyrighted/user PDF is included in this repository.
function fixture(){let text='%PDF-1.4\n',offsets=[0];const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 4 0 R >>','<< /Length 24 >>\nstream\n0 0 100 100 re S\n\nendstream','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Contents 6 0 R >>','<< /Length 24 >>\nstream\n0 0 200 200 re S\n\nendstream'];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(text));text+=`${i+1} 0 obj\n${o}\nendobj\n`});const xref=Buffer.byteLength(text);text+='xref\n0 7\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return Buffer.from(text)}
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url==='/'?'/index.html':req.url));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return}res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':'text/html; charset=utf-8');res.end(fs.readFileSync(file))});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await (process.env.TEST_WEBKIT?webkit:chromium).launch(process.env.TEST_WEBKIT?{headless:true}:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true});try{
 const page=await browser.newPage({viewport:{width:820,height:1180}});const errors=[],outbound=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:')&&!r.url().startsWith('blob:'))outbound.push(r.url());assert.equal(r.method(),'GET')});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(()=>restorePdf());
 await page.evaluate(()=>{data.progress.q002={status:'weak',count:8};save();startOne('q001','learn')});await page.locator('#typing').fill('작성 중인 따라 쓰기');
 await page.evaluate(()=>openSource(80));assert.match(await page.locator('.modal').innerText(),/선택/);
 await page.locator('.modal input[type=file]').setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:fixture()});
 await page.waitForFunction(()=>pdfState.file&&pdfState.message.includes('저장됨'),null,{timeout:10000}).catch(async e=>{console.error(await page.evaluate(async()=>{try{await pdfStore('readwrite',{blob:pdfState.file});return 'saved'}catch(e){return {name:e.name,message:e.message}}}),errors);throw e});
 await page.locator('#viewer-offset').fill('-79');await page.locator('#viewer-offset').dispatchEvent('change');
 await page.waitForFunction(()=>document.getElementById('pdf-status')?.textContent.includes('PDF 1/2'));
 assert.ok(await page.locator('#pdf-canvas').evaluate(el=>el.width>0&&el.height>0));
 await page.getByRole('button',{name:'다음',exact:true}).click();await page.waitForFunction(()=>document.getElementById('pdf-status')?.textContent.includes('PDF 2/2'));
 await page.getByRole('button',{name:'다음',exact:true}).click();assert.match(await page.locator('#pdf-status').innerText(),/범위/);
 await page.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await page.locator('#typing').inputValue(),'작성 중인 따라 쓰기');
 await page.evaluate(()=>{session.stage=2;session.blank=['입력 중'];session.blankPassed=true;render()});await page.evaluate(()=>openSource(80));await page.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await page.evaluate(()=>session.blank[0]),'입력 중');assert.equal(await page.evaluate(()=>session.blankPassed),true);
 await page.evaluate(()=>{session.stage=3;session.free='작성 중인 백지 답안';render()});await page.evaluate(()=>openSource(80));await page.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await page.locator('#freeInput').inputValue(),'작성 중인 백지 답안');
 await page.reload();await page.waitForFunction(()=>pdfState.file!==null);assert.equal(await page.evaluate(()=>pdfState.offset),-79);assert.equal(await page.evaluate(()=>data.progress.q002.count),8);
 await page.evaluate(()=>openSource(81));await page.waitForFunction(()=>document.getElementById('pdf-status')?.textContent.includes('PDF 2/2'));
 await page.setViewportSize({width:375,height:800});await page.waitForTimeout(300);assert.ok(await page.locator('#pdf-canvas').evaluate(el=>el.width*el.height<=4010000));
 // Storage quota failure keeps this session usable and offers reselection.
 await page.evaluate(()=>{window.savedPdfStore=pdfStore;pdfStore=async(mode,value)=>{if(mode==='readwrite')throw new DOMException('quota','QuotaExceededError');return savedPdfStore(mode,value)}});
 await page.locator('.modal input[type=file]').setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:fixture()});await page.waitForFunction(()=>pdfState.message.includes('공간이 부족'));await page.waitForFunction(()=>document.getElementById('pdf-status')?.textContent.includes('PDF 2/2'));
 await page.evaluate(()=>{pdfStore=savedPdfStore});
 await page.locator('.modal input[type=file]').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 invalid contents')});
 await page.waitForFunction(()=>document.getElementById('pdf-status')?.textContent.includes('PDF 표시 실패'));
 await page.locator('.modal input[type=file]').setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:fixture()});
 await page.waitForFunction(()=>document.getElementById('pdf-status')?.textContent.includes('PDF 2/2'));
 // Fast page changes cancel stale rendering without breaking the active viewer.
 await page.evaluate(()=>{goPdfPage(1);goPdfPage(2);goPdfPage(1)});
 await page.waitForFunction(()=>document.getElementById('pdf-status')?.textContent.includes('PDF 1/2'));

 await page.locator('.modal input[type=file]').setInputFiles({name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a pdf')});await page.waitForFunction(()=>pdfState.message.includes('선택 실패'));
 await page.evaluate(async()=>{const db=await pdfDb();await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').clear();tx.oncomplete=resolve;tx.onerror=reject});db.close()});
 await page.reload();await page.evaluate(()=>restorePdf());await page.evaluate(()=>openSource(80));assert.match(await page.locator('.modal').innerText(),/다시 선택/);
 assert.equal(await page.evaluate(()=>data.progress.q002.count),8);assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
 console.log('PDF persistence, restore, offset, rendering, navigation, draft preservation, quota failure, invalid PDF, data deletion, privacy: passed');
 }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);process.exit(1)});
