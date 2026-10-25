// Optional additive data: old v2 records/backups keep their existing meaning.
const MAX_SAME_DAY_RETRIES=2;
function reviewDay(date=today){return data.reviewDays?.[date]||{}}
function reviewRecord(id,date=today){return reviewDay(date)[id]||{completed:false,attempts:0,retries:0,pending:false}}
function rereviewQueue(){return data.cards.filter(c=>{
 const r=reviewRecord(c.id);return r.pending&&r.retries<MAX_SAME_DAY_RETRIES&&pr(c.id).status==='unknown';
})}
function reviewStats(){const records=Object.values(reviewDay());return {
 concepts:records.filter(r=>r.completed).length,
 attempts:records.reduce((n,r)=>n+(r.attempts||0),0),
 retries:records.reduce((n,r)=>n+(r.retries||0),0)
}}
function recordReview(id,status,mode){
 data.reviewDays??={};data.reviewDays[today]??={};
 const old=reviewRecord(id),retries=(old.retries||0)+(mode==='rereview'?1:0);
 data.reviewDays[today][id]={...old,completed:true,attempts:(old.attempts||0)+1,retries,
  pending:status==='unknown'&&retries<MAX_SAME_DAY_RETRIES};
}
function reviewPath(status){
 if(status==='master')return {stages:[3],copies:0,blanks:false};
 if(status==='weak')return {stages:[2,3],copies:0,blanks:true};
 return {stages:[0,1,2,3],copies:3,blanks:true};
}
function prepareSessionCard(){
 const learn=session.mode==='learn',status=pr(session.ids[session.idx]).status;
 const path=learn?{stages:[1,2,3],copies:10,blanks:true}:reviewPath(status);
 Object.assign(session,{stage:path.stages[0],stages:path.stages,copyTarget:path.copies,requiresBlanks:path.blanks,
  entryStatus:status,answerConfirmed:false,typed:'',free:'',blank:[],revealed:false,checked:false,hint:false,repeat:0,blankPassed:false});
}
function sessionCopies(){return session.copyTarget??10}
function adaptiveReady(){
 if(session.mode==='learn')return true;
 return (!session.requiresBlanks||session.blankPassed)&&
  (!session.copyTarget||(session.answerConfirmed&&session.repeat>=session.copyTarget));
}
function sessionSteps(){
 const label=session.mode==='learn'?'최초 학습':session.mode==='random'?'누적 랜덤 테스트':session.mode==='rereview'?'당일 재복습':'일반 복습';
 const names={0:'정답 확인',1:`따라 쓰기 ${sessionCopies()}회`,2:'핵심 빈칸',3:'백지서술'};
 return `<div class="tiny muted" style="margin-bottom:12px">${label}${session.mode==='learn'?'':' · '+pillStatus(session.entryStatus)}</div><div class="stepbar">${session.stages.map(i=>`<span class="step ${i===session.stage?'active':i<session.stage?'done':''}">${names[i]}</span>`).join('')}</div>`;
}
function startRereview(){
 today=nowLocal();const list=rereviewQueue();
 if(!list.length){alert('현재 재복습 대상이 없습니다. 개념당 하루 최대 2회까지 진행합니다.');return}
 startSession(list,'rereview','rereview');
}
function rereviewPanel(){
 const list=rereviewQueue(),stats=reviewStats();
 return `<div class="sectionhead"><h2>오늘의 재복습 대기</h2><span class="tiny muted">일반 복습과 별도</span></div><div class="surface wide"><p class="hint">복습·랜덤 테스트에서 최종 숙지도를 '아직 잘 모름'으로 저장한 개념입니다. 즉시 반복하지 않으며, 개념당 하루 최대 ${MAX_SAME_DAY_RETRIES}회 재복습합니다. 한도에 도달하면 다음날 일정으로 이어집니다.</p><div class="flex"><strong>${list.length}개 개념</strong><button class="btn primary" onclick="startRereview()" ${list.length?'':'disabled'}>당일 재복습 시작</button></div><p class="tiny muted">오늘 복습 완료 ${stats.concepts}개념 · 총 ${stats.attempts}회 (재복습 ${stats.retries}회 포함). 신규 학습 완료 수와 별도로 집계합니다.</p>${list.map(c=>`<div class="item" style="margin-top:10px"><div><h3>${safe(c.q)}</h3><div class="meta">재복습 ${reviewRecord(c.id).retries}/${MAX_SAME_DAY_RETRIES}회 완료</div></div><button class="btn" onclick="startOne('${c.id}','rereview')">재복습</button></div>`).join('')||'<p class="hint">현재 재복습 대기가 없습니다.</p>'}</div>`;
}
