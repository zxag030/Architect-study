// Additive v2-compatible normalization and non-destructive cross-device merging.
// No browser storage is read or written here; callers save a pre-import snapshot.
(function(global){
 'use strict';
 const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
 const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const clone=value=>JSON.parse(JSON.stringify(value));
 const put=(object,key,value)=>Object.defineProperty(object,key,{value,enumerable:true,writable:true,configurable:true});
 function stable(value){
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
  return JSON.stringify(value);
 }
 const same=(a,b)=>stable(a)===stable(b);
 const compare=(a,b)=>a===b?0:a<b?-1:1;
 const pointer=key=>String(key).replaceAll('~','~0').replaceAll('/','~1');
 function mapOrEmpty(value,name){
  if(value==null)return {};
  if(!plain(value))throw new Error(name+'은 객체여야 합니다.');
  return value;
 }
 function timestamp(record){
  if(!plain(record))return -Infinity;
  let result=-Infinity;
  for(const key of ['updatedAt','lastAssessedAt','lastReviewedAt','lastReviewAt','last','learnedAt','at']){
   const value=record[key];
   if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))continue;
   const parsed=Date.parse(value);if(Number.isFinite(parsed))result=Math.max(result,parsed);
  }
  return result;
 }
 function newest(left,right){return timestamp(right)>timestamp(left)?right:left}
 function conflictContext(existing=[]){
  const conflicts=[];
  function signature(entry){return stable({path:entry.path,values:entry.values})}
  function append(entry){
   const copy=clone(entry),key=signature(copy);
   if(!conflicts.some(item=>signature(item)===key))conflicts.push(copy);
  }
  for(const entry of existing)append(entry);
  function archived(path,value){return conflicts.some(entry=>entry.path===path&&entry.values.some(item=>same(item,value)))}
  function preserve(path,left,right,result,reason='different-values'){
   if(same(left,right))return;
   // If the active result already contains one exact variant, only the other
   // needs archival. This keeps repeated merging of the same backup idempotent.
   if((same(left,result)||archived(path,left))&&(same(right,result)||archived(path,right)))return;
   const values=[clone(left),clone(right)].sort((a,b)=>compare(stable(a),stable(b)));
   append({path,reason,values});
  }
  return {conflicts,preserve};
 }
 function combineObject(left,right,path,context){
  const out=clone(left);
  for(const key of Object.keys(right)){
   const target=path+'/'+pointer(key);
   if(!own(left,key)){put(out,key,clone(right[key]));continue}
   if(same(left[key],right[key]))continue;
   if(plain(left[key])&&plain(right[key]))put(out,key,combineObject(left[key],right[key],target,context));
   else context.preserve(target,left[key],right[key],out[key]);
  }
  return out;
 }
 function combineRecord(left,right,path,context,kind){
  const winner=newest(left,right),other=winner===left?right:left;
  const out={...clone(other),...clone(winner)};
  const counters=kind==='progress'?['count','reviewCount']:['attempts','retries','count','reviewCount'];
  for(const key of counters){
   const values=[left[key],right[key]].filter(value=>typeof value==='number'&&Number.isFinite(value));
   if(values.length)put(out,key,Math.max(...values));
  }
  if(kind==='progress'){
   const learned=record=>record.learningCompleted===true||(!own(record,'learningCompleted')&&typeof record.status==='string'&&record.status!=='new');
   // Completion is monotonic. A later review-only result must not erase earlier
   // full learning, including legacy records whose non-new status meant learned.
   if((own(left,'learningCompleted')||own(right,'learningCompleted'))&&(learned(left)||learned(right)))out.learningCompleted=true;
   const dates=[left.first,right.first].filter(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
   if(dates.length)out.first=dates[0];
  }else{
   if(left.completed||right.completed)out.completed=true;
   if(Array.isArray(left.modes)&&Array.isArray(right.modes))out.modes=[...new Set([...left.modes,...right.modes])];
  }
  // Keep future nested metadata from both devices. Conflicting leaves retain
  // the winning record's version; exact original records remain recoverable.
  for(const key of Object.keys(other)){
   if(plain(winner[key])&&plain(other[key]))put(out,key,combineObject(winner[key],other[key],path+'/'+pointer(key),context));
  }
  context.preserve(path,left,right,out,'record-conflict');
  return out;
 }
 function combineHistory(left,right,context){
  const events=new Map();
  for(const event of [...left,...right]){
   if(!events.has(event.id)){events.set(event.id,clone(event));continue}
   const previous=events.get(event.id),selected=newest(previous,event);
   context.preserve('/reviewHistory/'+pointer(event.id),previous,event,selected,'event-id-conflict');
   events.set(event.id,clone(selected));
  }
  return [...events.values()].sort((a,b)=>compare(String(a.date||''),String(b.date||''))||compare(String(a.at||''),String(b.at||''))||compare(a.id,b.id));
 }
 function reconcileHistory(out,context){
  const grouped=new Map(),byCard=new Map();
  for(const event of out.reviewHistory){
   const key=stable([event.date,event.cardId]);
   if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(event);
   if(!byCard.has(event.cardId))byCard.set(event.cardId,[]);byCard.get(event.cardId).push(event);
  }
  for(const events of grouped.values()){
   const {date,cardId}=events[0];
   if(!own(out.reviewDays,date))put(out.reviewDays,date,{});
   const existed=own(out.reviewDays[date],cardId),row=existed?out.reviewDays[date][cardId]:{},before=clone(row);
   row.completed=true;
   row.attempts=Math.max(typeof row.attempts==='number'?row.attempts:0,events.length);
   const modes=[...new Set(events.map(event=>event.mode))];
   if(!own(row,'modes')||Array.isArray(row.modes))row.modes=[...new Set([...(row.modes||[]),...modes])];
   else if(plain(row.modes))for(const mode of modes)put(row.modes,mode,true);
   put(out.reviewDays[date],cardId,row);
   if(existed)context.preserve('/reviewDays/'+pointer(date)+'/'+pointer(cardId),before,row,row,'history-lower-bound');
  }
  for(const [id,events] of byCard){
   if(!own(out.progress,id))continue;
   const progress=out.progress[id],before=clone(progress);
   progress.count=Math.max(typeof progress.count==='number'?progress.count:0,events.length);
   progress.reviewCount=Math.max(typeof progress.reviewCount==='number'?progress.reviewCount:0,new Set(events.map(event=>event.date)).size);
   context.preserve('/progress/'+pointer(id),before,progress,progress,'history-lower-bound');
  }
  return out;
 }
 function normalizeStudyData(input){
  if(!plain(input)||!Array.isArray(input.cards))throw new Error('올바른 문제·진도 백업이 아닙니다.');
  // Validate the entire file before cloning or constructing any normalized state.
  const ids=new Set();
  for(const card of input.cards){
   if(!plain(card)||typeof card.id!=='string'||!card.id||typeof card.q!=='string'||!card.q||typeof card.answer!=='string'||!card.answer||!Array.isArray(card.blanks)||!card.blanks.every(key=>typeof key==='string'))throw new Error('백업에 올바르지 않은 개념 카드가 있습니다.');
   if(ids.has(card.id))throw new Error('백업에 중복된 개념 ID가 있습니다: '+card.id);
   ids.add(card.id);
  }
  for(const key of ['progress','dailyCompletions','reviewDays','settings'])mapOrEmpty(input[key],key);
  for(const [id,record] of Object.entries(input.progress||{}))if(!plain(record))throw new Error('잘못된 progress 기록: '+id);
  for(const [date,list] of Object.entries(input.dailyCompletions||{}))if(!Array.isArray(list)||!list.every(id=>typeof id==='string'))throw new Error('잘못된 날짜별 완료 기록: '+date);
  for(const [date,records] of Object.entries(input.reviewDays||{})){
   if(!plain(records)||!Object.values(records).every(plain))throw new Error('잘못된 복습 일지: '+date);
  }
  if(input.reviewHistory!=null&&(!Array.isArray(input.reviewHistory)||!input.reviewHistory.every(event=>plain(event)&&typeof event.id==='string'&&event.id&&typeof event.cardId==='string'&&event.cardId&&typeof event.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(event.date)&&typeof event.mode==='string'&&event.mode)))throw new Error('잘못된 문제별 복습 이력입니다.');
  if(input.backupConflicts!=null&&(!Array.isArray(input.backupConflicts)||!input.backupConflicts.every(entry=>plain(entry)&&typeof entry.path==='string'&&Array.isArray(entry.values))))throw new Error('잘못된 백업 충돌 보관 기록입니다.');
  if(input.reviewSession!=null&&!plain(input.reviewSession))throw new Error('잘못된 복습 세션입니다.');
  if(input.reviewSessionArchive!=null&&(!Array.isArray(input.reviewSessionArchive)||!input.reviewSessionArchive.every(plain)))throw new Error('잘못된 복습 세션 원본 보관 목록입니다.');
  const out=clone(input);
  for(const key of ['progress','dailyCompletions','reviewDays','settings'])put(out,key,clone(mapOrEmpty(input[key],key)));
  for(const date of Object.keys(out.dailyCompletions))put(out.dailyCompletions,date,[...new Set(out.dailyCompletions[date])]);
  const context=conflictContext(input.backupConflicts||[]);
  out.reviewHistory=combineHistory(input.reviewHistory||[],[],context);
  out.backupConflicts=context.conflicts;
  if(!own(out,'version'))out.version=2;
  return out;
 }
 function mergeStudyData(local,incoming){
  const left=normalizeStudyData(local),right=normalizeStudyData(incoming);
  const context=conflictContext([...left.backupConflicts,...right.backupConflicts]);
  const special=new Set(['cards','progress','dailyCompletions','reviewDays','reviewHistory','backupConflicts','reviewSession','reviewSessionArchive']);
  const out=clone(left);
  // Merge unknown/additive top-level data too; never discard a future field.
  for(const key of Object.keys(right)){
   if(special.has(key))continue;
   if(!own(left,key)){put(out,key,clone(right[key]));continue}
   if(same(left[key],right[key]))continue;
   if(plain(left[key])&&plain(right[key]))put(out,key,combineObject(left[key],right[key],'/'+pointer(key),context));
   else context.preserve('/'+pointer(key),left[key],right[key],out[key]);
  }
  const cards=new Map(left.cards.map(card=>[card.id,clone(card)]));
  for(const card of right.cards){
   if(!cards.has(card.id)){cards.set(card.id,clone(card));continue}
   const previous=cards.get(card.id),winner=newest(previous,card),other=winner===previous?card:previous;
   const combined={...clone(other),...clone(winner)};
   context.preserve('/cards/'+pointer(card.id),previous,card,combined,'card-conflict');cards.set(card.id,combined);
  }
  out.cards=[...cards.values()];
  out.progress=clone(left.progress);
  for(const id of Object.keys(right.progress))put(out.progress,id,own(left.progress,id)?combineRecord(left.progress[id],right.progress[id],'/progress/'+pointer(id),context,'progress'):clone(right.progress[id]));
  out.dailyCompletions=clone(left.dailyCompletions);
  for(const date of Object.keys(right.dailyCompletions))put(out.dailyCompletions,date,[...new Set([...(left.dailyCompletions[date]||[]),...right.dailyCompletions[date]])]);
  out.reviewDays=clone(left.reviewDays);
  for(const date of Object.keys(right.reviewDays)){
   const previous=left.reviewDays[date]||{},next=clone(previous);
   for(const id of Object.keys(right.reviewDays[date]))put(next,id,own(previous,id)?combineRecord(previous[id],right.reviewDays[date][id],'/reviewDays/'+pointer(date)+'/'+pointer(id),context,'review'):clone(right.reviewDays[date][id]));
   put(out.reviewDays,date,next);
  }
  out.reviewHistory=combineHistory(left.reviewHistory,right.reviewHistory,context);
  // A draft is one transaction: combining its individual fields could pair one
  // device's question order with the other device's answers. Keep whole variants
  // and let the importing UI explicitly choose which conflicting session resumes.
  const archives=[];
  function archive(value){if(plain(value)&&!archives.some(item=>same(item,value)))archives.push(clone(value))}
  for(const value of [...(left.reviewSessionArchive||[]),...(right.reviewSessionArchive||[])])archive(value);
  const current=left.reviewSession,incomingSession=right.reviewSession;
  if(current&&incomingSession&&!same(current,incomingSession)){
   out.reviewSession=clone(current);archive(current);archive(incomingSession);
   context.preserve('/reviewSession',current,incomingSession,current,'review-session-conflict');
  }else if(!current&&incomingSession)out.reviewSession=clone(incomingSession);
  // A legacy backup without a session cannot erase the current draft.
  if(archives.length||own(left,'reviewSessionArchive')||own(right,'reviewSessionArchive'))out.reviewSessionArchive=archives;
  out.backupConflicts=context.conflicts;
  return reconcileHistory(out,context);
 }
 global.normalizeStudyData=normalizeStudyData;
 global.mergeStudyData=mergeStudyData;
})(globalThis);
