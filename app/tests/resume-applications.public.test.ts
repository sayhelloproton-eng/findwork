import test from 'node:test';
import assert from 'node:assert/strict';
import {openJobsDatabase,importList,decideJob} from '../db/ingestion/job-store.ts';
import {classifyResumeApplication,getResumeApplicationSignals} from '../server/resume-applications.ts';

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
 assert.equal(rows.execution.supported,false);
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
 assert.equal(result.total,1);assert.equal(result.execution.supported,false);
 assert.equal((await fetch(base+'/api/resume-applications/submit',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,405);
});
