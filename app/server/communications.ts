import {randomUUID} from 'node:crypto';
import {getJob,queryJobs,checkGreetBeforeSend} from '../db/ingestion/job-store.ts';

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
  const used=(db.prepare("SELECT count(*) n FROM jobs WHERE (claimed_at IS NOT NULL AND date(claimed_at,'+8 hours')=?) OR (greet_started_at IS NOT NULL AND date(greet_started_at,'+8 hours')=?)").get(day,day) as any).n;
  if(used+jobIds.length>150)fail('DAILY_COMMUNICATION_LIMIT');
  const jobs=jobIds.map(jobId=>{
   const job=getJob(db,jobId);
   if(!job.eligible)fail('GREET_BLOCKED');
   const securityId=job.list?.securityId;
   if(typeof securityId!=='string'||!securityId.trim())fail('GREET_SECURITY_ID_MISSING');
   return{jobId,securityId,actionId:'fw-'+randomUUID()};
  });
  const stamp=new Date().toISOString(),update=db.prepare("UPDATE jobs SET communication_state='IN_FLIGHT',action_id=?,claimed_at=?,updated_at=? WHERE job_id=? AND communication_state='NONE'");
  for(const job of jobs)if(update.run(job.actionId,stamp,stamp,job.jobId).changes!==1)fail('GREET_BLOCKED');
  db.exec('COMMIT');
  return{items:jobs,accepted:jobs.length,day,quota:150,usedBefore:used};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function checkCommunicationSend(db:any,input:any){
 return checkGreetBeforeSend(db,{jobId:input?.jobId,actionId:input?.actionId});
}
