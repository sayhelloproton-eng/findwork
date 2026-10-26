/* Pure shared semantics: business completion date, not download completion date. */
var BossGreetState=(()=>{
 const localDay=stamp=>{const n=typeof stamp==='number'?stamp:Date.parse(stamp);return Number.isFinite(n)?new Date(n+8*3600000).toISOString().slice(0,10):null;};
 const completedDay=r=>localDay(r.recordFinishedAt)||localDay(r.at);
 const isUnknown=r=>r?.status==='UNKNOWN'||r?.sideEffectState==='UNKNOWN'||r?.failure?.kind==='UNKNOWN';
 const resumePending=r=>['PENDING','REVIEW_REQUIRED'].includes(r?.resumeTask?.status);
 const classify=record=>record?.sideEffectState==='UNKNOWN'||record?.error||record?.httpStatus!==200||!Number.isInteger(record?.response?.code)?'UNKNOWN':record.response.code===0&&record.result==='SUCCESS'?'SUCCESS':record.response.code!==0&&record.result==='FAILED'?'FAILED':'UNKNOWN';
 const successToday=(s,now=Date.now())=>Object.values({...s.archivedResults,...s.results}).filter(r=>r.status==='SUCCESS'&&!isUnknown(r)&&r.download?.status==='COMPLETE'&&completedDay(r)===localDay(now)).length;
 const cleanupPlan=(s,now=Date.now())=>{
  const today=localDay(now),entries=Object.entries(s.results||{});
  const older=entries.filter(([,r])=>completedDay(r)&&completedDay(r)<today).map(([id])=>id);
  const platformLimit=entries.some(([,r])=>r.status==='FAILED'&&r.download?.status==='COMPLETE'&&r.failure?.kind==='DAILY_LIMIT'&&completedDay(r)===today);
  const dailyFinished=successToday(s,now)>=150||platformLimit;
  const ids=dailyFinished?entries.map(([id])=>id):older;
  const settled=entries.every(([,r])=>['SUCCESS','FAILED'].includes(r.status)&&!isUnknown(r)&&!resumePending(r)&&r.download?.status==='COMPLETE');
  const unresolved=Object.values({...s.archivedResults,...s.results}).some(isUnknown);
  const securityStop=['SECURITY','UNKNOWN'].includes(s.paused?.kind)||/^(?:SECURITY_|RESUME_(?:SECURITY|UNKNOWN)_)/.test(s.paused?.reason||'');
  return{visible:entries.length>0&&(dailyFinished||older.length>0),allowed:ids.length>0&&!s.active&&!(s.queue||[]).length&&settled&&!securityStop&&!unresolved,ids,olderOnly:!dailyFinished,platformLimit};
 };
 const capabilities=['greet-enqueue','queue-observation','pre-send-check','manual-retry','clear-completed','resume-delivery-opt-in','detail-collection-launch','detail-collection-launch-v2'];
 return{localDay,completedDay,isUnknown,resumePending,classify,successToday,cleanupPlan,protocolVersion:2,capabilities};
})();
