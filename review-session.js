// Review drafts stay on this device and in JSON backups. Editor nodes are read,
// never changed, when a native IME composition is being saved for later.
let reviewDraftTimer=0,reviewDraftSaveFailed=false,pendingReviewArchive=null,reviewExternalStorageChange=false;
let reviewKnownStorageValue=loadedStudyStorage;
function noteStudyStorageWrite(serialized){reviewKnownStorageValue=serialized;reviewExternalStorageChange=false}
const REVIEW_DRAFT_FIELDS=['stage','stages','copyTarget','requiresBlanks','entryStatus','answerConfirmed','answerSeen','answerViewed','hintUsed','typed','free','blank','revealed','checked','hint','repeat','blankPassed','copyDrafts','copyChecked','copyResults','copyAnswerHidden'];
function reviewPlain(value){return !!value&&typeof value==='object'&&!Array.isArray(value)}
function reviewCardSignature(card){return JSON.stringify([card.q,card.answer,card.blanks])}
function validateReviewSession(value){
 if(!reviewPlain(value)||typeof value.id!=='string'||!value.id||value.mode!=='review'||!['copy','blank','free'].includes(value.reviewMode)||!Array.isArray(value.ids)||!value.ids.length||!value.ids.every(id=>typeof id==='string'&&id)||new Set(value.ids).size!==value.ids.length||!Number.isSafeInteger(value.idx)||value.idx<0||value.idx>value.ids.length)throw new Error('저장된 복습 세션의 형식이 올바르지 않습니다.');
 if(value.drafts!=null&&!reviewPlain(value.drafts))throw new Error('복습 초안의 형식이 올바르지 않습니다.');
 for(const key of ['completedIds','eventIds'])if(value[key]!=null&&(!Array.isArray(value[key])||!value[key].every(id=>typeof id==='string')))throw new Error('복습 완료 목록의 형식이 올바르지 않습니다.');
 return structuredClone(value);
}
function reviewDraftFromSession(source){
 const draft={};for(const key of REVIEW_DRAFT_FIELDS)if(source[key]!==undefined)draft[key]=structuredClone(source[key]);
 draft.answerViewed=!!(source.answerViewed||source.answerSeen||source.revealed);
 draft.hintUsed=!!(source.hintUsed||source.hint);
 const card=data.cards.find(c=>c.id===source.ids[source.idx]);if(card)draft.signature=reviewCardSignature(card);
 return draft;
}
function snapshotReviewSession(source=session,readEditors=true){
 if(!source||source.mode!=='review')return null;
 const out=structuredClone(source);out.version=1;out.startedAt??=new Date().toISOString();out.savedAt=new Date().toISOString();out.completedIds??=[];out.eventIds??=[];out.drafts??={};
 if(readEditors&&source===session)document.querySelectorAll('.blankInput,.copyInput,#typing,#freeInput').forEach(el=>{
  const binding=typeof currentStudyBinding==='function'?currentStudyBinding(el):null;
  if(!binding)return;
  const index=Number(el.dataset.idx);if(el.matches('.blankInput')){out.blank??=[];out.blank[index]=el.value}
  else if(el.matches('.copyInput')){out.copyDrafts??=[];out.copyDrafts[index]=el.value}
  else if(el.id==='freeInput')out.free=el.value;
  else if(el.id==='typing')out.typed=el.value;
 });
 if(out.idx<out.ids.length){
  const draft=reviewDraftFromSession(out);out.answerViewed=draft.answerViewed;out.hintUsed=draft.hintUsed;
  Object.defineProperty(out.drafts,out.ids[out.idx],{value:draft,writable:true,enumerable:true,configurable:true});
 }
 return out;
}
function appendReviewArchive(target,record,reason){
 if(!record)return;target.reviewSessionArchive??=[];
 const copy=structuredClone(record);copy.archiveReason=reason;copy.archivedAt??=new Date().toISOString();
 const same=target.reviewSessionArchive.some(item=>item.id===copy.id&&item.savedAt===copy.savedAt&&JSON.stringify(item.drafts)===JSON.stringify(copy.drafts)&&item.idx===copy.idx);
 if(!same)target.reviewSessionArchive.push(copy);
}
function addPendingReviewArchive(target){if(pendingReviewArchive)appendReviewArchive(target,pendingReviewArchive,'restarted')}
function cancelReviewDraftSave(){if(reviewDraftTimer)clearTimeout(reviewDraftTimer);reviewDraftTimer=0}
function reviewDraftStatus(message){const el=document.getElementById('review-draft-status');if(el)el.textContent=message}
function reviewStorageWriteAllowed(notify=false){
 // A queued storage event can describe a write the new document already read
 // during reload. Compare the actual record with the exact last read/write.
 try{reviewExternalStorageChange=localStorage.getItem(STORE_KEY)!==reviewKnownStorageValue}catch(error){return true}
 if(!reviewExternalStorageChange)return true;
 const message='다른 탭에서 학습 기록이 변경되어 자동 저장을 멈췄습니다. 현재 초안을 JSON 백업한 뒤 새로고침하고 기록 병합을 이용해 주세요.';reviewDraftStatus(message);
 if(notify)alert(message);return false;
}
function persistReviewSession(notify=false){
 cancelReviewDraftSave();if(!session||session.mode!=='review')return true;
 if(!reviewStorageWriteAllowed(notify))return false;
 try{
  const record=snapshotReviewSession(),next={...data,reviewSession:record,reviewSessionArchive:[...(data.reviewSessionArchive||[])]};addPendingReviewArchive(next);
  const serialized=JSON.stringify(next);localStorage.setItem(STORE_KEY,serialized);noteStudyStorageWrite(serialized);data.reviewSession=record;
  if(next.reviewSessionArchive.length)data.reviewSessionArchive=next.reviewSessionArchive;
  pendingReviewArchive=null;reviewDraftSaveFailed=false;reviewDraftStatus('이 기기에 초안을 자동 저장했습니다.');return true;
 }catch(error){
  reviewDraftSaveFailed=true;reviewDraftStatus('초안을 저장하지 못했습니다. 저장 공간을 확인하고 JSON 백업을 저장해 주세요.');
  if(notify)alert('복습 초안을 저장하지 못했습니다. 현재 답안은 화면에 유지됩니다. 공간을 확보하거나 JSON 백업을 저장한 뒤 다시 시도해 주세요.');
  return false;
 }
}
function scheduleReviewDraftSave(){
 if(session?.mode!=='review')return;cancelReviewDraftSave();
 reviewDraftTimer=setTimeout(()=>{reviewDraftTimer=0;persistReviewSession()},180);
}
function flushReviewDraftSave(){cancelReviewDraftSave();return persistReviewSession(true)}
function suspendReviewSession(){return flushReviewDraftSave()}
function allowNewReviewSession(){
 if(!reviewStorageWriteAllowed(true))return false;
 const previous=data.reviewSession;if(!previous)return true;
 if(!confirm('진행 중인 복습이 있습니다. 현재 초안을 보관하고 새 복습을 시작할까요? 완료한 기록은 유지됩니다.'))return false;
 pendingReviewArchive=structuredClone(previous);return true;
}
function leaveStudySession(){return withStudyInputCommit(()=>{
 if(!suspendReviewSession())return;const learn=session?.mode==='learn';session=null;view=learn?'today':'review';render();
})}
function reviewResumeHtml(){
 const raw=data.reviewSession;if(!raw)return '';
 try{
  const record=validateReviewSession(raw),completed=new Set(record.completedIds||[]).size;
  const label={copy:'3회 따라 쓰기',blank:'핵심 빈칸',free:'백지서술'}[record.reviewMode];
  return `<section class="notice wide" style="margin-bottom:20px" aria-labelledby="resume-review-title"><h2 id="resume-review-title" style="font-size:18px;margin:0">진행 중 복습 이어하기</h2><p class="hint">${label} · ${record.ids.length}개 중 ${completed}개 완료 · ${Math.min(record.idx+1,record.ids.length)}번째 문제. 답안 초안과 순서를 이 기기에 자동 저장합니다.</p><div class="btnrow"><button class="btn primary" onclick="resumeReviewSession()">이어하기</button><button class="btn" onclick="endReviewSession('restarted')">새로 시작</button><button class="btn" onclick="endReviewSession('ended')">복습 종료</button></div></section>`;
 }catch(error){return `<div class="notice wide">저장된 복습 초안을 읽지 못했습니다. 원본 데이터는 유지됩니다. JSON 백업을 저장하고 기록 병합에서 초안을 확인해 주세요.</div>`}
}
function resumeReviewSession(){return withStudyInputCommit(()=>{
 if(!reviewStorageWriteAllowed(true)||!suspendReviewSession())return;
 let record;try{record=validateReviewSession(data.reviewSession)}catch(error){alert(error.message);return}
 const original=structuredClone(record),history=new Set((data.reviewHistory||[]).map(event=>event.id));
 record.completedIds=uniq([...(record.completedIds||[]),...record.ids.filter((id,index)=>history.has(record.id+':'+index))]);
 record.eventIds=uniq([...(record.eventIds||[]),...record.ids.map((id,index)=>record.id+':'+index).filter(id=>history.has(id))]);
 let missing=0;
 while(record.idx<record.ids.length){
  const id=record.ids[record.idx];if(record.completedIds.includes(id)){record.idx++;continue}
  if(!data.cards.some(card=>card.id===id)){record.skippedIds=uniq([...(record.skippedIds||[]),id]);record.idx++;missing++;continue}break;
 }
 if(record.idx>=record.ids.length){
  const next={...data,reviewSession:null,reviewSessionArchive:[...(data.reviewSessionArchive||[])]};appendReviewArchive(next,record,'completed-or-unavailable');
  try{const serialized=JSON.stringify(next);localStorage.setItem(STORE_KEY,serialized);noteStudyStorageWrite(serialized);data=next;session=null;view='review';render();alert(missing?'목록의 문제가 현재 문제은행에 없습니다. 초안은 보관하고 완료 기록은 유지했습니다.':'이미 저장된 완료 기록을 확인했습니다. 중복 집계하지 않습니다.')}catch(error){alert('복습 상태 저장에 실패했습니다. 기존 초안은 유지됩니다.')}
  return;
 }
 const id=record.ids[record.idx],card=data.cards.find(card=>card.id===id),draft=record.drafts?.[id]||(record.idx===original.idx?reviewDraftFromSession(record):{});
 prepareSessionCard(record);
 for(const key of REVIEW_DRAFT_FIELDS)if(draft[key]!==undefined)record[key]=structuredClone(draft[key]);
 const expectedStage={copy:1,blank:2,free:3}[record.reviewMode];record.stage=expectedStage;record.stages=[expectedStage];record.copyTarget=record.reviewMode==='copy'?3:0;record.requiresBlanks=record.reviewMode==='blank';
 let changed=!!(draft.signature&&draft.signature!==reviewCardSignature(card));
 if(changed){
  record.blank=[];record.blankPassed=false;record.checked=false;record.copyChecked=false;record.copyResults=[];record.repeat=0;record.revealed=false;
  appendReviewArchive(data,original,'question-changed');
 }
 // A restored pass is trusted only when its saved answers still satisfy the
 // current problem. Native IME partial text is retained as an editable draft.
 if(record.reviewMode==='copy'&&typeof copyComparisonText==='function'){
  record.copyDrafts=Array.from({length:3},(_,i)=>typeof record.copyDrafts?.[i]==='string'?record.copyDrafts[i]:'');
  const exact=record.copyDrafts.map(value=>!!copyComparisonText(value)&&copyComparisonText(value)===copyComparisonText(card.answer));
  if(!record.copyChecked||!exact.every(Boolean)){record.copyChecked=false;record.copyResults=[];record.repeat=0}
 }
 if(record.reviewMode==='blank'){
  record.blank=Array.isArray(record.blank)?record.blank.map(value=>typeof value==='string'?value:''):[];
  // Re-check the restored inputs explicitly; a saved boolean is not a grade.
  record.checked=false;record.blankPassed=false;
 }
 record.free=typeof record.free==='string'?record.free:'';
 session=record;view='review';persistReviewSession(true);render();
 if(missing||changed)alert(`${missing?'현재 문제은행에 없는 문제는 건너뛰었습니다. ':''}${changed?'문제가 수정되어 이전 판정을 초기화했습니다. 작성 초안과 원본 사본은 보관했습니다.':''}`);
})}
function endReviewSession(reason='ended'){return withStudyInputCommit(()=>{
 if(!reviewStorageWriteAllowed(true)||!suspendReviewSession())return;const record=data.reviewSession;if(!record)return;
 if(!confirm(reason==='restarted'?'진행 중인 초안을 보관하고 새 복습을 선택할까요? 완료한 학습 기록은 유지됩니다.':'진행 중 복습을 종료할까요? 완료 기록과 초안 사본은 보관합니다.'))return;
 const next={...data,reviewSession:null,reviewSessionArchive:[...(data.reviewSessionArchive||[])]};appendReviewArchive(next,record,reason);
 try{const serialized=JSON.stringify(next);localStorage.setItem(STORE_KEY,serialized);noteStudyStorageWrite(serialized);data=next;pendingReviewArchive=null;cancelReviewDraftSave();if(session?.mode==='review')session=null;view='review';render()}
 catch(error){alert('복습 종료 상태를 저장하지 못했습니다. 기존 초안은 유지됩니다.')}
})}
function stageReviewCompletionSnapshot(){
 cancelReviewDraftSave();const next=snapshotReviewSession();if(!next)return;
 const id=next.ids[next.idx];next.completedIds=uniq([...(next.completedIds||[]),id]);next.eventIds=uniq([...(next.eventIds||[]),next.id+':'+next.idx]);next.idx++;
 addPendingReviewArchive(data);
 if(next.idx>=next.ids.length){appendReviewArchive(data,next,'completed');data.reviewSession=null}
 else{prepareSessionCard(next);data.reviewSession=snapshotReviewSession(next,false)}
}
function clearPendingReviewArchive(){pendingReviewArchive=null}
window.addEventListener('pagehide',()=>persistReviewSession());
document.addEventListener('visibilitychange',()=>{if(document.hidden)persistReviewSession()});

// A second tab is a separate writer. Preserve both drafts instead of allowing
// debounced autosave to overwrite a record this tab has never loaded.
window.addEventListener('storage',event=>{
 if(event.key!==STORE_KEY&&event.key!==null)return;
 if(!reviewStorageWriteAllowed(false))cancelReviewDraftSave();
});
