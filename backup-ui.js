// Imports are previews until the user applies them. PDF bytes never enter here.
let pendingBackupMerge=null;
function backupStable(value){
 if(Array.isArray(value))return '['+value.map(backupStable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+backupStable(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
function backupControlsHtml(){
 return `<p class="hint">문제·진도·날짜별 완료·복습 이력·이어할 복습을 포함합니다. 가져오기와 기록 병합 모두 기존 기록을 보존하며, 적용 전에 충돌 내용을 보여줍니다. PDF는 포함하지 않습니다.</p><div class="btnrow"><button class="btn primary" onclick="exportJSON()">진도·문제은행 백업</button><label class="btn" style="cursor:pointer">백업 가져오기<input id="backup-import-file" type="file" accept="application/json,.json" style="display:none" onchange="importJSON(this.files[0],'restore');this.value=''"></label><label class="btn" style="cursor:pointer">기록 병합<input id="backup-merge-file" type="file" accept="application/json,.json" style="display:none" onchange="importJSON(this.files[0],'merge');this.value=''"></label><button id="backup-current-original" class="btn" onclick="exportJSON()">병합 전 현재 원본 백업</button><button class="btn" onclick="downloadBeforeImport()">가져오기 전 사본 저장</button><button id="backup-show-conflicts" class="btn" onclick="openBackupConflicts()">보존된 충돌 확인 · ${data.backupConflicts?.length||0}건</button><button class="btn" onclick="exportCSV()">문제은행 CSV 내보내기</button></div>`;
}
function backupMakePreview(incoming,intent){
 const left=normalizeStudyData(data),merged=mergeStudyData(left,incoming);
 const localSession=left.reviewSession||null,incomingSession=incoming.reviewSession||null;
 return {left,incoming,merged,intent,before:JSON.stringify(data),storedBefore:localStorage.getItem(STORE_KEY),
  localSession,incomingSession,sessionChoice:null,
  requiresSessionChoice:!!incomingSession&&backupStable(localSession)!==backupStable(incomingSession)};
}
async function importBackupJSON(file,intent='restore'){
 if(!file)return;
 let incoming;
 try{incoming=normalizeStudyData(JSON.parse(await file.text()))}
 catch(error){alert('가져오기 실패: '+error.message+' 기존 데이터는 유지됩니다.');return}
 return withStudyInputCommit(()=>{
  try{
   if(typeof suspendReviewSession==='function'&&suspendReviewSession()===false)return;
   pendingBackupMerge=backupMakePreview(incoming,intent==='merge'?'merge':'restore');
   // Pausing the runtime editor prevents its debounce timer from changing the
   // draft timestamp under a read-only preview. The saved draft is untouched.
   if(session?.mode==='review'){if(typeof cancelReviewDraftSave==='function')cancelReviewDraftSave();session=null;view='settings'}
   modal={type:'backup'};render();
  }catch(error){alert('가져오기 실패: '+error.message+' 기존 데이터는 유지됩니다.')}
 });
}
function backupSessionSummary(value){
 if(!value)return '<p class="hint">이어할 복습이 없습니다.</p>';
 const ids=Array.isArray(value.ids)?value.ids:[],completed=Array.isArray(value.completedIds)?value.completedIds:[];
 const mode={copy:'3회 따라 쓰기',blank:'핵심 빈칸',free:'백지서술'}[value.reviewMode]||value.reviewMode||'확인 필요';
 return `<p class="hint">${safe(mode)} · ${ids.length}문제 · 완료 ${completed.length}개 · 현재 ${Math.min(ids.length,Math.max(0,Number(value.idx)||0)+1)}번째<br>저장 ${safe(value.savedAt||value.updatedAt||'시각 미상')}<br>세션 ID ${safe(value.id||'없음')}</p>`;
}
function backupPathValue(object,path){
 const tokens=path.split('/').slice(1).map(token=>token.replaceAll('~1','/').replaceAll('~0','~'));
 let value=object;
 if(tokens[0]==='cards'&&tokens.length>1){value=(object.cards||[]).find(card=>card.id===tokens[1]);tokens.splice(0,2)}
 else if(tokens[0]==='reviewHistory'&&tokens.length>1){value=(object.reviewHistory||[]).find(event=>event.id===tokens[1]);tokens.splice(0,2)}
 for(const token of tokens){if(value==null||!Object.prototype.hasOwnProperty.call(value,token))return undefined;value=value[token]}
 return value;
}
function backupFormatValue(value){return value===undefined?'이 백업에는 없습니다.':JSON.stringify(value,null,2)}
function backupConflictDetails(conflicts,preview=null){
 if(!conflicts.length)return '<p class="hint">서로 다른 원본이 발견되지 않았습니다.</p>';
 return conflicts.map((conflict,index)=>{
  const values=preview?[
   {label:'현재 기기 원본',value:backupPathValue(preview.left,conflict.path)},
   {label:'가져온 백업 원본',value:backupPathValue(preview.incoming,conflict.path)},
   {label:'병합 후 사용할 값',value:backupPathValue(preview.merged,conflict.path)}
  ]:(conflict.values||[]).map((value,i)=>({label:'보존 원본 '+(i+1),value}));
  return `<details class="backup-conflict" style="margin:12px 0;border:1px solid var(--line);border-radius:9px;padding:12px"><summary style="overflow-wrap:anywhere">${index+1}. ${safe(conflict.path)} · ${safe(conflict.reason||'서로 다른 값')}</summary>${values.map(item=>`<p class="tiny strong">${safe(item.label)}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.6">${safe(backupFormatValue(item.value))}</pre>`).join('')}${preview?`<details><summary>보존되는 전체 충돌 원본</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px">${safe(JSON.stringify(conflict.values,null,2))}</pre></details>`:''}</details>`;
 }).join('');
}
function backupMergeModalHtml(){
 const p=pendingBackupMerge;if(!p)return '<p class="hint">미리보기를 다시 열어주세요.</p>';
 const existing=new Set(p.left.cards.map(card=>card.id)),added=p.incoming.cards.filter(card=>!existing.has(card.id)).length;
 const todayIds=Object.values(p.merged.dailyCompletions).reduce((n,ids)=>n+ids.length,0);
 const sessionChoice=p.requiresSessionChoice?`<fieldset style="margin:18px 0;border:1px solid var(--line);border-radius:10px;padding:14px"><legend>이어할 복습 선택 (필수)</legend><p class="hint">두 기기의 문제 순서와 입력 초안을 섞거나 자동으로 덮어쓰지 않습니다. 사용할 세션을 직접 고르세요. 양쪽 원본은 별도로 보존됩니다.</p>${[['local','현재 기기의 복습 유지',p.localSession],['incoming','가져온 백업의 복습 사용',p.incomingSession]].map(([value,label,snapshot])=>`<label style="display:block;margin:12px 0"><input type="radio" name="backup-session-choice" value="${value}" ${p.sessionChoice===value?'checked':''} onchange="chooseBackupSession(this.value)"> <strong>${label}</strong></label>${backupSessionSummary(snapshot)}`).join('')}</fieldset>`:'';
 return `<div class="flex"><h2 style="margin:0">${p.intent==='merge'?'기록 병합':'백업 가져오기'} 미리보기</h2><button id="backup-cancel" class="btn" onclick="closeModal()">취소</button></div><p class="hint">아직 기록을 변경하지 않았습니다. 신규 문제 ${added}개 · 병합 후 전체 ${p.merged.cards.length}개 · 날짜별 신규 완료 합계 ${todayIds}건 · 상세 복습 ${p.merged.reviewHistory.length}건.</p><div class="notice">숙지도·복습 예정일은 명시적 기록 시각이 더 최근인 값을 사용하며, 시각이 없거나 같으면 현재 기기 값을 유지합니다. 서로 다른 원본은 삭제하지 않고 백업에 보존합니다. 아래에서 값을 펼쳐 확인하세요.</div>${sessionChoice}<h3>확인할 충돌 · ${p.merged.backupConflicts.length}건</h3><div id="backup-conflict-list">${backupConflictDetails(p.merged.backupConflicts,p)}</div><div class="btnrow" style="margin-top:20px"><button id="backup-download-original" class="btn" onclick="downloadPendingBackupOriginal()">적용 전 현재 원본 백업</button><button id="backup-apply" class="btn primary" onclick="applyBackupMerge()" ${p.requiresSessionChoice&&!p.sessionChoice?'disabled':''}>확인한 내용으로 병합 적용</button></div><p id="backup-merge-status" class="hint" role="status">적용 직전 사본도 이 기기에 저장합니다. 저장 공간이 부족하면 기존 활성 기록을 유지합니다.</p>`;
}
function chooseBackupSession(value){
 if(!pendingBackupMerge||!['local','incoming'].includes(value))return;
 pendingBackupMerge.sessionChoice=value;
 const selected=value==='incoming'?pendingBackupMerge.incomingSession:pendingBackupMerge.localSession;
 pendingBackupMerge.merged.reviewSession=selected?structuredClone(selected):null;
 const conflicts=document.getElementById('backup-conflict-list');if(conflicts)conflicts.innerHTML=backupConflictDetails(pendingBackupMerge.merged.backupConflicts,pendingBackupMerge);
 const button=document.getElementById('backup-apply');if(button)button.disabled=false;
}
function downloadPendingBackupOriginal(){
 if(!pendingBackupMerge)return;
 download('병합_전_현재_원본_'+nowLocal()+'.json',pendingBackupMerge.before,'application/json');
}
function cancelBackupMerge(){pendingBackupMerge=null}
function applyBackupMerge(){return withStudyInputCommit(()=>{
 const p=pendingBackupMerge;if(!p)return false;
 if(typeof reviewStorageWriteAllowed==='function'&&!reviewStorageWriteAllowed(true))return false;
 if(p.requiresSessionChoice&&!p.sessionChoice){alert('이어할 복습 세션을 먼저 선택해 주세요.');return false}
 if(JSON.stringify(data)!==p.before){
  pendingBackupMerge=backupMakePreview(p.incoming,p.intent);render();
  alert('미리보기 이후 현재 기록이 바뀌었습니다. 최신 내용으로 다시 확인해 주세요.');return false;
 }
 if(localStorage.getItem(STORE_KEY)!==p.storedBefore){alert('다른 탭에서 저장 기록이 바뀌었습니다. 현재 원본을 백업한 뒤 새로고침하고 다시 병합해 주세요.');return false}
 try{
  const merged=structuredClone(p.merged);
  if(p.requiresSessionChoice){
   const selected=p.sessionChoice==='incoming'?p.incomingSession:p.localSession;
   merged.reviewSession=selected?structuredClone(selected):null;
   merged.reviewSessionArchive??=[];
   for(const value of [p.localSession,p.incomingSession])if(value&&!merged.reviewSessionArchive.some(item=>backupStable(item)===backupStable(value)))merged.reviewSessionArchive.push(structuredClone(value));
  }
  const serialized=JSON.stringify(merged);
  localStorage.setItem(STORE_KEY+'-before-import',p.before);
  localStorage.setItem(STORE_KEY,serialized);
  if(typeof cancelReviewDraftSave==='function')cancelReviewDraftSave();
  data=merged;session=null;pendingBackupMerge=null;modal=null;loadReviewSetup();render();
  alert('백업 병합 완료 · 보존된 충돌 '+(data.backupConflicts?.length||0)+'건. 원본과 선택하지 않은 복습 초안도 전체 백업에 포함됩니다.');
  return true;
 }catch(error){alert('가져오기 실패: '+error.message+' 기존 데이터는 유지됩니다.');return false}
})}
function openBackupConflicts(){return withStudyInputCommit(()=>{modal={type:'backup-conflicts'};render()})}
function backupConflictsModalHtml(){
 return `<div class="flex"><h2 style="margin:0">보존된 충돌 원본</h2><button class="btn" onclick="closeModal()">닫기</button></div><p class="hint">원본을 비교할 수 있도록 양쪽 기록을 보존합니다. 전체 JSON 백업에도 포함됩니다. 현재 활성 기록은 이 화면에서 바뀌지 않습니다. 보관된 복습 세션 ${data.reviewSessionArchive?.length||0}건.</p><div id="backup-conflict-list">${backupConflictDetails(data.backupConflicts||[])}</div><button class="btn primary" onclick="exportJSON()">충돌 원본을 포함한 전체 백업</button>`;
}
