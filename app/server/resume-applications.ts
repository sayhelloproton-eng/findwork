import {getJob} from '../db/ingestion/job-store.ts';

// Separate from Greet. These source flags describe different BOSS flows.
// A canSendResume flag alone is NEVER proof of ATS direct application.
export function classifyResumeApplication(list:any={},detail:any={}){
 const ats=detail?.atsOnlineApplyInfo||{},oneKey=detail?.oneKeyResumeInfo||{};
 return{
  atsDirectPost:list?.atsDirectPost===true,
  canSendResume:oneKey?.canSendResume===true,
  alreadyApplied:ats?.alreadyApply===true,
  alreadySentResume:oneKey?.alreadySend===true,
  directApplyConfirmed:false,
  directApplyEndpointVerified:false
 };
}
const fail=(message:string):never=>{throw Error(message);};
export function getResumeApplicationSignals(db:any,input:any={}){
 const limit=Number(input.limit??30),offset=Number(input.offset??0),mode=input.mode??'all';
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||
  !['all','worth','ats','send-resume'].includes(mode)||Object.keys(input).some(k=>!['limit','offset','mode'].includes(k)))
  fail('INVALID_APPLICATION_QUERY');
 const signal="(json_extract(j.list_json,'$.atsDirectPost')=1 OR json_extract(d.detail_json,'$.oneKeyResumeInfo.canSendResume')=1)";
 const clause=signal+(mode==='worth'?" AND j.screening_status='WORTH'":
  mode==='ats'?" AND json_extract(j.list_json,'$.atsDirectPost')=1":
  mode==='send-resume'?" AND json_extract(d.detail_json,'$.oneKeyResumeInfo.canSendResume')=1":'');
 const join=' FROM jobs j LEFT JOIN job_details d ON d.job_id=j.job_id WHERE '+clause;
 const total=(db.prepare('SELECT count(*) n'+join).get() as any).n;
 const rows=db.prepare('SELECT j.job_id,d.detail_json'+join+' ORDER BY j.last_seen_at DESC,j.job_id LIMIT ? OFFSET ?').all(limit,offset) as any[];
 return{items:rows.map(row=>{
  const job=getJob(db,row.job_id),detail=row.detail_json?JSON.parse(row.detail_json):{};
  return{jobId:job.job_id,jobName:job.facts.job_name,company:job.facts.brand_name,
   screeningStatus:job.screening_status,closed:job.facts.closed,
   communicationState:job.communication_state,applicationState:job.application_state,
   signals:classifyResumeApplication(job.list,detail)};
 }),total,limit,offset,mode,execution:{
  supported:true,kind:'ATTACHMENT_RESUME',defaultEnabled:false,enabled:null,
  requiredCapability:'resume-delivery-opt-in',owner:'BOSS_EXTENSION_GREET',
  frontendContractVerified:true,runtimeVerified:false,reason:'EXTENSION_OPT_IN_REQUIRED',
  scope:'Optional attachment delivery in Greet; separate receipt, no backend BOSS sender'}};
}

// Read-only eligibility check for the independently opted-in extension action.
export function checkResumeApplication(db:any,input:any={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['jobId','actionId'].includes(k))||typeof input.jobId!=='string'||typeof input.actionId!=='string'||!input.actionId)fail('INVALID_APPLICATION_CHECK');
 const job=getJob(db,input.jobId);
 if(job.action_id!==input.actionId||!['IN_FLIGHT','SUCCEEDED'].includes(job.communication_state)||
  job.screening_status!=='WORTH'||job.decision_stale||job.facts.closed||job.facts.advanced_degree_excluded||job.application_state!=='NONE')fail('RESUME_APPLICATION_BLOCKED');
 return{allowed:true,jobId:job.job_id,actionId:input.actionId};
}
