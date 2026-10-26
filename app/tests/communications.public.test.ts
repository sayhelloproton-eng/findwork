import test from 'node:test';
import assert from 'node:assert/strict';
import {openJobsDatabase,importList,importDetail,queryJobs,decideJob,importGreet,getJob} from '../db/ingestion/job-store.ts';
import {getCommunicationCandidates,getTodayCommunications,reserveCommunicationBatch,checkCommunicationSend,reconcileUnlaunchedCommunicationBatch,retryCommunication} from '../server/communications.ts';

const list=(id:string)=>({code:0,zpData:{jobList:[{encryptJobId:id,securityId:'security-'+id,jobName:'合成前端工程师',salaryDesc:'20-30K',cityName:'上海',brandName:'合成公司'}]}});
const worth=(db:any,id:string)=>decideJob(db,{jobId:id,status:'WORTH',reason:'职责合成匹配'});
test('communication candidate education priority is global across pages, Detail wins, and other worktables stay unchanged',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 const degrees=[...Array(19).fill('本科'),...Array(5).fill('学历不限'),...Array(4).fill('大专')];
 const payload={code:0,zpData:{jobList:degrees.map((degree,i)=>({
  encryptJobId:'education-priority-'+String(i).padStart(2,'0'),
  securityId:'synthetic-'+i,jobName:'合成岗位 '+i,brandName:'合成公司',jobDegree:degree,
  bossOnline:i===25
 }))}};
 importList(db,payload);
 for(const row of payload.zpData.jobList)worth(db,row.encryptJobId);
 // List can be stale about degree. Actual Detail = unrestricted and must rank ahead of bachelors.
 const target='education-priority-00';
 importDetail(db,{jobId:target,rawResponse:{code:0,zpData:{jobInfo:{
  encryptId:target,jobName:'合成岗位 0',postDescription:'Synthetic engineering role, bachelor or unrestricted',
  degreeName:'学历不限',invalidStatus:false,jobStatusDesc:'招聘中'
 }}}});
 const p1=getCommunicationCandidates(db,{limit:20,offset:0});
 const p2=getCommunicationCandidates(db,{limit:20,offset:20});
 const all=[...p1.items,...p2.items];
 assert.equal(p1.total,28);assert.equal(p2.total,28);
 assert.equal(all.length,28);
 assert.equal(new Set(all.map(j=>j.job_id)).size,28);
 const rank=job=>/大专|专科/.test(job.facts.education)?0:/不限|无要求|不限制/.test(job.facts.education)?1:/本科/.test(job.facts.education)?2:3;
 assert.deepEqual(all.map(rank),[...Array(4).fill(0),...Array(6).fill(1),...Array(18).fill(2)]);
 assert.equal(all[0].job_id,'education-priority-25','online job is first within its priority group');
 assert.equal(all.findIndex(j=>j.job_id===target)<10,true,'Detail override is effective');
 const defaultJobOrder=queryJobs(db,{sort:'recommended',limit:28}).items.map(j=>j.job_id);
 assert.notDeepEqual(defaultJobOrder,all.map(j=>j.job_id),'default worktable ordering not modified');
 assert.deepEqual(getTodayCommunications(db).items,[],'today-success ordering untouched');
});
test('communication module has separate candidate and today queries',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 importList(db,list('candidate'));importList(db,list('other'));worth(db,'candidate');
 assert.equal(getCommunicationCandidates(db).total,1);
 assert.equal(getTodayCommunications(db).total,0);
 const b=reserveCommunicationBatch(db,{jobIds:['candidate']});
 assert.equal(b.accepted,1);
 assert.equal(getCommunicationCandidates(db).total,0);
 assert.equal(checkCommunicationSend(db,b.items[0]).allowed,true);
 assert.throws(()=>reserveCommunicationBatch(db,{jobIds:['candidate']}),/GREET_BLOCKED/);
 assert.equal(getTodayCommunications(db).total,0);
});
test('invalid and unapproved batch selection is atomic and cannot bypass quota or duplicate ids',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 importList(db,list('a'));importList(db,list('b'));worth(db,'a');
 assert.throws(()=>reserveCommunicationBatch(db,{jobIds:['a','b']}),/GREET_BLOCKED/);
 assert.equal(getJob(db,'a').communication_state,'NONE');
 assert.throws(()=>reserveCommunicationBatch(db,{jobIds:['a','a']}),/INVALID_BATCH/);
 assert.throws(()=>reserveCommunicationBatch(db,{jobIds:[]}),/INVALID_BATCH/);
 assert.throws(()=>reserveCommunicationBatch(db,{jobIds:Array(151).fill('a')}),/INVALID_BATCH/);
});

test('HTTP communication endpoints provide independent read models and persist a verified successful greeting',async t=>{
 const {createApp}=await import('../server/server.ts');
 const app=createApp({dbPath:':memory:'});
 t.after(()=>app.close());
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 importList(app.db,list('remote'));worth(app.db,'remote');
 const get=async p=>fetch(base+p).then(r=>r.json());
 assert.equal((await fetch(base+'/communications')).status,200);
 assert.equal((await get('/api/communications/candidates')).total,1);
 assert.equal((await get('/api/communications/today')).total,0);
 const post=async(path,payload,origin=base)=>fetch(base+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload)});
 assert.equal((await post('/api/communications/batch',{jobIds:['remote']},'https://attacker.invalid')).status,403);
 assert.equal((await get('/api/communications/candidates')).total,1);
 const batchResponse=await post('/api/communications/batch',{jobIds:['remote']});
 assert.equal(batchResponse.status,200);const batch=await batchResponse.json();
 assert.equal(batch.items.length,1);
 const {jobId,actionId}=batch.items[0];
 assert.equal((await get('/api/communications/check?jobId='+jobId+'&actionId='+actionId)).allowed,true);
 const start=new Date(Date.now()+200).toISOString(),end=new Date(Date.now()+500).toISOString();
 const receipt={contract:'boss-greet-result.v1',jobId,endpoint:'/wapi/zpgeek/friend/add.json',
   method:'POST',startedAt:start,finishedAt:end,result:'SUCCESS',httpStatus:200,response:{code:0}};
 const ext='chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
 assert.equal((await post('/api/communications/receipt',{actionId,receipt,downloadComplete:true},ext)).status,405);
 assert.equal((await get('/api/communications/today')).total,0);
 // Manual AI import is triggered only after the downloaded JSON was independently verified.
 const imported=importGreet(app.db,receipt,{source:'synthetic-downloaded-file.json',requireClaim:true},jobId);
 assert.equal(imported.communication_state,'SUCCEEDED');
 assert.equal((await get('/api/communications/today')).total,1);
 assert.equal((await get('/api/communications/today')).items[0].job_id,jobId);
 assert.equal((await get('/api/communications/candidates')).total,0);
});

test('strict CLI-only reconciliation releases only exactly proven unlaunched claims',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 importList(db,list('reconcile-one'));importList(db,list('reconcile-two'));worth(db,'reconcile-one');worth(db,'reconcile-two');
 const reserved=reserveCommunicationBatch(db,{jobIds:['reconcile-one','reconcile-two']});
 const first=reserved.items[0],second=reserved.items[1];
 const firstRow=getJob(db,first.jobId),secondRow=getJob(db,second.jobId);
 const make=()=>({contract:'findwork.unlaunched-greet-reconciliation.v1',apply:false,
  items:[{jobId:first.jobId,actionId:first.actionId,claimedAt:firstRow.claimed_at}],
  evidence:{queueIdle:true,unknownSideEffects:0,receiptMatches:0,operatorVerified:true,checkedAt:new Date().toISOString()}});
 const request=make();
 assert.throws(()=>reconcileUnlaunchedCommunicationBatch(db,{...request,evidence:{}}),/UNLAUNCHED_EVIDENCE_REQUIRED/);
 assert.throws(()=>reconcileUnlaunchedCommunicationBatch(db,{...request,items:[{...request.items[0],actionId:second.actionId}]}),/RECONCILIATION_STATE_CHANGED/);
 assert.equal(reconcileUnlaunchedCommunicationBatch(db,request).released,0);
 assert.equal(getJob(db,first.jobId).communication_state,'IN_FLIGHT');
 assert.equal(reconcileUnlaunchedCommunicationBatch(db,{...request,apply:true}).released,1);
 assert.equal(getJob(db,first.jobId).communication_state,'NONE');
 assert.equal(getJob(db,first.jobId).action_id,null);
 assert.equal(getJob(db,second.jobId).communication_state,'IN_FLIGHT');
 assert.throws(()=>reconcileUnlaunchedCommunicationBatch(db,{...request,apply:true}),/RECONCILIATION_STATE_CHANGED/);
});

test('daily quota excludes failed attempts and reserves in-flight capacity independently',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 const ids=Array.from({length:155},(_,i)=>'failed-quota-'+i);
 importList(db,{code:0,zpData:{jobList:ids.map(encryptJobId=>({encryptJobId,jobName:'合成失败岗位'}))}});
 db.prepare("UPDATE jobs SET communication_state='FAILED',claimed_at=?").run(new Date().toISOString());
 importList(db,list('quota-available'));worth(db,'quota-available');
 const result=reserveCommunicationBatch(db,{jobIds:['quota-available']});
 assert.equal(result.usedBefore,0);assert.equal(result.reservedBefore,0);assert.equal(result.quota,150);
});
test('explicit reminder retry is idempotent, preserves prior event evidence and permits a new successful receipt',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());importList(db,list('retry-reminder'));worth(db,'retry-reminder');
 reserveCommunicationBatch(db,{jobIds:['retry-reminder']});
 const stamp=new Date().toISOString();
 importGreet(db,{contract:'boss-greet-result.v1',jobId:'retry-reminder',method:'POST',endpoint:'/wapi/zpgeek/friend/add.json',startedAt:stamp,finishedAt:stamp,result:'FAILED',httpStatus:200,response:{code:1,message:'开聊提醒',zpData:{bizData:{chatRemindDialog:{blockLevel:0,title:'温馨提示',content:'请确认提醒'}}}}});
 const previous=getJob(db,'retry-reminder');
 const retried=retryCommunication(db,{jobId:'retry-reminder',finishedAt:stamp});assert.equal(checkCommunicationSend(db,retried).allowed,true);
 assert.deepEqual(retryCommunication(db,{jobId:'retry-reminder',finishedAt:stamp}),retried);
 assert.equal(db.prepare("SELECT count(*) n FROM job_events WHERE event_type='GREET_RETRY_AUTHORIZED' AND source_hash=?").get(previous.greet_source_hash).n,1);
 const after=new Date().toISOString();importGreet(db,{contract:'boss-greet-result.v1',jobId:'retry-reminder',method:'POST',endpoint:'/wapi/zpgeek/friend/add.json',startedAt:after,finishedAt:after,result:'SUCCESS',httpStatus:200,response:{code:0}});
 assert.equal(getJob(db,'retry-reminder').communication_state,'SUCCEEDED');
 assert.equal(importGreet(db,JSON.parse(previous.greet_raw_json)).communication_state,'SUCCEEDED','previous imported failure must not overwrite or block reading the new success');
 assert.throws(()=>retryCommunication(db,{jobId:'retry-reminder',finishedAt:stamp}),/RETRY_NOT_ALLOWED/);
});
test('closed jobs cannot retry; previous platform quota rejection permits an explicit retry below150 successes',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 for(const [id,response] of [['closed-retry',{code:1,message:'该职位已不存在'}],['capped-retry',{code:1,message:'开聊提醒',zpData:{bizData:{chatRemindDialog:{blockLevel:0,title:'已达到沟通上限',content:'明天再来'}}}}]]){
  importList(db,list(id));worth(db,id);reserveCommunicationBatch(db,{jobIds:[id]});const stamp=new Date().toISOString();
  importGreet(db,{contract:'boss-greet-result.v1',jobId:id,method:'POST',endpoint:'/wapi/zpgeek/friend/add.json',startedAt:stamp,finishedAt:stamp,result:'FAILED',httpStatus:200,response});
  if(id==='closed-retry'){assert.throws(()=>retryCommunication(db,{jobId:id,finishedAt:stamp}),/RETRY_NOT_ALLOWED/);assert.equal(getJob(db,id).communication_state,'FAILED');}
  else{assert.equal(retryCommunication(db,{jobId:id,finishedAt:stamp}).jobId,id);assert.equal(getJob(db,id).communication_state,'IN_FLIGHT');}
 }
});
