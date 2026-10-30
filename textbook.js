// The textbook bytes stay in IndexedDB on this origin; it is never sent over HTTP.
const pdfState={file:null,name:'',offset:0,message:'PDF를 선택하면 이 기기에 자동 저장합니다.',doc:null,task:null,renderTask:null,documentPromise:null,cancelled:Promise.resolve(),token:0,loading:0};
const pdfAssetsUrl=new URL('vendor/pdfjs/',document.currentScript.src);
let pdfLibrary;
function pdfDb(){return new Promise((resolve,reject)=>{
 if(!window.indexedDB){reject(new Error('IndexedDB unavailable'));return}
 const request=indexedDB.open('architect-textbook',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('files');
 request.onsuccess=()=>resolve(request.result);
 request.onerror=()=>reject(request.error);
 request.onblocked=()=>reject(new Error('다른 탭에서 저장소를 사용 중입니다. 다른 탭을 닫고 다시 선택해 주세요.'));
})}
async function pdfStore(mode,value){
 // ArrayBuffer avoids Safari Blob/File serialization failures in IndexedDB.
 if(mode==='readwrite'&&value.blob){value={...value,bytes:await value.blob.arrayBuffer()};delete value.blob}
 const db=await pdfDb();return new Promise((resolve,reject)=>{
 const tx=db.transaction('files',mode);const store=tx.objectStore('files');
 const req=mode==='readonly'?store.get('textbook'):store.put(value,'textbook');
 tx.oncomplete=()=>{db.close();resolve(req.result)};
 tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||req.error||new Error('PDF 저장 실패'))};
})}
function pdfSelectionHtml(page){return `<div class="btnrow"><label class="btn" style="cursor:pointer"><span class="pdf-selection-label">PDF ${pdfState.file?'다시 선택':'선택'}</span><input type="file" accept="application/pdf,.pdf" style="display:none" onchange="loadPdf(this.files[0],${page===undefined?'undefined':Number(page)})"></label><span class="tiny muted pdf-name pdf-file-status" role="status">${safe(pdfState.name)} ${safe(pdfState.message)}</span></div>`}
async function restorePdf(){const generation=pdfState.loading;try{
 const record=await pdfStore('readonly');if(generation!==pdfState.loading)return;
 if(record?.bytes instanceof ArrayBuffer||record?.blob instanceof Blob){pdfState.file=record.bytes?new Blob([record.bytes],{type:'application/pdf'}):record.blob;pdfState.name=record.name||'저장된 교재';pdfState.offset=Number.isInteger(record.offset)?record.offset:0;pdfState.message='기기에 저장된 PDF를 자동 연결했습니다.';
 refreshRestoredPdfUi()}
 }catch(e){if(generation!==pdfState.loading)return;pdfState.message='저장된 PDF를 읽을 수 없습니다. 파일을 다시 선택해 주세요.';refreshRestoredPdfUi()}
}
// Background IndexedDB restoration must not replace buttons or draft inputs
// between a user's touch-down and click. Only a viewer transition needs render.
function refreshRestoredPdfUi(){
 if(modal?.type==='notpdf'&&pdfState.file){modal.type='pdf';render();return}
 refreshPdfNotice();
 document.querySelectorAll('.pdf-selection-label').forEach(label=>{label.textContent='PDF '+(pdfState.file?'다시 선택':'선택')});
 for(const id of ['pdf-offset','viewer-offset']){
  const input=document.getElementById(id);if(input&&document.activeElement!==input)input.value=pdfState.offset;
 }
}
async function pdfJs(){
 if(!pdfLibrary){
  pdfLibrary=import(new URL('legacy/build/pdf.mjs',pdfAssetsUrl).href).then(lib=>{
   lib.GlobalWorkerOptions.workerSrc=new URL('legacy/build/pdf.worker.mjs',pdfAssetsUrl).href;
   return lib;
  }).catch(e=>{pdfLibrary=null;throw new Error('PDF.js 라이브러리 로드 실패: '+e.message)});
 }
 return pdfLibrary;
}
// One document promise per file, independent of individual page requests.
function ensurePdfDocument(){
 if(pdfState.doc)return Promise.resolve(pdfState.doc);
 if(pdfState.documentPromise)return pdfState.documentPromise;
 const file=pdfState.file;
 const promise=(async()=>{
  const lib=await pdfJs();
  const bytes=await file.arrayBuffer();
  if(file!==pdfState.file||pdfState.documentPromise!==promise)return null;
  const task=lib.getDocument({
   data:new Uint8Array(bytes),isEvalSupported:false,
   cMapUrl:new URL('cmaps/',pdfAssetsUrl).href,cMapPacked:true,
   standardFontDataUrl:new URL('standard_fonts/',pdfAssetsUrl).href
  });
  pdfState.task=task;
  const doc=await task.promise;
  if(file!==pdfState.file||pdfState.documentPromise!==promise)return null;
  pdfState.doc=doc;
  return doc;
 })();
 pdfState.documentPromise=promise;
 promise.catch(()=>{
  if(pdfState.documentPromise!==promise)return;
  pdfState.documentPromise=null;
  const task=pdfState.task;pdfState.task=null;
  task?.destroy().catch(()=>{});
 });
 return promise;
}
function cancelPdfRender(){
 pdfState.token++;
 const task=pdfState.renderTask;pdfState.renderTask=null;
 if(task){
  task.cancel();
  // Keep the barrier for subsequent requests too, even after renderTask is cleared.
  pdfState.cancelled=Promise.all([pdfState.cancelled,task.promise.catch(()=>{})]).then(()=>{});
 }
 // Safari must finish cancelling before the same canvas is reused.
 return pdfState.cancelled;
}
async function discardPdfDocument(){
 await cancelPdfRender();
 const task=pdfState.task;
 pdfState.task=null;pdfState.doc=null;pdfState.documentPromise=null;
 if(task)await task.destroy().catch(()=>{});
}
function refreshPdfNotice(){
 document.querySelectorAll('.pdf-file-status').forEach(el=>{el.textContent=pdfState.name+' '+pdfState.message});
}
async function loadPdf(file,page){if(!file)return;const generation=++pdfState.loading;
 try{
 const signature=new TextDecoder().decode(await file.slice(0,1024).arrayBuffer());
 if(!signature.includes('%PDF-'))throw new Error('PDF 파일 형식이 아닙니다.');
 await discardPdfDocument();if(generation!==pdfState.loading)return;
 pdfState.file=file;pdfState.name=file.name||'교재 PDF';pdfState.message='기기에 저장 중…';
 try{await pdfStore('readwrite',{blob:file,name:pdfState.name,offset:pdfState.offset});
 if(generation!==pdfState.loading)return;pdfState.message='기기에 저장됨 · 다음 접속 시 자동 연결';
 }catch(e){console.warn('PDF local storage failed:',e.name);pdfState.message=e.name==='QuotaExceededError'?'저장 공간이 부족합니다. 지금은 열 수 있지만 다음 접속 시 다시 선택해야 합니다.':'기기에 저장하지 못했습니다. 지금은 열 수 있지만 다음 접속 시 다시 선택해 주세요.'}
 if(generation!==pdfState.loading)return;
 if(page!==undefined)modal={type:'pdf',page};render();
 // Persistence is optional and browser-controlled; rejection must not block study.
 if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
 }catch(e){if(generation!==pdfState.loading)return;pdfState.message='PDF 선택 실패: '+e.message;render()}
}
async function setPdfOffset(value){
 const offset=Number(value);
 if(String(value).trim()===''||!Number.isSafeInteger(offset)){
  if(modal?.type==='pdf')pdfStatus('오프셋은 정수로 입력해 주세요.');
  else alert('오프셋은 정수로 입력해 주세요.');
  return;
 }
 pdfState.offset=offset;
 // Do not rebuild the DOM on blur: Safari would discard the following button tap.
 if(modal?.type==='pdf'){delete modal.actualPage;renderPdfPage()}
 if(pdfState.file){
  try{await pdfStore('readwrite',{blob:pdfState.file,name:pdfState.name,offset});pdfState.message='PDF와 페이지 오프셋이 기기에 저장되었습니다.'}
  catch(e){pdfState.message='오프셋을 저장하지 못했습니다. 다음 접속 시 다시 설정해 주세요.'}
 }
 refreshPdfNotice();
}
function openSource(page){return withStudyInputCommit(()=>{
 modal={type:pdfState.file?'pdf':'notpdf',page:Number(page)};
 render();
})}
function pdfViewerHtml(){return `<div class="flex"><h3>교재 보기 · 인쇄 ${modal.page}쪽</h3><button class="btn" onclick="closeModal()">닫기</button></div><div class="btnrow pdf-controls" style="margin:16px 0"><button id="pdf-prev" class="btn" onclick="movePdfPage(-1)" disabled>이전 페이지</button><label class="tiny" for="pdf-page">PDF 실제 페이지</label><input id="pdf-page" type="number" inputmode="numeric" min="1" step="1" value="${requestedPdfPage()}" oninput="previewPdfPage(this.value)" onchange="goPdfPage(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();goPdfPage(this.value)}" disabled><span id="pdf-total" class="tiny muted">/ 문서 로딩 중</span><button id="pdf-next" class="btn" onclick="movePdfPage(1)" disabled>다음 페이지</button></div>${pdfSelectionHtml(modal.page)}<div class="field" style="margin-top:12px"><label class="tiny" for="viewer-offset">페이지 오프셋 (실제 페이지 − 인쇄 쪽수)</label><input id="viewer-offset" type="number" step="1" value="${pdfState.offset}" onchange="setPdfOffset(this.value)"></div><p id="pdf-status" class="hint pdf-status" role="status">PDF 문서를 불러오는 중…</p><div class="btnrow"><button class="btn" onclick="renderPdfPage()">표시 다시 시도</button></div><div class="pdf-scroll"><canvas id="pdf-canvas" aria-label="교재 PDF 페이지" hidden></canvas></div>`}
function pdfStatus(message){const el=document.getElementById('pdf-status');if(el)el.textContent=message}
function requestedPdfPage(){return modal.actualPage??modal.page+pdfState.offset}
function updatePdfControls(doc,n){
 document.getElementById('pdf-total').textContent=`/ ${doc.numPages}페이지`;
 const input=document.getElementById('pdf-page');
 input.disabled=false;input.max=doc.numPages;input.value=n;
 document.getElementById('pdf-prev').disabled=n<=1;
 document.getElementById('pdf-next').disabled=n>=doc.numPages;
}
function previewPdfPage(value){
 const doc=pdfState.doc;if(!doc||modal?.type!=='pdf')return;
 const n=Number(value),valid=String(value).trim()!==''&&Number.isSafeInteger(n)&&n>=1&&n<=doc.numPages;
 const target=valid?n:requestedPdfPage();
 document.getElementById('pdf-prev').disabled=target<=1;
 document.getElementById('pdf-next').disabled=target>=doc.numPages;
}
function goPdfPage(value){
 if(modal?.type!=='pdf')return;
 const doc=pdfState.doc,n=Number(value);
 if(!doc){pdfStatus('PDF 문서가 준비될 때까지 기다려 주세요.');return}
 if(String(value).trim()===''||!Number.isSafeInteger(n)||n<1||n>doc.numPages){
  pdfStatus(`PDF 페이지는 1~${doc.numPages} 범위의 정수로 입력해 주세요. 현재 요청: ${value}`);
  document.getElementById('pdf-page').value=requestedPdfPage();
  return;
 }
 modal.actualPage=n;
 renderPdfPage();
}
function movePdfPage(delta){if(modal?.type==='pdf')goPdfPage(requestedPdfPage()+delta)}
async function renderPdfPage(){
 const cancelled=cancelPdfRender(),token=pdfState.token,viewer=modal;
 const canvas=document.getElementById('pdf-canvas');
 if(viewer?.type!=='pdf'||!canvas||!pdfState.file)return;
 const current=()=>token===pdfState.token&&modal===viewer&&canvas.isConnected;
 let phase='PDF 문서/worker 로드';
 canvas.hidden=true;
 pdfStatus('PDF 문서를 준비하는 중…');
 try{
  await cancelled;
  if(!current())return;
  const doc=await ensurePdfDocument();
  if(!current()||!doc)return;
  const n=requestedPdfPage();
  updatePdfControls(doc,n);
  if(!Number.isSafeInteger(n)||n<1||n>doc.numPages){
   canvas.hidden=true;
   pdfStatus(`페이지 범위 오류: 인쇄 ${viewer.page}쪽 + 오프셋 ${pdfState.offset} = PDF ${n}페이지. 실제 PDF는 1~${doc.numPages}페이지입니다. 오프셋을 조정하거나 실제 페이지 번호를 입력해 주세요.`);
   return;
  }
  phase=`PDF ${n}페이지 읽기`;
  pdfStatus(`PDF ${n}/${doc.numPages}페이지를 불러오는 중…`);
  const page=await doc.getPage(n);
  if(!current())return;
  const base=page.getViewport({scale:1}),width=Math.max(1,canvas.parentElement.clientWidth);
  // Bound pixel area for Safari's canvas memory limits on scanned textbooks.
  const scale=Math.min(width/base.width,1.8)*Math.min(window.devicePixelRatio||1,2);
  const bounded=Math.min(scale,Math.sqrt(4000000/(base.width*base.height)));
  const viewport=page.getViewport({scale:bounded});
  canvas.width=Math.floor(viewport.width);canvas.height=Math.floor(viewport.height);
  phase=`PDF ${n}페이지 렌더링`;
  const task=page.render({canvasContext:canvas.getContext('2d'),viewport});
  pdfState.renderTask=task;
  await task.promise;
  if(!current())return;
  pdfState.renderTask=null;canvas.hidden=false;canvas.dataset.page=String(n);
  canvas.setAttribute('aria-label',`교재 PDF ${n}페이지`);
  pdfStatus(`인쇄 ${n-pdfState.offset}쪽 · PDF ${n}/${doc.numPages}페이지`);
 }catch(e){
  if(!current()||e.name==='RenderingCancelledException')return;
  canvas.hidden=true;
  pdfStatus(`PDF 표시 실패 [${phase} / ${e.name||'Error'}]: ${e.message} · PDF.js/worker 파일 경로와 연결 상태를 확인하거나, 손상·암호화되지 않은 PDF를 다시 선택해 주세요.`);
 }
}
let pdfResizeTimer;
window.addEventListener('resize',()=>{
 clearTimeout(pdfResizeTimer);
 pdfResizeTimer=setTimeout(()=>{if(modal?.type==='pdf')renderPdfPage()},150);
});
