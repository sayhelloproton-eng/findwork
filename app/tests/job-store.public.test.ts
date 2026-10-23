import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {openJobsDatabase,importList,decideJob,importDetail,importGreet,claimGreet,queryJobs,getJobDetail,getJob,sanitizeJobPayload,restoreRawSources,restoreRawReceipts,readJobFile,importAiSummaries,getJobsDashboard,decideAiJob,importApplication,getJobEvents} from '../db/ingestion/job-store.ts';
const list=(...ids:string[])=>({code:0,zpData:{jobList:ids.map(jobId=>({encryptJobId:jobId,jobName:'示例工程师',brandName:'示例公司',cityName:'上海',areaDistrict:'徐汇区',bossOnline:false,contact:false,skills:['TypeScript']}))}});
const detail=(jobId='a',extra:any={})=>({jobId,capturedAt:'2026-01-02T00:00:00Z',rawResponse:{code:0,zpData:{jobInfo:{encryptId:jobId,jobName:'示例工程师',postDescription:'Synthetic JD for Agent and MCP',invalidStatus:false,jobStatusDesc:'招聘中'},relationInfo:{beFriend:false},...extra}}});
const greet=(jobId='a',extra:any={})=>({contract:'boss-greet-result.v1',jobId,endpoint:'/wapi/zpgeek/friend/add.json',method:'POST',startedAt:'2026-01-01T00:00:00Z',finishedAt:'2026-01-01T00:00:01Z',result:'SUCCESS',httpStatus:200,response:{code:0},...extra});
const worth=(db:any,jobId='a',extra:any={})=>decideJob(db,{jobId,status:'WORTH',reason:'合成判断：职责相关',strategyVersion:'synthetic-v2',...extra});
function setup(t:any,ids=['a']){const db=openJobsDatabase(':memory:');t.after(()=>db.close());importList(db,list(...ids));return db;}

test('v3 store retains two job business tables, a raw response archive and four decisions',t=>{
 const db=setup(t,[]);assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r:any)=>r.name),['job_details','job_events','jobs','list_responses']);
 assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version,6);assert.equal(queryJobs(db).total,0);
 const names=db.prepare('PRAGMA table_info(jobs)').all().map((r:any)=>r.name);assert.equal(names.includes('match_score'),false);assert.equal(names.includes('priority'),false);
});
test('real company ID is stored and supports exact and anonymous recruiter filtering',t=>{
 const db=setup(t,[]),p:any=list('a','b','c');
 p.zpData.jobList[0].encryptBrandId='company-1';p.zpData.jobList[0].brandName='实名公司';
 p.zpData.jobList[1].encryptBrandId='company-2';p.zpData.jobList[1].brandName='另一家公司';
 p.zpData.jobList[2].goldHunter=1;p.zpData.jobList[2].brandName='某匿名企业';
 importList(db,p);
 assert.equal(getJob(db,'a').brand_id,'company-1');
 assert.equal(getJob(db,'c').brand_id,null);
 assert.equal(queryJobs(db,{brandId:'company-1'}).total,1);
 assert.equal(queryJobs(db,{brandId:'__ANONYMOUS__'}).total,1);
 assert.equal(queryJobs(db).companies.find((x:any)=>x.id==='__ANONYMOUS__')?.name,'匿名');
 assert.ok(getJob(db,'a').list.encryptBrandId==='company-1');
 const later=list('a');later.zpData.jobList[0].brandName='实名公司';later.zpData.jobList[0].jobName='新需求的职位';
 importList(db,later); // Later List response omits encryptBrandId.
 assert.equal(getJob(db,'a').brand_id,'company-1','partial List must retain previously grounded company ID');
 assert.equal(queryJobs(db,{brandId:'company-1'}).total,1);
 assert.throws(()=>queryJobs(db,{education:'博士或魔法师'}),/INVALID_EDUCATION/);
});
test('three-month chart is driven by stored job life-cycle facts',t=>{
 const db=setup(t,['a','b']),chart=getJobsDashboard(db);
 assert.equal(chart.total,2);
 assert.equal(chart.weeks.length,13);
 assert.equal(chart.judgment.PENDING,2);
 assert.equal(chart.education.本科,0);
 assert.equal(chart.weeks.at(-1).receivedTotal,2);
});
test('v4 database migrates company ID from both original List and Detail JSON',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jobs-v4-brand-')),path=join(dir,'jobs.sqlite');
 try{
  let db=openJobsDatabase(path);const p:any=list('a','b');p.zpData.jobList[0].encryptBrandId='brand-one';importList(db,p);
  const d:any=detail('b',{brandComInfo:{encryptBrandId:'brand-two'}});importDetail(db,d);
  db.exec('ALTER TABLE jobs DROP COLUMN brand_id; PRAGMA user_version=4;');
  db.close();db=openJobsDatabase(path);
  assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version,6);
  assert.equal(getJob(db,'a').brand_id,'brand-one');assert.equal(getJob(db,'b').brand_id,'brand-two');
  db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('persistent reopen and owner-only DB permissions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jobs-reopen-')),path=join(dir,'jobs.sqlite');try{let db=openJobsDatabase(path);importList(db,list('a'));db.close();db=openJobsDatabase(path);assert.equal(queryJobs(db).total,1);db.close();assert.equal(statSync(path).mode&0o777,0o600);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('job store refuses unrelated database without changing its bytes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jobs-shared-')),path=join(dir,'shared.sqlite');try{const db=new DatabaseSync(path);db.exec('CREATE TABLE unrelated_test(id INTEGER PRIMARY KEY)');db.close();const before=readFileSync(path);assert.throws(()=>openJobsDatabase(path),/NOT_BOSS_JOBS_DATABASE/);assert.deepEqual(readFileSync(path),before);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('AI summary is stored on jobs and stale JD is never shown as current',t=>{
 const db=setup(t);importDetail(db,detail());
 const before=getJob(db,'a'),sourceHash=createHash('sha256').update(before.facts.jd_text).digest('hex');
 const summary={headline:'合成提炼',responsibilities:['职责'],requirements:['门槛'],bonus:['加分'],notices:['风险']};
 assert.equal(before.ai_summary_status,'PENDING');
 assert.deepEqual(importAiSummaries(db,{contract:'job-ai-summaries.v1',items:[{jobId:'a',sourceHash,summary}]}),{stored:1});
 assert.equal(JSON.parse(db.prepare('SELECT ai_summary_json FROM jobs WHERE job_id=?').get('a').ai_summary_json).headline,'合成提炼');
 const next=detail();next.capturedAt='2026-01-03T00:00:00Z';next.rawResponse.zpData.jobInfo.postDescription='Changed original JD';
 importDetail(db,next);
 assert.equal(getJob(db,'a').ai_summary_status,'STALE');assert.equal(getJob(db,'a').ai_summary,null);
 assert.throws(()=>importAiSummaries(db,{contract:'job-ai-summaries.v1',items:[{jobId:'a',sourceHash,summary}]}),/AI_SUMMARY_STALE_SOURCE/);
});
test('v6 emits new COLLECTED and LIST_UPDATED events without duplicate replay events',t=>{
 const db=setup(t,[]),input=list('a','b');
 assert.equal(importList(db,input).added,2);
 assert.equal(db.prepare("SELECT count(*) n FROM job_events WHERE event_type='COLLECTED'").get().n,2);
 importList(db,input);
 assert.equal(db.prepare("SELECT count(*) n FROM job_events WHERE event_type='COLLECTED'").get().n,2);
 const updated=list('a');updated.zpData.jobList[0].jobName='changed job';
 importList(db,updated);importList(db,updated);
 assert.equal(db.prepare("SELECT count(*) n FROM job_events WHERE event_type='LIST_UPDATED'").get().n,1);
});
test('v6 stale decisions are excluded from real candidate queries until the AI rechecks latest source',t=>{
 const db=setup(t),first=getJob(db,'a');
 decideAiJob(db,{jobId:'a',status:'WORTH',reason:'匹配',expectedRevision:first.revision,expectedSourceHash:first.list_hash});
 assert.equal(queryJobs(db,{candidates:true}).total,1);
 const changed=list('a');changed.zpData.jobList[0].salaryDesc='45-55K';importList(db,changed);
 assert.equal(getJob(db,'a').decision_stale,true);
 assert.equal(getJob(db,'a').eligible,false);
 assert.equal(queryJobs(db,{candidates:true}).total,0);
 const next=getJob(db,'a');
 decideAiJob(db,{jobId:'a',status:'WORTH',reason:'复查新薪资后仍匹配',expectedRevision:next.revision,expectedSourceHash:next.list_hash});
 assert.equal(queryJobs(db,{candidates:true}).total,1);
});
test('v6 AI write preconditions detect stale List and preserve decision history',t=>{
 const db=setup(t),before=getJob(db,'a');
 assert.throws(()=>decideAiJob(db,{jobId:'a',status:'PASS',reason:'test'}),/AI_DECISION_PRECONDITION_REQUIRED/);
 const v=decideAiJob(db,{jobId:'a',status:'WORTH',reason:'工程匹配',expectedRevision:before.revision,expectedSourceHash:before.list_hash});
 assert.equal(v.screening_basis_hash,before.list_hash);
 const later=list('a');later.zpData.jobList[0].jobName='变化的岗位';importList(db,later);
 assert.equal(getJob(db,'a').decision_stale,true);
 assert.throws(()=>decideAiJob(db,{jobId:'a',status:'PASS',reason:'过期判断',expectedRevision:v.revision,expectedSourceHash:before.list_hash}),/DECISION_SOURCE_STALE/);
 assert.equal(getJobEvents(db,'a').filter((x:any)=>x.event_type==='DECISION').length,1);
});
test('v6 complete Detail/Greet originals and independent application receipts are stored',t=>{
 const db=setup(t),p:any=detail('a',{unknownDetail:{opaque:7}});importDetail(db,p);
 assert.deepEqual(JSON.parse(db.prepare('SELECT raw_envelope_json FROM job_details WHERE job_id=?').get('a').raw_envelope_json),p);
 importGreet(db,greet('a',{sourceExtra:'verbatim'}));
 assert.equal(JSON.parse(db.prepare('SELECT greet_raw_json FROM jobs WHERE job_id=?').get('a').greet_raw_json).sourceExtra,'verbatim');
 const apply:any={contract:'job-application-result.v1',kind:'RESUME_SUBMISSION',jobId:'a',actionId:'application-test',finishedAt:'2026-10-23T04:00:00Z',result:'SUCCESS',confirmed:true,receipt:{kind:'SYNTHETIC'}};
 assert.throws(()=>importApplication(db,{...apply,confirmed:false}),/APPLICATION_UNCONFIRMED/);
 assert.throws(()=>importApplication(db,{...apply,receipt:{}}),/APPLICATION_RECEIPT_REQUIRED/);
 assert.equal(importApplication(db,apply).application_state,'SUCCEEDED');
 assert.equal(importApplication(db,apply).communicated,true);
 assert.equal(getJobEvents(db,'a').filter((x:any)=>x.event_type==='APPLICATION').length,1);
});
test('v6 verified legacy originals can be backfilled without changing outcomes or timestamps',()=>{
 const dir=mkdtempSync(join(tmpdir(),'job-legacy-raw-')),path=join(dir,'jobs.sqlite'),file=join(dir,'receipt.json');
 try{
  const db=openJobsDatabase(path);importList(db,list('a'));
  const det=detail();writeFileSync(file,JSON.stringify(det));
  let source=readJobFile(file);importDetail(db,source.payload,source.evidence);
  const greetFile=join(dir,'greet.json');writeFileSync(greetFile,JSON.stringify(greet()));
  source=readJobFile(greetFile);importGreet(db,source.payload,source.evidence);
  const stamp=getJob(db,'a').updated_at;
  db.exec('UPDATE job_details SET raw_envelope_json=NULL; UPDATE jobs SET greet_raw_json=NULL;');
  assert.deepEqual(restoreRawReceipts(db),{detailChecked:1,detailRestored:1,greetChecked:1,greetRestored:1});
  assert.deepEqual(JSON.parse(db.prepare('SELECT raw_envelope_json FROM job_details WHERE job_id=?').get('a').raw_envelope_json),det);
  assert.equal(JSON.parse(db.prepare('SELECT greet_raw_json FROM jobs WHERE job_id=?').get('a').greet_raw_json).contract,'boss-greet-result.v1');
  assert.equal(getJob(db,'a').updated_at,stamp);
  assert.deepEqual(restoreRawReceipts(db),{detailChecked:0,detailRestored:0,greetChecked:0,greetRestored:0});
  db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('v6 strict Greet CLI requires claim before importing success',t=>{
 const db=setup(t);
 assert.throws(()=>importGreet(db,greet(),{requireClaim:true}),/GREET_CLAIM_REQUIRED/);
});
test('500-row List import and repeat are correct, idempotent and unassessed',t=>{
 const db=setup(t,[]),p=list(...Array.from({length:500},(_,i)=>`synthetic-${i}`)),start=performance.now();
 assert.deepEqual(importList(db,p),{read:500,added:500,existing:0,updated:0,invalid:0});t.diagnostic(`500 rows: ${(performance.now()-start).toFixed(1)} ms`);
 assert.deepEqual(importList(db,p),{read:500,added:0,existing:500,updated:0,invalid:0});const r=queryJobs(db,{status:'PENDING',limit:500});assert.equal(r.total,500);assert.equal(r.items.length,500);
});
test('duplicate IDs and invalid rows are counted without filtering business facts',t=>{
 const db=setup(t,[]),p:any=list('a','a','b');p.zpData.jobList.push(null,{encryptJobId:'x'},{jobName:'bad'});assert.deepEqual(importList(db,p),{read:6,added:2,existing:1,updated:0,invalid:3});
 assert.throws(()=>importList(db,{code:1,zpData:{jobList:[]}}),/NOT_LIST_RESPONSE/);assert.throws(()=>importList(db,{type:'diagnostic'}),/NOT_LIST_RESPONSE/);
});
test('judgment categories fold NEED_DETAIL into pending without rewriting underlying records',t=>{
 const db=setup(t,['a','b','c']);
 worth(db,'a',{status:'PASS',reason:'合成排除'});
 worth(db,'c',{status:'NEED_DETAIL',reason:null});
 const pending=queryJobs(db,{status:'PENDING'});
 assert.equal(pending.total,2);
 assert.equal(pending.summary.pending,2);
 assert.deepEqual(new Set(pending.items.map((j:any)=>j.job_id)),new Set(['b','c']));
 assert.equal(getJob(db,'c').screening_status,'NEED_DETAIL');
 const judgment=getJobsDashboard(db).judgment;
 assert.deepEqual(judgment,{WORTH:0,PENDING:2,PASS:1});
});

test('WORTH/PASS reasons, NEED_DETAIL and manual decisions survive new List content',t=>{
 const db=setup(t,['a','b','c']);worth(db,'a',{status:'PASS',reason:'示例排除原因',source:'MANUAL'});worth(db,'b');worth(db,'c',{status:'NEED_DETAIL',reason:null});
 const p=list('a','b','c');p.zpData.jobList[0].jobName='更新的职位';assert.equal(importList(db,p).updated,1);
 assert.equal(getJob(db,'a').screening_reason,'示例排除原因');assert.equal(getJob(db,'a').decision_source,'MANUAL');assert.equal(queryJobs(db,{candidates:true}).total,1);assert.equal(getJob(db,'c').screening_status,'NEED_DETAIL');
});
test('decision validation, partial updates and revision conflicts fail safely',t=>{
 const db=setup(t);for(const patch of [{status:'PASS',reason:' '},{status:'WORTH',reason:null},{status:'OTHER'},{score:99},{priority:100},{source:'OTHER'}])assert.throws(()=>worth(db,'a',patch));
 const before=worth(db);decideJob(db,{jobId:'a',reason:'修改理由',source:'MANUAL',expectedRevision:before.revision});assert.equal(getJob(db,'a').screening_status,'WORTH');
 assert.throws(()=>decideJob(db,{jobId:'a',status:'PASS',reason:'stale',expectedRevision:before.revision}),/DECISION_CONFLICT/);assert.throws(()=>worth(db,'missing'),/JOB_NOT_FOUND/);
 assert.throws(()=>db.prepare("UPDATE jobs SET screening_status='PASS',screening_reason=NULL WHERE job_id='a'").run());
});
test('List + Detail merges facts, retains nested fields and never lets empty detail erase List',t=>{
 const db=setup(t),p:any=list('a');Object.assign(p.zpData.jobList[0],{salaryDesc:'25-40K',brandIndustry:'软件',welfareList:['带薪年假'],beforeNameIcons:[{label:'示例',url:'https://example.invalid/icon.png'}]});importList(db,p);
 const d:any=detail('a',{brandComInfo:{brandName:'',introduce:'合成公司介绍',labels:['开发工具'],scaleName:'100-499人'},bossInfo:{activeTimeDesc:'今日活跃'}});d.rawResponse.zpData.jobInfo.showSkills=['MCP'];d.rawResponse.zpData.jobInfo.salaryDesc='';
 const result=importDetail(db,d);assert.equal(result.job.facts.salary,'25-40K');assert.equal(result.job.facts.brand_name,'示例公司');assert.equal(result.job.facts.company_introduction,'合成公司介绍');assert.deepEqual(result.job.facts.skills,['TypeScript','MCP']);assert.deepEqual(result.job.facts.welfare,['带薪年假']);
 assert.equal(result.job.list.beforeNameIcons[0].label,'示例');assert.equal(result.detail.invalid_status,0);assert.equal(result.job.facts.sources.salary,'List');
 importList(db,list('a'));assert.equal(getJobDetail(db,'a').detail.jd_text,'Synthetic JD for Agent and MCP');
});
test('Detail raw/response/rawResponse formats work and mismatched or failed detail is atomic',t=>{
 const db=setup(t,['a','b','c']);importDetail(db,detail().rawResponse);importDetail(db,{encryptJobId:'b',apiCode:0,response:detail('b').rawResponse});importDetail(db,detail('c'));
 for(const p of [{...detail(),jobId:'b'},{...detail(),apiCode:1},{...detail(),status:'FAILED'},detail('missing'),{type:'boss-detail-failures'},{code:0,zpData:{jobInfo:{encryptId:'a',jobName:'blank'}}}])assert.throws(()=>importDetail(db,p));
 assert.throws(()=>importDetail(db,detail(),{},'b'),/DETAIL_ID_MISMATCH/);assert.equal(getJobDetail(db,'a').detail.jd_text,'Synthetic JD for Agent and MCP');
});
test('missing-detail decision returns to unassessed only when full Detail arrives',t=>{
 const db=setup(t);worth(db,'a',{status:'NEED_DETAIL'});assert.equal(getJob(db,'a').has_detail,false);importDetail(db,detail());assert.equal(getJob(db,'a').screening_status,'PENDING');assert.equal(getJob(db,'a').screening_reason,null);assert.throws(()=>worth(db,'a',{status:'NEED_DETAIL'}),/DETAIL_ALREADY_AVAILABLE/);
});
test('older detail cannot replace newer; identical newer snapshots advance freshness',t=>{
 const db=setup(t);importDetail(db,detail());importDetail(db,{...detail(),capturedAt:'2026-01-05T00:00:00Z'});const middle=detail();middle.capturedAt='2026-01-04T00:00:00Z';middle.rawResponse.zpData.jobInfo.postDescription='Stale';importDetail(db,middle);
 assert.equal(getJobDetail(db,'a').detail.jd_text,'Synthetic JD for Agent and MCP');assert.equal(getJobDetail(db,'a').detail.fetched_at,'2026-01-05T00:00:00.000Z');
});
test('contact=false and beFriend=true stay distinct; sticky evidence blocks without claiming success',t=>{
 const db=setup(t);worth(db);importDetail(db,detail('a',{relationInfo:{beFriend:true}}));let j=getJob(db,'a');assert.equal(j.contact_signal,0);assert.equal(j.communicated,false);assert.equal(j.history_blocked,1);
 importDetail(db,{...detail(),capturedAt:'2026-01-03T00:00:00Z'});importList(db,list('a'));j=getJob(db,'a');assert.deepEqual(j.history_signals,['DETAIL_BE_FRIEND']);assert.equal(queryJobs(db,{candidates:true}).total,0);assert.throws(()=>claimGreet(db,{jobId:'a',actionId:'retry'}),/GREET_BLOCKED/);
});
test('boolean invalidStatus closes a Worth job and prevents claiming it',t=>{
 const db=setup(t);worth(db);const d=detail();d.rawResponse.zpData.jobInfo.invalidStatus=true;d.rawResponse.zpData.jobInfo.jobStatusDesc='职位已关闭';importDetail(db,d);
 assert.equal(getJobDetail(db,'a').detail.invalid_status,1);assert.equal(getJob(db,'a').facts.closed,true);assert.equal(queryJobs(db,{candidates:true}).total,0);assert.throws(()=>claimGreet(db,{jobId:'a',actionId:'one'}),/GREET_BLOCKED/);
});
test('List contact, resume and ATS are independent evidence streams',t=>{
 const db=setup(t,['a','b','c']);const p=list('a');p.zpData.jobList[0].contact=true;importList(db,p);importDetail(db,detail('b',{oneKeyResumeInfo:{alreadySend:true}}));importDetail(db,detail('c',{atsOnlineApplyInfo:{alreadyApply:true}}));
 assert.deepEqual(getJob(db,'a').history_signals,['LIST_CONTACT']);assert.deepEqual(getJob(db,'b').history_signals,['DETAIL_ALREADY_SEND']);assert.deepEqual(getJob(db,'c').history_signals,['DETAIL_ALREADY_APPLY']);
});
test('confirmed Greet success is idempotent and new List batches cannot reset communication',t=>{
 const db=setup(t);worth(db);importGreet(db,greet());importGreet(db,greet());importList(db,list('a'));assert.equal(getJob(db,'a').communicated,true);assert.equal(queryJobs(db,{communicated:true}).total,1);assert.equal(queryJobs(db,{candidates:true}).total,0);assert.throws(()=>claimGreet(db,{jobId:'a',actionId:'retry'}),/GREET_BLOCKED/);
});
test('explicit failure stays uncommunicated and permanently blocks automatic retry',t=>{
 const db=setup(t);worth(db);importGreet(db,greet('a',{result:'FAILED',response:{code:42}}));assert.equal(getJob(db,'a').communication_state,'FAILED');assert.equal(getJob(db,'a').communicated,false);assert.equal(queryJobs(db,{candidates:true}).total,0);assert.throws(()=>claimGreet(db,{jobId:'a',actionId:'retry'}),/GREET_BLOCKED/);
});
test('worker/transport errors, contradictory receipts and missing body remain UNKNOWN internally',t=>{
 const db=setup(t,['a','b','c','d']);for(const[jobId,extra]of Object.entries({a:{result:'FAILED',sideEffectState:'UNKNOWN',response:null,httpStatus:null},b:{result:'FAILED',error:'NETWORK_ERROR',response:null,httpStatus:null},c:{httpStatus:500},d:{response:null}})){worth(db,jobId);importGreet(db,greet(jobId,extra));assert.equal(getJob(db,jobId).communication_state,'UNKNOWN');assert.equal(getJob(db,jobId).communicated,false);}assert.equal(queryJobs(db,{candidates:true}).total,0);
});
test('UNKNOWN reconciles same attempt to success, never downgrades to retryable and success is monotonic',t=>{
 const db=setup(t);importGreet(db,greet('a',{result:'UNKNOWN',httpStatus:null,response:null}));importGreet(db,greet('a',{result:'FAILED',response:{code:42}}));assert.equal(getJob(db,'a').communication_state,'UNKNOWN');importGreet(db,greet());importGreet(db,greet('a',{result:'FAILED',error:'later error'}));assert.equal(getJob(db,'a').communicated,true);
});
test('Greet identity, contract, endpoint, timestamps and attempt identity reject safely',t=>{
 const db=setup(t);for(const patch of[{contract:'queue-ack'},{result:'QUEUED'},{method:'GET'},{endpoint:'/diagnostics'},{startedAt:'bad'},{finishedAt:'2025-01-01T00:00:00Z'}])assert.throws(()=>importGreet(db,greet('a',patch)));
 assert.throws(()=>importGreet(db,greet(),{},'b'),/GREET_ID_MISMATCH/);assert.throws(()=>importGreet(db,greet('missing')),/JOB_NOT_FOUND/);importGreet(db,greet());assert.throws(()=>importGreet(db,greet('a',{startedAt:'2026-01-01T00:00:00.500Z'})),/GREET_ATTEMPT_CONFLICT/);
});
test('claim requires eligibility, fences duplicate actions and reconciles only a fresh result',t=>{
 const db=setup(t,['a','b']);assert.throws(()=>claimGreet(db,{jobId:'a',actionId:'one'}),/GREET_BLOCKED/);worth(db);worth(db,'b');const j=claimGreet(db,{jobId:'a',actionId:'one'});assert.equal(j.communication_state,'IN_FLIGHT');assert.equal(claimGreet(db,{jobId:'a',actionId:'one'}).claimed_at,j.claimed_at);
 assert.throws(()=>claimGreet(db,{jobId:'a',actionId:'two'}),/GREET_BLOCKED/);assert.throws(()=>claimGreet(db,{jobId:'b',actionId:'one'}),/ACTION_ID_CONFLICT/);assert.throws(()=>importGreet(db,greet()),/GREET_PREDATES_CLAIM/);
 const stamp=new Date(Date.now()+1000).toISOString();importGreet(db,greet('a',{startedAt:stamp,finishedAt:stamp}));assert.equal(getJob(db,'a').communicated,true);
});
test('two connections cannot claim the same job',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jobs-claim-')),path=join(dir,'jobs.sqlite'),a=openJobsDatabase(path),b=openJobsDatabase(path);try{importList(a,list('a'));worth(a);claimGreet(a,{jobId:'a',actionId:'one'});assert.throws(()=>claimGreet(b,{jobId:'a',actionId:'two'}),/GREET_BLOCKED/);}finally{a.close();b.close();rmSync(dir,{recursive:true,force:true});}
});
test('status, binary communication, JD/skill keyword, location, pagination and default ordering',t=>{
 const db=setup(t,['a','b','c']);worth(db,'a');worth(db,'b');worth(db,'c',{status:'PASS'});const p=list('b');p.zpData.jobList[0].bossOnline=true;importList(db,p);importDetail(db,detail('a'));
 assert.deepEqual(queryJobs(db,{sort:'recommended'}).items.slice(0,2).map((j:any)=>j.job_id),['b','a']);assert.equal(queryJobs(db,{q:'MCP'}).total,1);assert.equal(queryJobs(db,{location:'徐汇'}).total,3);assert.equal(queryJobs(db,{q:'%'}).total,0);assert.equal(queryJobs(db,{limit:1,offset:1}).items.length,1);
 for(const input of[{status:'x'},{communicated:'x'},{sort:'score'},{state:'UNKNOWN'},{limit:501},{offset:-1}])assert.throws(()=>queryJobs(db,input));
});
test('raw List retains every original and previously excluded field plus unknown future keys and full response envelope',t=>{
 const db=setup(t,[]),p:any=list('a');
 Object.assign(p.zpData.jobList[0],{securityId:'sec-native',lid:'list-native',encryptBossId:'boss-native',
  unknownNewApiField:{headers:{authorization:'native-value'},nested:[1,{token:'native-token'}]},
  beforeNameIcons:[{url:'https://example.invalid/icon?securityId=source-query'}]});
 p.message='original message';p.zpData.lid='batch-native';p.zpData.hasMore=true;
 importList(db,p);
 const job=getJob(db,'a');
 assert.deepEqual(job.list,p.zpData.jobList[0]);
 assert.deepEqual(JSON.parse(db.prepare('SELECT response_json FROM list_responses WHERE instr(response_json, ?) > 0').get('batch-native').response_json),p);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM list_responses').get().n,2);
 importList(db,p);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM list_responses').get().n,2);
});
test('raw Detail retains all native zpData including unknown business groups',t=>{
 const db=setup(t),p:any=detail();
 p.rawResponse.zpData.extraResponseGroup={securityId:'raw-detail-id',nested:{token:'original'}};
 p.rawResponse.zpData.jobInfo.unexpectedAttribute='original-value';
 importDetail(db,p);
 assert.deepEqual(getJobDetail(db,'a').detail.data,p.rawResponse.zpData);
});
test('business communication is only a binary result and confirmed timestamp; attempts remain internal',t=>{
 const db=setup(t);
 assert.equal(getJob(db,'a').communicated,false);assert.equal(getJob(db,'a').communicated_at,null);
 importGreet(db,greet('a',{result:'FAILED',response:{code:7}}));
 assert.equal(getJob(db,'a').communicated,false);assert.equal(getJob(db,'a').communicated_at,null);
 importGreet(db,greet());
 assert.equal(getJob(db,'a').communicated,true);
 assert.equal(getJob(db,'a').communicated_at,'2026-01-01T00:00:01.000Z');
});
test('v2 SQLite is upgraded in place without clearing decisions or successful Greet history',()=>{
 const dir=mkdtempSync(join(tmpdir(),'job-v2-upgrade-')),p=join(dir,'job.sqlite');
 try{
  let db=openJobsDatabase(p);importList(db,list('a'));worth(db);importGreet(db,greet());
  db.exec('DROP TABLE list_responses; ALTER TABLE jobs DROP COLUMN communicated_at; ALTER TABLE jobs DROP COLUMN ai_summary_json; ALTER TABLE jobs DROP COLUMN ai_summary_source_hash; ALTER TABLE jobs DROP COLUMN ai_summary_at; ALTER TABLE jobs DROP COLUMN brand_id; PRAGMA user_version=2;');
  db.close();db=openJobsDatabase(p);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,6);
  assert.equal(db.prepare('SELECT count(*) n FROM list_responses').get().n,0);
  assert.equal(getJob(db,'a').screening_status,'WORTH');
  assert.equal(getJob(db,'a').communicated_at,'2026-01-01T00:00:01.000Z');
  db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('v3 SQLite upgrades AI summary columns in place without changing past decisions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jobs-v3-ai-upgrade-')),path=join(dir,'jobs.sqlite');
 try{
  let db=openJobsDatabase(path);importList(db,list('a'));worth(db);
  db.exec('ALTER TABLE jobs DROP COLUMN ai_summary_json; ALTER TABLE jobs DROP COLUMN ai_summary_source_hash; ALTER TABLE jobs DROP COLUMN ai_summary_at; ALTER TABLE jobs DROP COLUMN brand_id; PRAGMA user_version=3;');
  db.close();db=openJobsDatabase(path);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,6);
  assert.equal(getJob(db,'a').screening_status,'WORTH');
  assert.equal(getJob(db,'a').ai_summary_status,'NO_DETAIL');
  db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('record updated_at begins at ingestion, tracks changes across assessment and communication, defaults to newest',t=>{
 const db=setup(t,['a','b']);
 const start=getJob(db,'a');
 assert.equal(start.updated_at,start.first_seen_at);
 db.prepare("UPDATE jobs SET updated_at='2020-01-01T00:00:00.000Z' WHERE job_id='a'").run();
 const baseline=getJob(db,'a').updated_at;
 importList(db,list('a'));assert.equal(getJob(db,'a').updated_at,baseline,'unchanged List must not update the record');
 const changed=list('a');changed.zpData.jobList[0].salaryDesc='25-40K';importList(db,changed);
 assert.notEqual(getJob(db,'a').updated_at,baseline);
 db.prepare("UPDATE jobs SET updated_at='2020-01-01T00:00:00.000Z' WHERE job_id='a'").run();
 const assessed=worth(db);assert.notEqual(assessed.updated_at,baseline,'PASS/WORTH changes the record');
 const revision=assessed.revision,stamp=assessed.updated_at;
 assert.equal(worth(db).revision,revision,'same assessment must not mutate the row');
 assert.equal(getJob(db,'a').updated_at,stamp);
 db.prepare("UPDATE jobs SET updated_at='2020-01-01T00:00:00.000Z' WHERE job_id='a'").run();
 importGreet(db,greet());assert.notEqual(getJob(db,'a').updated_at,baseline,'successful greet changes the record');
 db.prepare("UPDATE jobs SET updated_at='2030-01-01T00:00:00.000Z' WHERE job_id='b'").run();
 assert.equal(queryJobs(db).items[0].job_id,'b','default is updated_at descending');
 assert.equal(queryJobs(db,{sort:'updated'}).items[0].job_id,'b');
});
test('AI summary changes record update time but identical reimport does not',t=>{
 const db=setup(t),old='2020-01-01T00:00:00.000Z';
 importDetail(db,detail());
 const sourceHash=createHash('sha256').update(getJob(db,'a').facts.jd_text).digest('hex');
 const batch={contract:'job-ai-summaries.v1',items:[{jobId:'a',sourceHash,summary:{headline:'提炼测试',responsibilities:['职责'],requirements:['技能'],bonus:[],notices:[]}}]};
 db.prepare('UPDATE jobs SET updated_at=? WHERE job_id=?').run(old,'a');
 importAiSummaries(db,batch);
 assert.notEqual(getJob(db,'a').updated_at,old);
 db.prepare('UPDATE jobs SET updated_at=? WHERE job_id=?').run(old,'a');
 importAiSummaries(db,batch);
 assert.equal(getJob(db,'a').updated_at,old);
});
test('existing source file restores omitted raw fields without changing decisions or communication',()=>{
 const dir=mkdtempSync(join(tmpdir(),'job-source-restore-')),file=join(dir,'source.json'),path=join(dir,'jobs.sqlite');
 try{
  const p:any=list('a');Object.assign(p.zpData.jobList[0],{securityId:'native',lid:'native-lid',encryptBossId:'native-boss'});
  writeFileSync(file,JSON.stringify(p));const {payload,evidence}=readJobFile(file);
  const db=openJobsDatabase(path);importList(db,payload,evidence);worth(db);importGreet(db,greet());
  const before=getJob(db,'a');
  const trimmed={...before.list};delete trimmed.securityId;delete trimmed.lid;delete trimmed.encryptBossId;
  db.prepare('UPDATE jobs SET list_json=?,list_hash=? WHERE job_id=?').run(JSON.stringify(trimmed),'old-sanitized','a');
  const result=restoreRawSources(db);
  assert.deepEqual(result,{listChecked:1,listRestored:1,detailChecked:0,detailRestored:0,batches:1});
  assert.deepEqual(getJob(db,'a').list,p.zpData.jobList[0]);
  assert.equal(getJob(db,'a').communicated_at,before.communicated_at);
  assert.equal(getJob(db,'a').screening_status,before.screening_status);
  assert.equal(restoreRawSources(db).listRestored,0);
  db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('CLI uses the new stable decision/query contract and safe JSON errors',()=>{
 const dir=mkdtempSync(join(tmpdir(),'jobs-cli-')),path=join(dir,'jobs.sqlite'),file=join(dir,'list.json'),run=(...args:string[])=>spawnSync(process.execPath,['app/server/job-cli.ts',...args],{encoding:'utf8',env:{...process.env,BOSS_JOBS_DB_PATH:path}});
 try{writeFileSync(file,JSON.stringify(list('synthetic-cli')));assert.equal(JSON.parse(run('init').stdout).result.version,6);assert.equal(JSON.parse(run('import-list',file).stdout).result.added,1);assert.equal(JSON.parse(run('query','{"status":"PENDING"}').stdout).result.total,1);
 const bad=run('decide','{"jobId":"synthetic-cli","status":"PASS"}');assert.equal(bad.status,1);assert.equal(JSON.parse(bad.stderr).error,'DECISION_REASON_REQUIRED');writeFileSync(file,'invalid');assert.equal(JSON.parse(run('import-list',file).stderr).error,'INVALID_JSON');}finally{rmSync(dir,{recursive:true,force:true});}
});

test('dense worktable SQL filters and paginates 500 jobs without losing the original IDs',ctx=>{
 const db=setup(ctx,Array.from({length:500},(_,i)=>'worktable-'+i));
 importDetail(db,detail('worktable-0'));
 const p=list('worktable-1');p.zpData.jobList[0].bossOnline=true;importList(db,p);
 worth(db,'worktable-0');worth(db,'worktable-1');
 assert.equal(queryJobs(db,{hasDetail:true}).total,1);
 assert.equal(queryJobs(db,{hasDetail:false}).total,499);
 assert.equal(queryJobs(db,{online:true}).total,1);
 assert.equal(queryJobs(db,{status:'WORTH'}).total,2);
 assert.equal(queryJobs(db,{candidates:true}).total,2);
 assert.equal(queryJobs(db,{limit:20,offset:480}).items.length,20);
 assert.equal(queryJobs(db,{sort:'recent',limit:50,offset:450}).items.length,50);
 assert.equal(queryJobs(db,{sort:'online'}).items[0].job_id,'worktable-1');
});
