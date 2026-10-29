// Calendar-date arithmetic stays independent of host timezone and DST changes.
const STUDY_EXAM_DATE='2026-11-07';
const NEW_LEARNING_DEADLINE='2026-11-03';
function examCalendarDay(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('올바른 날짜를 선택해 주세요.');
 const time=Date.parse(date+'T00:00:00Z');
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==date)throw new Error('올바른 날짜를 선택해 주세요.');
 return time/86400000;
}
function examPlan(date=today){
 const day=examCalendarDay(date),deadlineDay=examCalendarDay(NEW_LEARNING_DEADLINE);
 const daysToExam=examCalendarDay(STUDY_EXAM_DATE)-day;
 const daysLeft=Math.max(0,deadlineDay-day+1);
 const cards=Array.isArray(data.cards)?data.cards:[];
 const remaining=cards.filter(card=>typeof isNewConcept==='function'?isNewConcept(card):
  (typeof pr==='function'?pr(card.id).status:(data.progress?.[card.id]?.status||'new'))==='new').length;
 const completed=new Set(Array.isArray(data.dailyCompletions?.[date])?data.dailyCompletions[date]:[]).size;
 // A newly completed concept moves from remaining to completed, keeping today's
 // numerator (and recommendation) stable without rewriting any historical data.
 const recommended=daysLeft?Math.ceil((remaining+completed)/daysLeft):0;
 const override=data.settings?.newGoals?.[date];
 const manual=Number.isSafeInteger(override)&&override>=0;
 const goal=daysLeft?(manual?override:recommended):0;
 const reviewFocus=date>'2026-11-03'&&date<STUDY_EXAM_DATE;
 return {
  date,examDate:STUDY_EXAM_DATE,deadline:NEW_LEARNING_DEADLINE,
  daysLeft,daysToExam,dDayLabel:daysToExam>0?'D-'+daysToExam:daysToExam===0?'D-day':'D+'+Math.abs(daysToExam),
  remaining,completed,recommended,goal,remainingGoal:Math.max(0,goal-completed),
  percent:goal?Math.min(100,Math.round(completed/goal*100)):0,
  reviewFocus,examDay:daysToExam===0,afterExam:daysToExam<0,
  manual:manual&&daysLeft>0,learningWindowOpen:daysLeft>0
 };
}
function setNewGoal(value,date=today){
 const plan=examPlan(date);
 if(!plan.learningWindowOpen){
  if(typeof alert==='function')alert('11월 4일부터 신규 목표는 0개입니다. 문제은행에서 개별 신규 학습은 계속할 수 있습니다.');
  return false;
 }
 const automatic=value==='auto'||value==='';
 const target=Number(value);
 if(!automatic&&(!Number.isSafeInteger(target)||target<0)){
  if(typeof alert==='function')alert('하루 목표는 0 이상의 정수로 입력해 주세요.');
  return false;
 }
 data.settings??={};data.settings.newGoals??={};
 if(automatic)delete data.settings.newGoals[date];
 else data.settings.newGoals[date]=target;
 if(typeof save==='function')save();
 if(typeof render==='function')render();
 return true;
}
function planningControlsHtml(date=today){
 const p=examPlan(date);
 const message=p.reviewFocus?'11월 4~6일은 전체 복습에 집중합니다. 문제은행에서 필요한 개념은 개별 신규 학습할 수 있습니다.':
  p.learningWindowOpen?`11월 3일까지 남은 ${p.remaining}개념을 ${p.daysLeft}일 동안 학습하도록 하루 ${p.recommended}개를 권장합니다.`:
  '문제은행에서 필요한 개념을 골라 학습하고 전체 복습을 이어가세요.';
 return `<section class="surface wide" style="margin-bottom:24px" aria-labelledby="new-goal-heading"><div class="flex"><h2 id="new-goal-heading" style="margin:0;font-size:18px">신규 학습 목표</h2><span class="chip">시험 ${p.dDayLabel} · 11월 7일</span></div><p class="hint">${message}</p><div class="btnrow"><label class="tiny" for="new-goal-input">${date===today?'오늘':date} 목표 <input id="new-goal-input" type="number" min="0" step="1" inputmode="numeric" value="${p.goal}" style="width:95px;margin-left:8px" onkeydown="if(event.key==='Enter'){event.preventDefault();document.getElementById('new-goal-apply').click()}" ${p.learningWindowOpen?'':'disabled'}></label><button id="new-goal-apply" class="btn primary" onclick="setNewGoal(document.getElementById('new-goal-input').value,'${date}')" ${p.learningWindowOpen?'':'disabled'}>목표 적용</button><button class="btn" onclick="setNewGoal('auto','${date}')" ${p.learningWindowOpen?'':'disabled'}>권장 목표 사용</button><span class="tiny muted">${p.manual?'직접 설정한 목표':'자동 권장 목표'}</span></div></section>`;
}
