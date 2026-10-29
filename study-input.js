// Only one blank owns the native editor. Other blanks stay readonly through IME handoff.
const studyInputState={bindings:new WeakMap(),composing:new Set(),settling:new Set(),owner:null,renderPending:false,action:null,frame:0,revision:0,trace:[],allowRender:0};
function currentStudyBinding(el){
 if(!el?.isConnected)return null;
 const b=studyInputState.bindings.get(el);
 return b&&session===b.owner&&session.ids[session.idx]===b.card&&session.stage===b.stage?b:null;
}
function traceStudyEvent(event){
 const b=currentStudyBinding(event.target);if(!b)return;
 studyInputState.trace.push({event:event.type,field:event.target.id,index:b.field==='blank'?b.index:null,
  phase:b.phase,inputType:event.inputType||null,isComposing:!!event.isComposing,blocked:!!event.defaultPrevented,time:Math.round(performance.now())});
 if(studyInputState.trace.length>160)studyInputState.trace.shift();
}
function downloadInputTrace(){download('입력_이벤트_진단.json',JSON.stringify({version:2,events:studyInputState.trace},null,2),'application/json')}
function studyInputNotice(message){const el=document.getElementById('study-input-status');if(el)el.textContent=message}
function bindStudyInputs(){
 if(!session)return;
 const blanks=[...document.querySelectorAll('.blankInput')];
 document.querySelectorAll('.blankInput,#typing,#freeInput').forEach(el=>{
  if(studyInputState.bindings.has(el))return;
  const field=el.matches('.blankInput')?'blank':el.id==='typing'?'typed':'free';
  studyInputState.bindings.set(el,{owner:session,card:session.ids[session.idx],stage:session.stage,field,index:Number(el.dataset.idx),phase:'idle',blurred:false});
  if(field==='blank')el.readOnly=true;
 });
 if(!currentStudyBinding(studyInputState.owner))studyInputState.owner=null;
 // First activation is driven by a real pointer/focus event, never programmatic focus.
 if(blanks.length&&!studyInputState.owner)studyInputNotice('입력할 빈칸을 누르세요. 칸 이동 시 조합이 끝나지 않았다면 한 번 더 눌러 입력하세요.');
}
function invalidateBlankAssessment(el,b){
 if(b.field!=='blank')return;
 session.blankPassed=false;session.checked=false;el.classList.remove('right','wrong');
 document.querySelectorAll('.blank-feedback').forEach(node=>node.remove());
 const next=document.querySelector('button[onclick="advance()"],button[onclick="completeModeReview()"]');if(next)next.disabled=true;
}
function storeStudyInput(el){
 const b=currentStudyBinding(el);if(!b||studyInputState.composing.has(el))return;
 if(b.field==='blank')session.blank[b.index]=el.value;
 else{session[b.field]=el.value;if(b.field==='typed'&&document.getElementById('live'))typingLive()}
}
function snapshotStudyInputs(){document.querySelectorAll('.blankInput,#typing,#freeInput').forEach(storeStudyInput)}
function studyInputBusy(){return studyInputState.composing.size||studyInputState.settling.size}
function deferStudyRender(){
 if(studyInputBusy()||(!studyInputState.allowRender&&currentStudyBinding(document.activeElement))){studyInputState.renderPending=true;return true}
 return false;
}
function runStudyAction(action){studyInputState.allowRender++;try{snapshotStudyInputs();return action()}finally{studyInputState.allowRender--}}
function scheduleStudyInputFlush(){
 if(studyInputState.frame)return;
 const revision=studyInputState.revision;
 studyInputState.frame=requestAnimationFrame(()=>{
  studyInputState.frame=0;
  if(revision!==studyInputState.revision){scheduleStudyInputFlush();return}
  // Two quiet animation frames, and a native blur/end, are required before handoff.
  studyInputState.frame=requestAnimationFrame(()=>{
   studyInputState.frame=0;
   if(revision!==studyInputState.revision){scheduleStudyInputFlush();return}
   for(const el of [...studyInputState.settling]){
    const b=studyInputState.bindings.get(el);
    if(studyInputState.composing.has(el)&&!b?.blurred)continue;
    studyInputState.composing.delete(el);studyInputState.settling.delete(el);if(b)b.phase='idle';storeStudyInput(el);
    if(b?.field==='blank'&&b.blurred){el.readOnly=true;if(studyInputState.owner===el)studyInputState.owner=null}
   }
   if(studyInputBusy())return;
   const action=studyInputState.action;studyInputState.action=null;
   if(action&&session===action.owner&&session?.ids[session.idx]===action.card&&session?.stage===action.stage)runStudyAction(action.run);
   if(studyInputState.renderPending&&!currentStudyBinding(document.activeElement)){
    const liveInputs=[...document.querySelectorAll('.blankInput,#typing,#freeInput')];
    if(session&&liveInputs.some(currentStudyBinding)&&!modal){
     // Background progress/PDF restoration must not rebuild an existing editor.
     studyInputState.renderPending=false;
     const progress=document.querySelector('.daily-progress');if(progress)progress.outerHTML=dailyProgress();
    }else render();
   }
   if(!studyInputState.owner)studyInputNotice('입력이 확정됐습니다. 다음 빈칸을 눌러 입력하세요.');
  });
 });
}
function withStudyInputCommit(run){
 if(studyInputBusy()){
  studyInputState.action??={owner:session,card:session?.ids[session.idx],stage:session?.stage,run};
  studyInputNotice('한글 입력 확정 후 처리합니다. 키보드의 완료를 눌러주세요.');scheduleStudyInputFlush();return;
 }
 return runStudyAction(run);
}
function activateStudyBlank(el){
 const b=currentStudyBinding(el);if(!b||b.field!=='blank')return;
 if(studyInputState.owner!==el&&studyInputBusy()){
  el.readOnly=true;studyInputNotice('이전 칸의 조합을 확정하고 있습니다. 잠시 후 이 칸을 다시 눌러주세요.');return;
 }
 const old=studyInputState.owner;
 if(old&&old!==el){storeStudyInput(old);old.readOnly=true}
 studyInputState.owner=el;el.readOnly=false;b.blurred=false;
}
// Native button focus commits the old editor; no .blur(), .focus() or value assignment.
document.addEventListener('pointerdown',event=>{if(currentStudyBinding(event.target)?.field==='blank')activateStudyBlank(event.target)},true);
document.addEventListener('focus',event=>{
 const b=currentStudyBinding(event.target);if(!b)return;b.blurred=false;
 if(b.field==='blank')activateStudyBlank(event.target);traceStudyEvent(event);
},true);
document.addEventListener('blur',event=>{
 const el=event.target,b=studyInputState.bindings.get(el);if(!b)return;
 b.blurred=true;studyInputState.revision++;
 if(b.phase==='idle'&&!studyInputState.composing.has(el)&&!studyInputState.settling.has(el)){
  storeStudyInput(el);
  if(b.field==='blank'){el.readOnly=true;if(studyInputState.owner===el)studyInputState.owner=null}
 }else studyInputState.settling.add(el);
 scheduleStudyInputFlush();traceStudyEvent(event);
},true);
for(const type of ['compositionstart','compositionupdate','compositionend','beforeinput','input'])document.addEventListener(type,event=>{
 const el=event.target,b=currentStudyBinding(el);if(!b)return;
 // Cancel stale composition aimed at another readonly blank; never trim text or
 // guess which Korean characters the user intended, and never rewrite .value.
 if(b.field==='blank'&&(el.readOnly||studyInputState.owner!==el)){
  if(event.cancelable)event.preventDefault();traceStudyEvent(event);return;
 }
 studyInputState.revision++;
 if(type==='compositionstart'||type==='compositionupdate'||(type==='beforeinput'&&event.isComposing&&b.phase!=='ending')){
  b.phase='composing';studyInputState.composing.add(el);invalidateBlankAssessment(el,b);
 }else if(type==='compositionend'){
  b.phase='ending';studyInputState.composing.delete(el);studyInputState.settling.add(el);scheduleStudyInputFlush();
 }else if(type==='input'){
  if(event.isComposing&&b.phase!=='ending'){b.phase='composing';studyInputState.composing.add(el)}
  if(b.field==='blank'&&session.blank[b.index]!==el.value)invalidateBlankAssessment(el,b);
  if(!studyInputBusy())storeStudyInput(el);
  else if(!studyInputState.composing.has(el)){studyInputState.settling.add(el);scheduleStudyInputFlush()}
 }
 traceStudyEvent(event);
},true);
function studyHintText(card=activeCard()){return card.blanks.map(word=>{const chars=[...String(word).trim()];return chars.length>1?chars[0]+'…':'○'}).join(' · ')}
function toggleStudyHint(){return withStudyInputCommit(()=>{
 if(!session)return;

 session.hint=!session.hint;const el=document.getElementById('study-hint');
 if(el){el.hidden=!session.hint;el.textContent=session.hint?'앞글자 힌트: '+studyHintText():''}
 document.querySelectorAll('[data-study-hint]').forEach(button=>{button.textContent='힌트 '+(session.hint?'접기':'보기')});
})}
