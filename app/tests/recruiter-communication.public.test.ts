import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openJobsDatabase,importList,importDetail,importGreet,queryJobs,getJob,claimGreet,checkGreetBeforeSend,decideJob} from '../db/ingestion/job-store.ts';
import {getCommunicationCandidates,reserveCommunicationBatch} from '../server/communications.ts';
import {createApp} from '../server/server.ts';
const job=(id:string,person:string|null)=>({encryptJobId:id,jobName:'Synthetic '+id,brandName:'Synthetic',
 jobDegree:'大专',securityId:'synthetic-'+id,...(person?{encryptBossId:person}:{})});
const worth=(db:any,id:string)=>decideJob(db,{jobId:id,status:'WORTH',reason:'Synthetic fit'});
const success=(db:any,id:string)=>importGreet(db,{contract:'boss-greet-result.v1',jobId:id,
 method:'POST',endpoint:'/wapi/zpgeek/friend/add.json',result:'SUCCESS',httpStatus:200,response:{code:0},
 startedAt:'2026-10-22T10:00:00.000Z',finishedAt:'2026-10-22T10:00:03.000Z'},{source:'synthetic-'+id});
test('same-person label does not claim job itself was contacted; candidate query excludes it',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 importList(db,{code:0,zpData:{jobList:[job('sent','p1'),job('other','p1'),job('unrelated','p2'),job('unknown',null)]}});
 for(const id of ['sent','other','unrelated','unknown'])worth(db,id);
 assert.equal(getCommunicationCandidates(db).total,4);
 success(db,'sent');
 const other=getJob(db,'other');
 assert.equal(other.same_recruiter_communicated,true);
 assert.equal(other.communicated,false);
 assert.equal(other.communication_state,'NONE');
 assert.equal(other.eligible,false);
 assert.match(other.block_reason,/同一招聘者/);
 assert.equal(getJob(db,'sent').same_recruiter_communicated,false);
 assert.equal(getJob(db,'unrelated').same_recruiter_communicated,false);
 assert.equal(getJob(db,'unknown').same_recruiter_communicated,false);
 assert.deepEqual(queryJobs(db,{communicated:false}).items.map(x=>x.job_id).sort(),['other','unknown','unrelated']);
 assert.deepEqual(getCommunicationCandidates(db).items.map(x=>x.job_id).sort(),['unknown','unrelated']);
 assert.throws(()=>claimGreet(db,{jobId:'other',actionId:'synthetic-claim'}),/GREET_BLOCKED/);
});
test('Detail fallback identifies same recruiter; no false positives from absent IDs',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 importList(db,{code:0,zpData:{jobList:[job('sent','p1'),job('detail-only',null),job('unrelated','p2')]}});
 for(const id of ['sent','detail-only','unrelated'])worth(db,id);
 importDetail(db,{rawResponse:{code:0,zpData:{jobInfo:{encryptId:'detail-only',encryptUserId:'p1',
 jobName:'Synthetic',postDescription:'Synthetic JD',degreeName:'大专'}}}});
 assert.equal(getJob(db,'detail-only').same_recruiter_communicated,false);
 success(db,'sent');
 assert.equal(getJob(db,'detail-only').same_recruiter_communicated,true);
 assert.equal(getJob(db,'unrelated').same_recruiter_communicated,false);
});
test('same-person jobs cannot be reserved in one batch; newly successful contact blocks send',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 importList(db,{code:0,zpData:{jobList:[job('a','p1'),job('b','p1'),job('c','p2')]}});
 for(const id of ['a','b','c'])worth(db,id);
 assert.throws(()=>reserveCommunicationBatch(db,{jobIds:['a','b']}),/DUPLICATE_RECRUITER_IN_BATCH/);
 assert.equal(getJob(db,'a').communication_state,'NONE');
 const b=reserveCommunicationBatch(db,{jobIds:['b']});
 success(db,'a');
 assert.throws(()=>checkGreetBeforeSend(db,{jobId:'b',actionId:b.items[0].actionId}),/GREET_BLOCKED/);
});
test('public API exposes boolean and label; private recruiter IDs are never sent to UI',async t=>{
 const app=createApp({dbPath:':memory:'});t.after(()=>app.close());
 await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));
 importList(app.db,{code:0,zpData:{jobList:[job('sent','private-person-id'),job('other','private-person-id')]}});
 worth(app.db,'sent');worth(app.db,'other');success(app.db,'sent');
 const root='http://127.0.0.1:'+((app.server.address() as any).port);
 const response=await(await fetch(root+'/api/jobs')).json();
 const other=response.items.find((x:any)=>x.job_id==='other');
 assert.equal(other.same_recruiter_communicated,true);
 assert.equal(other.communication_state,'NONE');
 assert.equal(other.communicated,false);
 assert.equal(response.summary.eligible,0);
 assert.ok(!JSON.stringify(response).includes('private-person-id'));
 assert.equal((await(await fetch(root+'/api/communications/candidates')).json()).total,0);
 assert.equal((await(await fetch(root+'/api/jobs/other')).json()).job.same_recruiter_communicated,true);
 const jsx=readFileSync(new URL('../web/antd-entry.jsx',import.meta.url),'utf8');
 assert.match(jsx,/same-recruiter-communicated/);assert.match(jsx,/同人已沟通/);
});
