import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCommunicationAiPrompt} from '../web/communication-ai-prompt.mjs';
const jobs=Array.from({length:20},(_,i)=>({job_id:'boss-job-'+String(i).padStart(3,'0'),eligible:true,
 facts:{job_name:'测试岗位 '+i,brand_name:'合成公司 '+i},list:{securityId:'PRIVATE_SECURITY_VALUE'}}));
test('twenty selected jobs generate precisely twenty explicit authorizations without security IDs',()=>{
 const prompt=makeCommunicationAiPrompt(jobs,jobs.map(j=>j.job_id));
 assert.match(prompt,/以下 20 个岗位/);
 assert.equal((prompt.match(/jobId=boss-job-/g)||[]).length,20);
 assert.match(prompt,/1\. jobId=boss-job-000/);
 assert.match(prompt,/20\. jobId=boss-job-019/);
 assert.match(prompt,/不授权简历提交/);assert.match(prompt,/禁止通过 Playwright\/CDP/);
 assert.match(prompt,/逐条核验/);
 assert.match(prompt,/导入数据库/);
 assert.match(prompt,/不允许替换、扩充或重复投递/);
 assert.doesNotMatch(prompt,/PRIVATE_SECURITY_VALUE|securityId/);
});
test('refuses empty, duplicate, unknown, and stale selections',()=>{
 assert.throws(()=>makeCommunicationAiPrompt(jobs,[]),/NO_VALID_SELECTED_JOBS/);
 assert.throws(()=>makeCommunicationAiPrompt(jobs,[jobs[0].job_id,jobs[0].job_id]),/NO_VALID_SELECTED_JOBS/);
 assert.throws(()=>makeCommunicationAiPrompt(jobs,['missing-job']),/SELECTION_STALE/);
 assert.throws(()=>makeCommunicationAiPrompt([{...jobs[0],eligible:false}],[jobs[0].job_id]),/SELECTION_STALE/);
});

test('true real-style encrypted job ID remains byte-for-byte unchanged',()=>{
 const id='rnt_RnT-ab12~nrt';
 const p=makeCommunicationAiPrompt([{job_id:id,eligible:true,facts:{job_name:'合成岗位',brand_name:'合成公司'}}],[id]);
 assert.ok(p.includes('jobId='+id+'｜'));
});
