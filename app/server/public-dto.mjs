import {sanitizeJobPayload} from '../db/ingestion/job-store.ts';
const listKeys=['beforeNameIcons','goldHunter','proxyJob','proxyType','iconWord','anonymous','atsDirectPost','optimal','jobValidStatus','jobLabels','leastMonthDesc','daysPerWeekDesc','jobType','welfareList','skills'];
const jobKeys=['job_id','job_name','brand_name','city','district','salary','experience','education','screening_status','screening_reason','decision_source','strategy_version','revision','screened_at','communication_state','communicated','communicated_at','application_state','first_seen_at','last_seen_at','updated_at','detail_fetched_at','decision_basis','decision_stale','same_recruiter_communicated','ai_summary','ai_summary_status','eligible','block_reason','history_blocked','history_signals','has_detail','greet_started_at','greet_reason'];
export function publicJob(job){
 const result=Object.fromEntries(jobKeys.filter(k=>Object.hasOwn(job,k)).map(k=>[k,job[k]]));
 result.list=Object.fromEntries(listKeys.filter(k=>Object.hasOwn(job.list||{},k)).map(k=>[k,job.list[k]]));
 result.facts=sanitizeJobPayload(job.facts||{});
 return result;
}
export function publicJobsQuery(query){return{...query,items:query.items.map(publicJob)};}
export function publicJobDetail(detail){
 return{job:publicJob(detail.job),detail:detail.detail?{
  jd_text:detail.detail.jd_text,
  data:{jobInfo:{recruitmentCountDesc:detail.detail.data?.jobInfo?.recruitmentCountDesc??null}}
 }:null};
}
