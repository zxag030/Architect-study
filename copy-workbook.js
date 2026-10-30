// Copy rows keep their native editors for the entire attempt. Validation only
// changes feedback nodes; it never replaces a textarea or assigns its value.
function copyComparisonText(value){return String(value??'').normalize('NFC').replace(/\s/g,'')}
function ensureCopyWorkbook(){
 if(!session)return;
 const count=sessionCopies();
 if(!Array.isArray(session.copyDrafts))session.copyDrafts=Array(count).fill('');
 session.copyDrafts=Array.from({length:count},(_,i)=>String(session.copyDrafts[i]??''));
 if(!Array.isArray(session.copyResults))session.copyResults=[];
 session.copyChecked=session.copyChecked===true;
 session.copyAnswerHidden=session.copyAnswerHidden===true;
}
function copyWorkbookReady(){
 if(!session)return false;
 ensureCopyWorkbook();const answer=copyComparisonText(activeCard()?.answer);
 return !!answer&&session.copyChecked&&session.copyDrafts.every(value=>copyComparisonText(value)===answer);
}
function copyWorkbookHtml(card){
 ensureCopyWorkbook();const count=sessionCopies(),filled=session.copyDrafts.filter(value=>copyComparisonText(value)).length;
 const rows=session.copyDrafts.map((value,index)=>{
  const id=`copy-${session.id}-${card.id}-${index}`;
  const assessed=session.copyChecked?session.copyResults[index]:null;
  return `<div class="copy-row"><div class="flex"><label class="tiny strong" for="${safe(id)}">${index+1}회</label><span class="tiny copy-result" data-copy-result="${index}" role="status">${assessed===true?'정답 일치':assessed===false?'정답을 다시 확인해 주세요':''}</span></div><textarea class="copyInput typeInput ${assessed===true?'right':assessed===false?'wrong':''}" readonly id="${safe(id)}" name="${safe(id)}" data-idx="${index}" rows="3" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="${index+1}회 따라 쓰기" placeholder="${index+1}회 · 기준 정답 전체를 입력하세요.">${safe(value)}</textarea></div>`;
 }).join('');
 return `<section class="copy-workbook" aria-label="따라 쓰기 ${count}회"><div class="flex" style="margin-bottom:12px"><div class="tiny strong">정답 전체를 ${count}개 입력칸에 각각 작성하세요.</div><button class="btn" type="button" id="copy-answer-toggle" onclick="toggleCopyAnswer()" aria-expanded="${!session.copyAnswerHidden}" aria-controls="copy-reference">정답 ${session.copyAnswerHidden?'보기':'가리기'}</button></div><div class="answerBox" id="copy-reference" ${session.copyAnswerHidden?'hidden':''}>${safe(card.answer)}</div><div class="copy-progress" style="margin:18px 0"><p id="copy-progress-text" class="tiny strong" role="status">작성 ${filled}/${count}회 · ${Math.round(filled/count*100)}%</p><div class="bar" id="copy-progress" role="progressbar" aria-label="따라 쓰기 작성 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(filled/count*100)}"><div class="fill" style="width:${Math.round(filled/count*100)}%"></div></div><p class="hint">공백만 쓴 칸은 작성으로 세지 않습니다. 띄어쓰기·줄바꿈 차이는 무시하고, 내용·숫자·기호가 모두 같은지 확인합니다.</p></div><div class="copy-rows">${rows}</div><p id="copy-check-feedback" class="feedback" role="status" ${session.copyChecked?'':'hidden'}>${session.copyChecked?`정답 일치 ${session.copyResults.filter(Boolean).length}/${count}회`:''}</p><div class="btnrow" style="margin-top:20px"><button class="btn ${session.mode==='learn'?'primary':''}" type="button" onclick="advance()">${session.mode==='learn'?'전체 정답 확인 후 2단계로 →':'전체 정답 확인'}</button>${session.mode==='learn'?'':`<button class="btn primary" type="button" onclick="completeModeReview()" ${copyWorkbookReady()?'':'disabled'}>복습 완료</button>`}</div></section>`;
}
function updateCopyWorkbookProgress(){
 if(!session||session.stage!==1)return;
 ensureCopyWorkbook();const count=sessionCopies(),filled=session.copyDrafts.filter(value=>copyComparisonText(value)).length,pct=Math.round(filled/count*100);
 const text=document.getElementById('copy-progress-text');if(text)text.textContent=`작성 ${filled}/${count}회 · ${pct}%`;
 const progress=document.getElementById('copy-progress');if(progress){progress.setAttribute('aria-valuenow',pct);progress.querySelector('.fill').style.width=pct+'%'}
 const complete=document.querySelector('button[onclick="completeModeReview()"]');if(complete)complete.disabled=!copyWorkbookReady();
}
function invalidateCopyAssessment(el,b){
 if(b.field!=='copy')return;
 session.copyChecked=false;session.copyResults=[];session.repeat=0;
 document.querySelectorAll('.copyInput').forEach(node=>node.classList.remove('right','wrong'));
 document.querySelectorAll('[data-copy-result]').forEach(node=>{node.textContent=''});
 const feedback=document.getElementById('copy-check-feedback');if(feedback)feedback.hidden=true;
 const complete=document.querySelector('button[onclick="completeModeReview()"]');if(complete)complete.disabled=true;
}
function checkCopyWorkbook(){
 if(!session||session.stage!==1)return false;
 ensureCopyWorkbook();const answer=copyComparisonText(activeCard()?.answer);
 session.copyResults=session.copyDrafts.map(value=>!!answer&&!!copyComparisonText(value)&&copyComparisonText(value)===answer);
 session.copyChecked=true;session.repeat=session.copyResults.filter(Boolean).length;
 document.querySelectorAll('.copyInput').forEach(el=>{
  const index=Number(el.dataset.idx),ok=session.copyResults[index];el.classList.toggle('right',ok);el.classList.toggle('wrong',!ok);
  const message=document.querySelector(`[data-copy-result="${index}"]`);if(message)message.textContent=ok?'정답 일치':copyComparisonText(session.copyDrafts[index])?'내용이 다릅니다. 정답 전체를 확인해 주세요.':'아직 작성하지 않았습니다.';
 });
 const feedback=document.getElementById('copy-check-feedback');if(feedback){feedback.hidden=false;feedback.textContent=`정답 일치 ${session.repeat}/${sessionCopies()}회${copyWorkbookReady()?' · 모두 정확하게 작성했습니다.':' · 모든 칸을 정확히 작성한 후 다시 확인해 주세요.'}`}
 updateCopyWorkbookProgress();
 if(typeof scheduleReviewDraftSave==='function')scheduleReviewDraftSave();
 return copyWorkbookReady();
}
function toggleCopyAnswer(){
 if(!session||session.stage!==1)return;
 session.copyAnswerHidden=!session.copyAnswerHidden;
 const box=document.getElementById('copy-reference');if(box)box.hidden=session.copyAnswerHidden;
 const button=document.getElementById('copy-answer-toggle');if(button){button.textContent='정답 '+(session.copyAnswerHidden?'보기':'가리기');button.setAttribute('aria-expanded',String(!session.copyAnswerHidden))}
 if(typeof scheduleReviewDraftSave==='function')scheduleReviewDraftSave();
}
