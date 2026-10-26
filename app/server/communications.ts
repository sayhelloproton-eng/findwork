import {randomUUID,createHash} from 'node:crypto';
import {getJob,queryJobs,checkGreetBeforeSend,getCommunicationQuota} from '../db/ingestion/job-store.ts';

const fail=(s:string):never=>{throw Error(s);};
const shanghaiDay=(value=new Date())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
const page=(input:any={})=>{
 const limit=Number(input.limit??20),offset=Number(input.offset??0);
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0)fail('INVALID_PAGINATION');
 return{limit,offset};
};
export function getCommunicationCandidates(db:any,input:any={}){
 const {limit,offset}=page(input);
 const result=queryJobs(db,{candidates:true,sort:'candidate-education',limit,offset});
 return{items:result.items,total:result.total,limit,offset};
}
export function getTodayCommunications(db:any,input:any={}){
 const {limit,offset}=page(input),day=shanghaiDay();
 const where="communication_state='SUCCEEDED' AND greet_confirmed_at IS NOT NULL AND date(greet_confirmed_at,'+8 hours')=?";
 const total=(db.prepare('SELECT count(*) n FROM jobs WHERE '+where).get(day) as any).n;
 const jobIds=db.prepare('SELECT job_id FROM jobs WHERE '+where+' ORDER BY greet_confirmed_at DESC,job_id ASC LIMIT ? OFFSET ?').all(day,limit,offset) as any[];
 return{items:jobIds.map(row=>getJob(db,row.job_id)),total,limit,offset,date:day};
}
export function reserveCommunicationBatch(db:any,input:any){
 const jobIds=input?.jobIds;
 if(!Array.isArray(jobIds)||!jobIds.length||jobIds.length>150||new Set(jobIds).size!==jobIds.length||
  jobIds.some(x=>typeof x!=='string'||x.length>256||!x.trim()))fail('INVALID_BATCH');
 const day=shanghaiDay();
 db.exec('BEGIN IMMEDIATE');
 try{
  const quota=getCommunicationQuota(db),used=quota.succeeded,reserved=quota.reserved;
  if(used+reserved+jobIds.length>quota.limit)fail('DAILY_COMMUNICATION_LIMIT');
  const recruiters=new Set<string>();
  const jobs=jobIds.map(jobId=>{
   const job=getJob(db,jobId);
   if(!job.eligible)fail('GREET_BLOCKED');
   const recruiterId=job.list?.encryptBossId||
    (db.prepare("SELECT json_extract(detail_json,'$.jobInfo.encryptUserId') id FROM job_details WHERE job_id=?").get(jobId) as any)?.id;
   if(recruiterId){if(recruiters.has(recruiterId))fail('DUPLICATE_RECRUITER_IN_BATCH');recruiters.add(recruiterId);}
   const securityId=job.list?.securityId;
   if(typeof securityId!=='string'||!securityId.trim())fail('GREET_SECURITY_ID_MISSING');
   return{jobId,securityId,actionId:'fw-'+randomUUID()};
  });
  const stamp=new Date().toISOString(),update=db.prepare("UPDATE jobs SET communication_state='IN_FLIGHT',action_id=?,claimed_at=?,updated_at=? WHERE job_id=? AND communication_state='NONE'");
  for(const job of jobs)if(update.run(job.actionId,stamp,stamp,job.jobId).changes!==1)fail('GREET_BLOCKED');
  db.exec('COMMIT');
  return{items:jobs,accepted:jobs.length,day,quota:150,usedBefore:used,reservedBefore:reserved};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function retryCommunication(db:any,input:any){
 if(typeof input?.jobId!=='string'||typeof input?.finishedAt!=='string')fail('INVALID_RETRY');
 const jobId=input.jobId,actionId='fw-retry-'+createHash('sha256').update(jobId+'|'+input.finishedAt).digest('hex');
 db.exec('BEGIN IMMEDIATE');
 try{
  const job=getJob(db,jobId),item={jobId,securityId:job.list?.securityId,actionId};
  if(job.communication_state==='IN_FLIGHT'&&job.action_id===actionId){db.exec('COMMIT');return item;}
  let raw:any;try{raw=JSON.parse(job.greet_raw_json);}catch{fail('RETRY_NOT_ALLOWED');}
  const dialog=raw?.response?.zpData?.bizData?.chatRemindDialog;
  if(job.communication_state!=='FAILED'||raw?.result!=='FAILED'||raw.error||raw.sideEffectState==='UNKNOWN'||
    raw.httpStatus!==200||raw.response?.code!==1||raw.response?.message!=='开聊提醒'||!dialog||dialog.blockLevel!==0||
    raw.finishedAt!==input.finishedAt)fail('RETRY_NOT_ALLOWED');
  if(job.screening_status!=='WORTH'||job.decision_stale||job.facts.closed||job.facts.advanced_degree_excluded||
    job.history_blocked||job.same_recruiter_communicated||job.application_state!=='NONE'||!item.securityId)fail('GREET_BLOCKED');
  const quota=getCommunicationQuota(db);
  if(quota.succeeded>=quota.limit)fail('DAILY_COMMUNICATION_LIMIT');
  const stamp=new Date().toISOString();
  db.prepare('INSERT INTO job_events(job_id,event_type,old_state,new_state,source_hash,occurred_at,event_key) VALUES(?,?,?,?,?,?,?)').run(jobId,'GREET_RETRY_AUTHORIZED','FAILED','IN_FLIGHT',job.greet_source_hash,stamp,'greet-retry:'+actionId);
  db.prepare("UPDATE jobs SET communication_state='IN_FLIGHT',action_id=?,claimed_at=?,greet_started_at=NULL,greet_confirmed_at=NULL,greet_reason=NULL,greet_json=NULL,greet_source=NULL,greet_source_hash=NULL,greet_raw_json=NULL,updated_at=? WHERE job_id=?").run(actionId,stamp,stamp,jobId);
  db.exec('COMMIT');return item;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function checkCommunicationSend(db:any,input:any){
 return checkGreetBeforeSend(db,{jobId:input?.jobId,actionId:input?.actionId});
}
/** CLI-only repair: reconcile reservations proven not to have entered the extension queue. */
export function reconcileUnlaunchedCommunicationBatch(db:any,input:any){
 const failIf=(condition:boolean,code:string)=>{if(condition)throw Error(code);};
 const evidence=input?.evidence,items=input?.items;
 failIf(input?.contract!=='findwork.unlaunched-greet-reconciliation.v1'||
   !Array.isArray(items)||!items.length||items.length>150||
   typeof input?.apply!=='boolean','INVALID_RECONCILIATION');
 failIf(evidence?.queueIdle!==true||evidence?.unknownSideEffects!==0||
   evidence?.receiptMatches!==0||evidence?.operatorVerified!==true,'UNLAUNCHED_EVIDENCE_REQUIRED');
 const checked=Date.parse(evidence?.checkedAt||'');
 failIf(!Number.isFinite(checked)||checked>Date.now()+60000||
   Date.now()-checked>3600000,'RECONCILIATION_EVIDENCE_STALE');
 const jobIds=new Set(),actionIds=new Set();
 for(const item of items){
  failIf(typeof item?.jobId!=='string'||typeof item?.actionId!=='string'||
    typeof item?.claimedAt!=='string'||!item.jobId||!item.actionId||
    jobIds.has(item.jobId)||actionIds.has(item.actionId),'INVALID_RECONCILIATION_ITEMS');
  jobIds.add(item.jobId);actionIds.add(item.actionId);
 }
 db.exec('BEGIN IMMEDIATE');
 try{
  const exact=db.prepare('SELECT communication_state,action_id,claimed_at,greet_started_at,greet_source,greet_source_hash,greet_raw_json,greet_json,greet_confirmed_at FROM jobs WHERE job_id=?');
  for(const item of items){
   const row=exact.get(item.jobId) as any;
   failIf(!row||row.communication_state!=='IN_FLIGHT'||row.action_id!==item.actionId||
     row.claimed_at!==item.claimedAt||row.greet_started_at!==null||
     row.greet_source!==null||row.greet_source_hash!==null||
     row.greet_raw_json!==null||row.greet_json!==null||
     row.greet_confirmed_at!==null,'RECONCILIATION_STATE_CHANGED');
   const count=(db.prepare('SELECT COUNT(*) n FROM job_events WHERE job_id=? AND event_type=? AND occurred_at>=?')
     .get(item.jobId,'GREET',item.claimedAt) as any).n;
   failIf(count!==0,'RECONCILIATION_RECEIPT_CONFLICT');
  }
  if(input.apply){
   const stamp=new Date().toISOString();
   const update=db.prepare("UPDATE jobs SET communication_state='NONE',action_id=NULL,claimed_at=NULL,updated_at=? WHERE job_id=? AND communication_state='IN_FLIGHT' AND action_id=? AND claimed_at=?");
   const event=db.prepare("INSERT INTO job_events(job_id,event_type,old_state,new_state,source_hash,occurred_at,event_key) VALUES(?,?,?,?,?,?,?)");
   for(const item of items){
    failIf(update.run(stamp,item.jobId,item.actionId,item.claimedAt).changes!==1,'RECONCILIATION_STATE_CHANGED');
    event.run(item.jobId,'GREET_CLAIM_RELEASED','IN_FLIGHT','NONE',null,stamp,'greet-claim-released:'+item.actionId);
   }
  }
  db.exec('COMMIT');
  return{verified:items.length,released:input.apply?items.length:0,preview:!input.apply};
 }catch(error){db.exec('ROLLBACK');throw error;}
}
