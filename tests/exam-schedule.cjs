const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({
 data:{cards:Array.from({length:100},(_,i)=>({id:'q'+i})),progress:{},dailyCompletions:{},settings:{reviewDaily:20}},
 today:'2026-10-29',saveCalls:0,renderCalls:0,alerts:[],
 save(){context.saveCalls++},render(){context.renderCalls++},alert(message){context.alerts.push(message)}
});
vm.runInContext("function pr(id){return data.progress[id]||{status:'new'}}",context);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../exam-schedule.js'),'utf8'),context);
const plan=date=>JSON.parse(JSON.stringify(context.examPlan(date)));
assert.deepEqual(Object.fromEntries(['daysLeft','daysToExam','remaining','recommended','goal','completed','percent','reviewFocus'].map(k=>[k,plan('2026-10-29')[k]])),
 {daysLeft:6,daysToExam:9,remaining:100,recommended:17,goal:17,completed:0,percent:0,reviewFocus:false});
const initial=JSON.stringify(context.data);
plan('2026-10-29');assert.equal(JSON.stringify(context.data),initial,'planning is read only');
context.data.progress.q0={status:'unrated',learningCompleted:true};context.data.dailyCompletions['2026-10-29']=['q0','q0'];
assert.equal(plan('2026-10-29').recommended,17);assert.equal(plan('2026-10-29').remainingGoal,16);assert.equal(plan('2026-10-29').percent,6);
assert.equal(context.setNewGoal('23'),true);assert.equal(plan('2026-10-29').goal,23);assert.equal(plan('2026-10-29').manual,true);
assert.equal(context.data.settings.reviewDaily,20,'unrelated settings preserved');
assert.equal(context.setNewGoal('-1'),false);assert.equal(context.setNewGoal('2.5'),false);assert.equal(context.setNewGoal('text'),false);
assert.equal(plan('2026-10-29').goal,23);assert.equal(context.saveCalls,1);
assert.equal(context.setNewGoal('auto'),true);assert.equal(plan('2026-10-29').goal,17);
assert.equal(plan('2026-11-03').daysLeft,1);assert.equal(plan('2026-11-03').goal,99);
context.data.settings.newGoals['2026-11-04']=999;
for(const date of ['2026-11-04','2026-11-05','2026-11-06']){
 const p=plan(date);assert.equal(p.goal,0);assert.equal(p.percent,0);assert.equal(p.reviewFocus,true);assert.equal(p.learningWindowOpen,false);
 assert.equal(context.setNewGoal('10',date),false);
}
assert.equal(context.data.settings.newGoals['2026-11-04'],999,'even a forced inactive override is preserved, not deleted');
assert.equal(plan('2026-11-07').reviewFocus,false);assert.equal(plan('2026-11-07').goal,0);assert.equal(plan('2026-11-07').examDay,true);assert.equal(plan('2026-11-07').dDayLabel,'D-day');
assert.equal(plan('2026-11-08').afterExam,true);assert.equal(plan('2026-11-08').dDayLabel,'D+1');
// A reviewed unlearned card remains a new-learning workload; legacy non-new records stay learned.
context.isNewConcept=card=>context.data.progress[card.id]?.learningCompleted===false||(context.data.progress[card.id]?.status||'new')==='new';
context.data.progress.q1={status:'master',learningCompleted:false};assert.equal(plan('2026-10-29').remaining,99);
context.data.progress.q2={status:'master'};assert.equal(plan('2026-10-29').remaining,98);
// No denominator-zero or NaN on deadline, all-complete, or empty repository.
context.data.cards=[];context.data.dailyCompletions={};
assert.equal(plan('2026-11-03').goal,0);assert.equal(plan('2026-11-03').percent,0);
assert.equal(context.setNewGoal('0'),true);assert.equal(plan('2026-10-29').goal,0);
assert.match(context.planningControlsHtml('2026-11-04'),/전체 복습/);assert.match(context.planningControlsHtml('2026-11-04'),/개별 신규 학습/);
assert.match(context.planningControlsHtml('2026-11-04'),/disabled/);
assert.match(context.planningControlsHtml('2026-10-29'),/id="new-goal-apply"/);
assert.doesNotMatch(context.planningControlsHtml('2026-10-29'),/onchange=/);
assert.throws(()=>context.examPlan('2026-02-30'),/날짜/);
assert.equal(plan('2026-03-08').daysLeft,241,'calendar day counts unaffected by DST');
console.log('Exam scheduling: inclusive deadline, stable completion target, manual overrides, review-only dates, D-day, separate new-learning flag and old data preservation passed');
