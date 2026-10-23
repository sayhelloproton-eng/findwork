import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server/server.ts';
import {importList} from '../db/ingestion/job-store.ts';
import {renderJobRow,renderDetail} from '../web/job-view.js';
async function launch(t:any,options:any={demo:true}){const app=createApp(options);await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());return{app,base:`http://127.0.0.1:${(app.server.address() as any).port}`};}
const get=async(base:string,path='/api/jobs')=>fetch(base+path).then(r=>r.json());
test('demo is isolated from local data, preserves complete source facts and removes obsolete APIs',async t=>{
 const previous=process.env.BOSS_JOBS_DB_PATH;process.env.BOSS_JOBS_DB_PATH='/private/demo-must-not-use.sqlite';try{const{base}=await launch(t);const data=await get(base);assert.equal(data.total,15);assert.equal(data.demo,true);assert.ok(data.items.every((j:any)=>j.job_id.startsWith('demo-')));assert.ok(data.items.some((j:any)=>j.facts.company_introduction));for(const p of['/api/resumes','/api/personal-info','/api/baselines','/api/personal-profile'])assert.equal((await fetch(base+p)).status,404);}finally{if(previous===undefined)delete process.env.BOSS_JOBS_DB_PATH;else process.env.BOSS_JOBS_DB_PATH=previous;}
});
test('HTTP exposes four decisions, binary communication, keyword and location filters',async t=>{
 const{base}=await launch(t);const candidates=await get(base,'/api/jobs?candidates=true');assert.equal(candidates.total,2);assert.ok(candidates.items.every((j:any)=>j.eligible));
 for(const status of ['PENDING','WORTH','PASS'])assert.ok((await get(base,'/api/jobs?status='+status)).items.every((j:any)=>status==='PENDING'?['PENDING','NEED_DETAIL'].includes(j.screening_status):j.screening_status===status));
 assert.equal((await get(base,'/api/jobs?communicated=true')).total,1);assert.ok((await get(base,'/api/jobs?location=徐汇')).items.every((j:any)=>j.facts.district==='徐汇区'));
 assert.equal((await fetch(base+'/api/jobs?limit=abc')).status,400);assert.equal((await fetch(base+'/api/jobs/missing')).status,404);
 const html=await fetch(base).then(r=>r.text());assert.match(html,/岗位工作台/);assert.match(html,/antd-entry\.js/);assert.equal((await fetch(base+'/db/boss-jobs.sql')).status,404);
});
test('AI decision POST requires current source hash, preserves decisions and refuses stale edits',async t=>{
 const{base}=await launch(t);const row=(await get(base,'/api/jobs?status=PASS')).items[0];const path='/api/jobs/'+row.job_id+'/decision';
 const patch=(data:any)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 const saved=await patch({status:'WORTH',reason:'合成AI判断：职责相关',expectedRevision:row.revision,expectedSourceHash:row.decision_basis.hash});assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.decision_source,'SKILL');assert.equal(result.screening_reason,'合成AI判断：职责相关');
 assert.equal((await patch({status:'PASS',reason:'过期编辑',expectedRevision:row.revision,expectedSourceHash:row.decision_basis.hash})).status,409);
 assert.equal((await patch({status:'PASS',reason:''})).status,400);
 const latest=await get(base,'/api/jobs/'+row.job_id);assert.equal((await patch({status:'WORTH',reason:'只改理由',expectedRevision:latest.job.revision,expectedSourceHash:latest.job.decision_basis.hash})).status,200);const record=await get(base,'/api/jobs/'+row.job_id);assert.equal(record.job.screening_status,'WORTH');assert.equal(record.job.screening_reason,'只改理由');assert.equal(record.job.communicated,row.communicated);
});
test('POST decision rejects cross-origin requests, wrong media types and malformed payloads',async t=>{
 const{base}=await launch(t);const path=base+'/api/jobs/demo-01/decision';
 assert.equal((await fetch(path,{method:'POST',headers:{origin:'https://example.invalid','content-type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(path,{method:'POST',body:'{}'})).status,415);
 for(const body of['invalid','[]','null','{"priority":100}'])assert.equal((await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body})).status,400);
 assert.equal((await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({reason:'x'.repeat(17000)})})).status,413);
 assert.equal((await fetch(base+'/api/jobs',{method:'POST',body:'{}'})).status,405);
});
test('manual judgment survives persistent server reopen and normal app starts without demo',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jobs-web-')),path=join(dir,'jobs.sqlite');let app:any;
 async function start(){app=createApp({dbPath:path});await new Promise<void>(r=>app.server.listen(0,'127.0.0.1',r));return`http://127.0.0.1:${app.server.address().port}`;}
 try{let base=await start();assert.equal((await get(base)).total,0);importList(app.db,{code:0,zpData:{jobList:[{encryptJobId:'synthetic-persist',jobName:'Synthetic'}]}});
 const before=(await get(base,'/api/jobs/synthetic-persist')).job;
 assert.equal((await fetch(base+'/api/jobs/synthetic-persist/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:'PASS',reason:'合成排除原因',expectedRevision:before.revision,expectedSourceHash:before.decision_basis.hash})})).status,200);await app.close();app=null;
 base=await start();assert.equal((await get(base)).demo,false);assert.equal((await get(base)).items[0].screening_reason,'合成排除原因');}finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true});}
});
test('business rendering shows merged facts and hides raw JSON, scores and internal action states',async t=>{
 const{base}=await launch(t);const data=await get(base);const pass=data.items.find((j:any)=>j.screening_status==='PASS'),unknown=data.items.find((j:any)=>j.communication_state==='UNKNOWN');
 assert.match(renderJobRow(pass),/PASS/);assert.match(renderJobRow(unknown),/未沟通/);assert.doesNotMatch(renderJobRow(unknown),/UNKNOWN|IN_FLIGHT|action_id|匹配分数/);
 const full=await get(base,'/api/jobs/demo-01');const html=renderDetail(full);assert.match(html,/完整职位描述/);assert.match(html,/示例公司/);assert.match(html,/五险一金/);assert.doesNotMatch(html,/List 字段|详情字段|rawResponse/);
 full.job.facts.job_name='<script>untrusted</script>';assert.doesNotMatch(renderDetail(full),/<script>/);assert.match(renderDetail(full),/&lt;script&gt;/);
});

test('independent formal application needs proof, not Greet',async t=>{
 const{base}=await launch(t);
 const row=(await get(base,'/api/jobs?status=PASS')).items[0];
 const path='/api/jobs/'+row.job_id+'/application';
 const receipt={contract:'job-application-result.v1',kind:'RESUME_SUBMISSION',
 actionId:'synthetic-application-'+row.job_id,finishedAt:'2026-10-23T04:00:00Z',
 result:'SUCCESS',confirmed:true,receipt:{kind:'SYNTHETIC_TEST'}};
 const send=(body:any)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await send({...receipt,confirmed:false})).status,400);
 assert.equal((await send(receipt)).status,200);
 const updated=(await get(base,'/api/jobs/'+row.job_id)).job;
 assert.equal(updated.application_state,'SUCCEEDED');
 assert.equal(updated.communication_state,row.communication_state);
});
