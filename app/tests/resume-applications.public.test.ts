import test from 'node:test';
import assert from 'node:assert/strict';
import {openJobsDatabase,importList,decideJob,claimGreet,getJob,importApplication} from '../db/ingestion/job-store.ts';
import {classifyResumeApplication,getResumeApplicationSignals,checkResumeApplication} from '../server/resume-applications.ts';

const listing=(id:string,direct:boolean)=>({code:0,zpData:{jobList:[{encryptJobId:id,jobName:'合成前端岗位',atsDirectPost:direct}]}});
test('ATS direct, can-send-resume, and existing ATS apply are separate signals',()=>{
 assert.deepEqual(classifyResumeApplication({atsDirectPost:false},{oneKeyResumeInfo:{canSendResume:true},atsOnlineApplyInfo:{alreadyApply:false}}),{
  atsDirectPost:false,canSendResume:true,alreadyApplied:false,alreadySentResume:false,
  directApplyConfirmed:false,directApplyEndpointVerified:false
 });
 assert.equal(classifyResumeApplication({atsDirectPost:true},{}).atsDirectPost,true);
 assert.equal(classifyResumeApplication({},{}).directApplyConfirmed,false);
});
test('independent read-only endpoint lists source-backed direct ATS flags and does not mutate jobs',async t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 importList(db,listing('synthetic-ats-001',true));
 importList(db,listing('synthetic-no-ats',false));
 decideJob(db,{jobId:'synthetic-ats-001',status:'WORTH',reason:'合成匹配'});
 const rows=getResumeApplicationSignals(db,{mode:'ats'});
 assert.equal(rows.total,1);assert.equal(rows.items[0].signals.atsDirectPost,true);
 assert.equal(rows.items[0].signals.directApplyConfirmed,false);
 assert.equal(rows.execution.supported,true);assert.equal(rows.execution.defaultEnabled,false);assert.equal(rows.execution.enabled,null);assert.equal(rows.execution.runtimeVerified,false);
 assert.equal(getResumeApplicationSignals(db,{mode:'send-resume'}).total,0);
 assert.equal(getResumeApplicationSignals(db,{mode:'worth'}).total,1);
 assert.throws(()=>getResumeApplicationSignals(db,{mode:'not-real'}),/INVALID_APPLICATION_QUERY/);
 assert.equal(db.prepare('SELECT application_state FROM jobs WHERE job_id=?').get('synthetic-ats-001').application_state,'NONE');
});
test('HTTP exposes separate resume application signals but no invented submission endpoint',async t=>{
 const {createApp}=await import('../server/server.ts');
 const app=createApp({dbPath:':memory:'});t.after(()=>app.close());
 importList(app.db,listing('synthetic-ats-001',true));
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 const result=await fetch(base+'/api/resume-applications/signals').then(r=>r.json());
 assert.equal(result.total,1);assert.equal(result.execution.supported,true);
 assert.equal((await fetch(base+'/api/resume-applications/submit',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,405);
});

test('resume pre-send check accepts only current authorized matching Greet and never changes counts',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 importList(db,listing('synthetic-resume-001',false));decideJob(db,{jobId:'synthetic-resume-001',status:'WORTH',reason:'Synthetic'});
 claimGreet(db,{jobId:'synthetic-resume-001',actionId:'synthetic-greet-action'});
 const input={jobId:'synthetic-resume-001',actionId:'synthetic-greet-action'};
 const before=getJob(db,input.jobId);assert.equal(checkResumeApplication(db,input).allowed,true);assert.deepEqual(getJob(db,input.jobId),before);
 assert.throws(()=>checkResumeApplication(db,{...input,actionId:'other-action'}),/RESUME_APPLICATION_BLOCKED/);
 assert.throws(()=>checkResumeApplication(db,{...input,extra:true}),/INVALID_APPLICATION_CHECK/);
 decideJob(db,{jobId:input.jobId,status:'PASS',reason:'Synthetic current rejection'});assert.throws(()=>checkResumeApplication(db,input),/RESUME_APPLICATION_BLOCKED/);
});
test('BOSS direct-resume import requires real business success and preserves Greet state',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());importList(db,listing('synthetic-resume-001',false));decideJob(db,{jobId:'synthetic-resume-001',status:'WORTH',reason:'Synthetic'});claimGreet(db,{jobId:'synthetic-resume-001',actionId:'synthetic-greet-action'});
 const p={contract:'job-application-result.v1',kind:'RESUME_SUBMISSION',platform:'BOSS',endpoint:'/wapi/zpgeek/resume/onekeydeliver.json',method:'POST',jobId:'synthetic-resume-001',actionId:'synthetic-application',greetActionId:'synthetic-greet-action',finishedAt:'2026-10-26T01:00:00.000Z',result:'SUCCESS',confirmed:true,receipt:{httpStatus:200,response:{code:0}}};
 assert.throws(()=>importApplication(db,{...p,receipt:{httpStatus:200,response:{code:1}}}),/APPLICATION_UNCONFIRMED/);
 assert.throws(()=>importApplication(db,{...p,greetActionId:'other-action'}),/APPLICATION_ACTION_CONFLICT/);
 const before=getJob(db,p.jobId);const after=importApplication(db,p);assert.equal(after.application_state,'SUCCEEDED');assert.equal(after.communication_state,before.communication_state);assert.equal(after.action_id,before.action_id);assert.equal(after.greet_raw_json,before.greet_raw_json);
 assert.throws(()=>checkResumeApplication(db,{jobId:p.jobId,actionId:p.greetActionId}),/RESUME_APPLICATION_BLOCKED/);
});
