// Keep native IME state in its original DOM node until the browser commits it.
const studyInputState={bindings:new WeakMap(),composing:new Set(),settling:new Set(),renderPending:false,action:null,frame:0};
function bindStudyInputs(){
 if(!session)return;
 document.querySelectorAll('.blankInput,#typing,#freeInput').forEach(el=>{
  if(studyInputState.bindings.has(el))return;
  const field=el.matches('.blankInput')?'blank':el.id==='typing'?'typed':'free';
  studyInputState.bindings.set(el,{owner:session,card:session.ids[session.idx],stage:session.stage,field,index:Number(el.dataset.idx)});
 });
}
function currentStudyBinding(el){
 if(!el?.isConnected)return null;
 const b=studyInputState.bindings.get(el);
 return b&&session===b.owner&&session.ids[session.idx]===b.card&&session.stage===b.stage?b:null;
}
function invalidateBlankAssessment(el,b){
 if(b.field!=='blank')return;
 session.blankPassed=false;session.checked=false;
 el.classList.remove('right','wrong');
 document.querySelectorAll('.blank-feedback').forEach(node=>node.remove());
 const next=document.querySelector('button[onclick="advance()"]');if(next)next.disabled=true;
}
function storeStudyInput(el){
 const b=currentStudyBinding(el);if(!b||studyInputState.composing.has(el))return;
 if(b.field==='blank'){
  if(Number.isInteger(b.index)&&b.index>=0)session.blank[b.index]=el.value;
 }else{session[b.field]=el.value;if(b.field==='typed'&&document.getElementById('live'))typingLive()}
}
function snapshotStudyInputs(){
 document.querySelectorAll('.blankInput,#typing,#freeInput').forEach(el=>{
  if(!studyInputState.composing.has(el))storeStudyInput(el);
 });
}
function deferStudyRender(){
 // Background updates must not replace a focused input, even between syllables.
 if(studyInputState.composing.size||studyInputState.settling.size||currentStudyBinding(document.activeElement)){
  studyInputState.renderPending=true;return true;
 }
 return false;
}
function scheduleStudyInputFlush(){
 if(studyInputState.frame)return;
 studyInputState.frame=requestAnimationFrame(()=>{
  studyInputState.frame=0;
  studyInputState.settling.forEach(storeStudyInput);studyInputState.settling.clear();
  if(studyInputState.composing.size)return;
  const action=studyInputState.action;studyInputState.action=null;
  if(action&&session&&session===action.owner&&session?.ids[session.idx]===action.card&&session?.stage===action.stage){
   snapshotStudyInputs();action.run();
  }
  if(studyInputState.renderPending&&!currentStudyBinding(document.activeElement))render();
 });
}
function withStudyInputCommit(run){
 const focused=document.activeElement;
 if(studyInputState.composing.size||studyInputState.settling.size){
  // Keep just one action so repeated taps cannot advance twice after composition.
  studyInputState.action??={owner:session,card:session?.ids[session.idx],stage:session?.stage,run};
  if(currentStudyBinding(focused))focused.blur();
  scheduleStudyInputFlush();return;
 }
 if(currentStudyBinding(focused))focused.blur();
 snapshotStudyInputs();return run();
}
document.addEventListener('compositionstart',event=>{
 const b=currentStudyBinding(event.target);if(!b)return;
 studyInputState.composing.add(event.target);invalidateBlankAssessment(event.target,b);
});
document.addEventListener('input',event=>{
 const el=event.target,b=currentStudyBinding(el);if(!b)return;
 if(event.isComposing||studyInputState.composing.has(el)||b.field!=='blank'||session.blank[b.index]!==el.value)invalidateBlankAssessment(el,b);
 if(event.isComposing)studyInputState.composing.add(el);
 if(!studyInputState.composing.has(el))storeStudyInput(el);
});
document.addEventListener('compositionend',event=>{
 const el=event.target;if(!studyInputState.bindings.has(el))return;
 studyInputState.composing.delete(el);studyInputState.settling.add(el);
 // Read this node, never document.activeElement (which may already be another blank).
 storeStudyInput(el);scheduleStudyInputFlush();
});
document.addEventListener('focusin',event=>{
 // Bindings belong to a node and card, never to whichever blank was focused last.
 if(currentStudyBinding(event.target))storeStudyInput(event.target);
});
document.addEventListener('focusout',event=>{
 const el=event.target;if(!studyInputState.bindings.has(el))return;
 if(!studyInputState.composing.has(el))storeStudyInput(el);
 else requestAnimationFrame(()=>{
  // Some WebKit IME paths blur without emitting compositionend. Let native blur
  // settle first; do not set value or move focus to manufacture a composition end.
  if(document.activeElement!==el&&studyInputState.composing.delete(el))storeStudyInput(el);
  scheduleStudyInputFlush();
 });
 scheduleStudyInputFlush();
});
