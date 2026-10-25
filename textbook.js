// The textbook bytes stay in IndexedDB on this origin; it is never sent over HTTP.
const pdfState={file:null,name:'',offset:0,message:'PDF를 선택하면 이 기기에 자동 저장합니다.',doc:null,task:null,renderTask:null,token:0,loading:0};
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
function pdfSelectionHtml(page){return `<div class="btnrow"><label class="btn" style="cursor:pointer">PDF ${pdfState.file?'다시 선택':'선택'}<input type="file" accept="application/pdf,.pdf" style="display:none" onchange="loadPdf(this.files[0],${page===undefined?'undefined':Number(page)})"></label><span class="tiny muted pdf-name" role="status">${safe(pdfState.name)} ${safe(pdfState.message)}</span></div>`}
async function restorePdf(){const generation=pdfState.loading;try{
 const record=await pdfStore('readonly');if(generation!==pdfState.loading)return;
 if(record?.bytes instanceof ArrayBuffer||record?.blob instanceof Blob){pdfState.file=record.bytes?new Blob([record.bytes],{type:'application/pdf'}):record.blob;pdfState.name=record.name||'저장된 교재';pdfState.offset=Number.isInteger(record.offset)?record.offset:0;pdfState.message='기기에 저장된 PDF를 자동 연결했습니다.';
 if(modal?.type==='notpdf')modal.type='pdf';render()}
 }catch(e){if(generation!==pdfState.loading)return;pdfState.message='저장된 PDF를 읽을 수 없습니다. 파일을 다시 선택해 주세요.';render()}
}
async function pdfJs(){if(!pdfLibrary)pdfLibrary=import('./vendor/pdfjs/legacy/build/pdf.mjs').then(lib=>{lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdfjs/legacy/build/pdf.worker.mjs',document.baseURI).href;return lib}).catch(e=>{pdfLibrary=null;throw e});return pdfLibrary}
function cancelPdfRender(){pdfState.token++;if(pdfState.renderTask){pdfState.renderTask.cancel();pdfState.renderTask=null}}
async function discardPdfDocument(){cancelPdfRender();if(pdfState.task){await pdfState.task.destroy().catch(()=>{});pdfState.task=null}pdfState.doc=null}
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
async function setPdfOffset(value){const offset=Number(value);if(!Number.isInteger(offset)){alert('오프셋은 정수로 입력해 주세요.');render();return}
 pdfState.offset=offset;
 if(pdfState.file){try{await pdfStore('readwrite',{blob:pdfState.file,name:pdfState.name,offset});pdfState.message='PDF와 페이지 오프셋이 기기에 저장되었습니다.'}catch(e){pdfState.message='오프셋을 저장하지 못했습니다. 다음 접속 시 다시 설정해 주세요.'}}
 render();
}
function openSource(page){modal={type:pdfState.file?'pdf':'notpdf',page:Number(page)};render()}
function pdfViewerHtml(){return `<div class="flex"><h3>교재 보기 · 인쇄 ${modal.page}쪽</h3><button class="btn" onclick="closeModal()">닫기</button></div>${pdfSelectionHtml(modal.page)}<div class="btnrow pdf-controls" style="margin-top:16px"><button class="btn" onclick="movePdfPage(-1)">이전</button><label class="tiny">PDF 실제 페이지 <input id="pdf-page" type="number" min="1" value="${modal.actualPage??modal.page+pdfState.offset}" onchange="goPdfPage(this.value)"></label><button class="btn" onclick="movePdfPage(1)">다음</button><span id="pdf-total" class="tiny muted"></span></div><div class="field" style="margin-top:12px"><label class="tiny" for="viewer-offset">페이지 오프셋 (실제 페이지 − 인쇄 쪽수)</label><input id="viewer-offset" type="number" step="1" value="${pdfState.offset}" onchange="delete modal.actualPage;setPdfOffset(this.value)"></div><p id="pdf-status" class="hint pdf-status" role="status">페이지를 불러오는 중…</p><div class="pdf-scroll"><canvas id="pdf-canvas" aria-label="교재 PDF 페이지"></canvas></div>`}
function goPdfPage(value){const n=Number(value);if(!Number.isInteger(n)||n<1||(pdfState.doc&&n>pdfState.doc.numPages)){const status=document.getElementById('pdf-status');if(status)status.textContent='PDF 범위 안의 페이지 번호를 입력해 주세요.';return}modal.actualPage=n;render()}
function movePdfPage(delta){goPdfPage((modal.actualPage??modal.page+pdfState.offset)+delta)}
async function renderPdfPage(){cancelPdfRender();const token=pdfState.token;const canvas=document.getElementById('pdf-canvas');if(!canvas||!pdfState.file)return;
 const status=document.getElementById('pdf-status');
 try{
 if(!pdfState.doc){const lib=await pdfJs();if(token!==pdfState.token)return;
 if(!pdfState.task){const bytes=await pdfState.file.arrayBuffer();if(token!==pdfState.token)return;pdfState.task=lib.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,cMapUrl:new URL('./vendor/pdfjs/cmaps/',document.baseURI).href,cMapPacked:true,standardFontDataUrl:new URL('./vendor/pdfjs/standard_fonts/',document.baseURI).href});}
 const doc=await pdfState.task.promise;if(token!==pdfState.token)return;pdfState.doc=doc;
 }
 const doc=pdfState.doc;const n=modal.actualPage??modal.page+pdfState.offset;
 document.getElementById('pdf-total').textContent=`/ ${doc.numPages}페이지`;
 document.getElementById('pdf-page').max=doc.numPages;
 if(!Number.isInteger(n)||n<1||n>doc.numPages)throw new Error(`인쇄 ${modal.page}쪽 + 오프셋 ${pdfState.offset} = PDF ${n}페이지입니다. 1~${doc.numPages} 범위에 맞게 오프셋을 조정해 주세요.`);
 const page=await doc.getPage(n);if(token!==pdfState.token)return;
 const base=page.getViewport({scale:1});const width=Math.max(1,canvas.parentElement.clientWidth);
 // Bound pixel area for Safari's canvas memory limits, especially on scanned textbooks.
 const scale=Math.min(width/base.width,1.8)*Math.min(window.devicePixelRatio||1,2);
 const bounded=Math.min(scale,Math.sqrt(4000000/(base.width*base.height)));
 const viewport=page.getViewport({scale:bounded});canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
 pdfState.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await pdfState.renderTask.promise;
 if(token===pdfState.token){pdfState.renderTask=null;status.textContent=`인쇄 ${n-pdfState.offset}쪽 · PDF ${n}/${doc.numPages}페이지`}
 }catch(e){if(token!==pdfState.token||e.name==='RenderingCancelledException')return;status.textContent='PDF 표시 실패: '+e.message+' 파일이 손상되었거나 암호로 보호되었다면 잠금 해제한 PDF를 다시 선택해 주세요.';if(!pdfState.doc){pdfState.task?.destroy().catch(()=>{});pdfState.task=null}}
}
let pdfResizeTimer;window.addEventListener('resize',()=>{clearTimeout(pdfResizeTimer);pdfResizeTimer=setTimeout(()=>{if(modal?.type==='pdf')renderPdfPage()},150)});
