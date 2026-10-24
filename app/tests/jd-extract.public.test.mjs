import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJD,planJDExtraction} from '../../scripts/jd-extract.mjs';
import {openJobsDatabase,importList,importDetail} from '../db/ingestion/job-store.ts';
test('source-extractive parser uses only original section text and never invents',()=>{
 const jd='岗位职责\n1. 独立建设 AI Workflow 平台\n2. 负责 React 前端\n任职要求\n1. 熟悉 TypeScript\n2. 熟悉 Agent 开发\n加分项\n1. 有 MCP 经验';
 const s=extractJD('AI 工程师',jd);
 assert.ok(s.headline.startsWith('原文摘录｜'));
 assert.deepEqual(s.responsibilities,['独立建设 AI Workflow 平台','负责 React 前端']);
 assert.deepEqual(s.requirements,['熟悉 TypeScript','熟悉 Agent 开发']);
 assert.deepEqual(s.bonus,['有 MCP 经验']);
 assert.equal(s.notices.length,0);
 assert.equal(extractJD('不明确岗位','全都是无结构的文字'),null);
});
test('date-scoped preview excludes missing and previously summarized jobs',()=>{
 const db=openJobsDatabase(':memory:');
 try{
  importList(db,{code:0,zpData:{jobList:[{encryptJobId:'x',jobName:'示例',cityName:'上海'}]}});
  importDetail(db,{jobId:'x',rawResponse:{code:0,zpData:{jobInfo:{encryptId:'x',jobName:'示例',postDescription:'岗位职责\n独立开发前端\n任职要求\n精通 JS'}}}});
  const date=db.prepare("SELECT date(first_seen_at,'+8 hours') day FROM jobs").get().day;
  const plan=planJDExtraction(db,date);
  assert.equal(plan.eligible,1);assert.equal(plan.extractable,1);assert.equal(plan.items[0].summary.requirements[0],'精通 JS');
 }finally{db.close();}
});
