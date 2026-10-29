// New learning and review are separate workflows. Legacy fields remain additive.
let reviewSetup={mode:'free',target:'priority',limit:'10',grades:['unknown','weak','master','unrated','new'],shuffle:false};
function normalizeReviewSetup(value={}){
 const v=value&&typeof value==='object'?value:{};
 return {mode:['copy','blank','free'].includes(v.mode)?v.mode:'free',target:['priority','due','all'].includes(v.target)?v.target:'priority',
 limit:v.limit==='all'||/^[1-9][0-9]*0$/.test(String(v.limit))?String(v.limit):'10',
 grades:Array.isArray(v.grades)?uniq(v.grades.filter(s=>['unknown','weak','master','unrated','new'].includes(s))):['unknown','weak','master','unrated','new'],shuffle:v.shuffle===true};
}
function selectWholeReview(){reviewSetup={...reviewSetup,target:'all',grades:['unknown','weak','master','unrated','new']}}
function loadReviewSetup(){reviewSetup=normalizeReviewSetup(data.settings?.reviewSetup);if(examPlan().reviewFocus)selectWholeReview()}
function isNewConcept(card){const p=pr(card.id);return p.learningCompleted===false||p.status==='new'}
function reviewDay(date=today){return data.reviewDays?.[date]||{}}
function reviewRecord(id,date=today){return reviewDay(date)[id]||{completed:false,attempts:0,retries:0,pending:false}}
function reviewStats(){const rows=Object.values(reviewDay());return {concepts:rows.filter(r=>r.completed).length,attempts:rows.reduce((n,r)=>n+(r.attempts||0),0),retries:rows.reduce((n,r)=>n+(r.retries||0),0)}}
function availableReview(){return true} // Explicit practice is always available for all grades.
function rereviewQueue(){return []} // Old pending fields are retained in backups; no forced adaptive loop.
function unratedReady(){return true}
function newReviewId(){return globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}
function prepareSessionCard(){
 const learn=session.mode==='learn',stage=learn?1:({copy:1,blank:2,free:3}[session.reviewMode]||3);
 Object.assign(session,{stage,stages:learn?[1,2,3]:[stage],copyTarget:learn?10:session.reviewMode==='copy'?3:0,
 requiresBlanks:learn||session.reviewMode==='blank',entryStatus:pr(session.ids[session.idx]).status,
 answerConfirmed:false,answerSeen:false,typed:'',free:'',blank:[],revealed:false,checked:false,hint:false,repeat:0,blankPassed:false});
}
function sessionCopies(){return session.copyTarget??10}
function adaptiveReady(){return (!session.requiresBlanks||session.blankPassed)&&(!session.copyTarget||session.repeat>=session.copyTarget)}
function sessionSteps(){
 const names={1:`따라 쓰기 ${sessionCopies()}회`,2:'핵심 빈칸',3:session.mode==='learn'?'백지서술 연습':'백지서술'};
 return `<div class="tiny muted" style="margin-bottom:12px">${session.mode==='learn'?'신규 학습':'독립 복습 · '+pillStatus(session.entryStatus)}</div><div class="stepbar">${session.stages.map(i=>`<span class="step ${i===session.stage?'active':i<session.stage?'done':''}">${names[i]}</span>`).join('')}</div>`;
}
function finishSessionCard(){
 session.idx++;
 if(session.idx>=session.ids.length){const n=session.ids.length,learn=session.mode==='learn';session=null;view=learn?'today':'review';render();alert(`${n}개 문제의 ${learn?'신규 학습':'선택한 모드 복습'}을 완료했습니다.`)}
 else{prepareSessionCard();renderSession()}
}
function completeLearning(){return withStudyInputCommit(()=>{
 if(session?.mode!=='learn'||session.stage!==3)return;
 if(!adaptiveReady()||!session.free.trim()){alert('따라 쓰기 10회, 핵심 빈칸, 백지서술 연습을 모두 완료해 주세요.');return}
 today=nowLocal();const before=structuredClone(data),c=activeCard(),p=pr(c.id),wasNew=isNewConcept(c),pending=p.status==='new'||p.status==='unrated';
 data.progress[c.id]={...p,status:pending?'unrated':p.status,learningCompleted:true,
 due:pending?plusDays(today,1):p.due,last:today,first:p.first||today,count:(p.count||0)+1,reviewCount:p.reviewCount||0,updatedAt:new Date().toISOString(),
 ...(pending?{assessmentOrigin:'pending-review',learnedAt:today}:{})};
 data.dailyCompletions??={};if(wasNew)data.dailyCompletions[today]=uniq([...(data.dailyCompletions[today]||[]),c.id]);if(!save()){data=before;return}finishSessionCard();
})}
function reviewInterval(status,p,date){
 const base={master:4,weak:2,unknown:1}[status]||1;
 const streak=status==='master'?(p.status==='master'&&p.reviewStreak>0&&p.lastAssessedAt!==date?p.reviewStreak+1:p.lastAssessedAt===date?(p.reviewStreak||1):1):0;
 return {days:status==='master'?Math.min(16,4*streak):base,streak};
}
function saveReviewResult(status,graded){
 if(!session||session.mode==='learn')return;
 today=nowLocal();const before=structuredClone(data),c=activeCard(),p=pr(c.id),id=session.id+':'+session.idx;
 data.reviewHistory??=[];if(data.reviewHistory.some(e=>e.id===id))return;
 const r=reviewRecord(c.id),at=new Date().toISOString(),newConcept=isNewConcept(c);
 const plan=graded?reviewInterval(status,p,today):{days:p.reviewInterval||({master:4,weak:2,unknown:1}[p.status]||1),streak:p.reviewStreak||0};
 const nextDue=plusDays(today,plan.days);
 data.reviewHistory.push({id,cardId:c.id,date:today,at,mode:session.reviewMode,status,nextDue,intervalDays:plan.days,graded,answerViewed:session.answerSeen});
 data.reviewDays??={};data.reviewDays[today]??={};
 data.reviewDays[today][c.id]={...r,completed:true,attempts:(r.attempts||0)+1,modes:uniq([...(r.modes||[]),session.reviewMode]),pending:false};
 data.progress[c.id]={...p,status,learningCompleted:!newConcept,last:today,lastReviewedAt:today,due:nextDue,updatedAt:at,
 count:(p.count||0)+1,reviewCount:(p.reviewCount||0)+(r.completed?0:1),reviewInterval:plan.days,reviewStreak:plan.streak,
 ...(graded?{assessmentOrigin:'review',lastAssessedAt:today,firstAssessedAt:p.firstAssessedAt||(p.status==='unrated'?today:undefined)}:{})};
 if(!save()){data=before;return}finishSessionCard();
}
function completeModeReview(){return withStudyInputCommit(()=>{
 if(!session||session.mode==='learn'||session.reviewMode==='free')return;
 if(!adaptiveReady()){alert('선택한 방식의 완료 조건을 먼저 충족해 주세요.');return}
 saveReviewResult(pr(activeCard().id).status,false);
})}
function showReviewAnswer(){return withStudyInputCommit(()=>{
 if(session?.mode==='learn'||session?.reviewMode!=='blank')return;
 session.answerSeen=true;const box=document.getElementById('review-answer');if(box){box.hidden=false;box.textContent=activeCard().answer}
})}
function reviewCandidates(setup=reviewSetup){
 const selected=new Set(setup.grades),weight={unknown:0,weak:1,master:2,unrated:3,new:4};
 let list=data.cards.filter(c=>selected.has(pr(c.id).status));
 if(setup.target==='due')list=list.filter(c=>prevDayDue(c)&&!reviewRecord(c.id).completed);
 if(setup.shuffle){for(let i=list.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[list[i],list[j]]=[list[j],list[i]]}}
 if(setup.target==='priority')list.sort((a,b)=>(weight[pr(a.id).status]??5)-(weight[pr(b.id).status]??5));
 return list;
}
function reviewFormSetup(){
 const form=document.getElementById('review-form');if(!form)return reviewSetup;
 const f=new FormData(form);return {mode:f.get('mode'),target:f.get('target'),limit:f.get('limit'),grades:f.getAll('grades'),shuffle:f.has('shuffle')};
}
function updateReviewPreview(){
 const setup=reviewFormSetup(),list=reviewCandidates(setup),select=document.querySelector('#review-form [name=limit]');
 const selected=setup.limit;select.innerHTML=Array.from({length:Math.max(1,Math.ceil(list.length/10))},(_,i)=>`<option value="${(i+1)*10}">${(i+1)*10}개</option>`).join('')+'<option value="all">전체</option>';
 select.value=[...select.options].some(o=>o.value===selected)?selected:'all';setup.limit=select.value;reviewSetup=setup;
 document.getElementById('review-preview').textContent=`대상 ${list.length}개 · 이번 회차 ${setup.limit==='all'?list.length:Math.min(Number(setup.limit),list.length)}개`;
 document.getElementById('review-start').disabled=!list.length;
}
function startConfiguredReview(){return withStudyInputCommit(()=>{
 today=nowLocal();reviewSetup=reviewFormSetup();const list=reviewCandidates();
 const count=reviewSetup.limit==='all'?list.length:Number(reviewSetup.limit);if(!list.length||!count)return;
 data.settings??={};data.settings.reviewSetup=structuredClone(reviewSetup);save();
 startSession(list.slice(0,count),'review','review',reviewSetup.mode);
})}
function reviewBuilderHtml(){
 const s=reviewSetup,gradeLabels={unknown:'부족한 것',weak:'더 공부할 것',master:'완벽하게 외운 것',unrated:'평가 대기',new:'미학습'};
 return `<form id="review-form" class="surface wide formgrid" onchange="updateReviewPreview()" onsubmit="event.preventDefault();startConfiguredReview()"><div class="field"><label>복습 방식</label><select name="mode">${[['copy','3회 따라 쓰기'],['blank','핵심 빈칸'],['free','백지서술']].map(([v,l])=>`<option value="${v}" ${s.mode===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>문제 대상</label><select name="target">${[['priority','부족한 문제 우선'],['due','오늘 복습 예정'],['all','전체 문제']].map(([v,l])=>`<option value="${v}" ${s.target===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>문제 수</label><select name="limit">${Array.from({length:Math.max(1,Math.ceil(data.cards.length/10))},(_,i)=>`<option value="${(i+1)*10}" ${String((i+1)*10)===s.limit?'selected':''}>${(i+1)*10}개</option>`).join('')}<option value="all" ${s.limit==='all'?'selected':''}>전체</option></select></div><div class="field"><label><input type="checkbox" name="shuffle" ${s.shuffle?'checked':''}> 무작위 순서</label></div><fieldset class="field full" style="border:0;padding:0"><legend>포함할 등급 (여러 개 선택 가능)</legend><div class="btnrow">${Object.entries(gradeLabels).map(([v,l])=>`<label class="chip"><input type="checkbox" name="grades" value="${v}" ${s.grades.includes(v)?'checked':''}> ${l}</label>`).join('')}</div></fieldset><p class="hint field full">선택한 한 가지 방식만 끝내면 복습 완료입니다. 부족 우선은 부족한 것 → 더 공부할 것 → 완벽하게 외운 것 순서이며, 평가 대기와 미학습은 그 뒤에 포함합니다. 모든 등급을 언제든 임의 복습할 수 있습니다.</p><div class="flex field full"><span id="review-preview" role="status"></span><button id="review-start" class="btn primary" type="submit">선택한 방식으로 복습 시작</button></div></form>`;
}
function reviewHistoryHtml(){
 const list=(data.reviewHistory||[]).slice().sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,30);
 return `<div class="sectionhead"><h2>최근 문제별 복습 이력</h2></div><div class="surface wide">${list.map(e=>{const c=data.cards.find(c=>c.id===e.cardId);return `<div class="item"><div><h3>${safe(c?.q||e.cardId)}</h3><div class="meta">${safe(e.date)} · ${safe({copy:'따라 쓰기',blank:'핵심 빈칸',free:'백지서술'}[e.mode]||e.mode)} · ${pillStatus(e.status)} · 다음 ${safe(e.nextDue||'미정')}</div></div></div>`}).join('')||'<p class="hint">이전 백업의 누적 복습 기록은 유지합니다. 이 버전부터 문제별 상세 이력을 추가로 기록합니다.</p>'}</div>`;
}
