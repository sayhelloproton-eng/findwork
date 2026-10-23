import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const repo=path.resolve(import.meta.dirname,'../../..');
const skill=path.join(repo,'skills/job-search');
const read=p=>fs.readFileSync(path.join(repo,p),'utf8');
const root=read('skills/job-search/SKILL.md');
const privateDoc=read('skills/job-search/references/private-policy.md');
const evaluation=read('skills/job-search/references/evaluation.md');

test('AI Skill names all three private policy sources as mandatory prerequisites',()=>{
 assert.match(root,/name: job-search/);
 for(const file of ['candidate-profile.md','target-roles.md','exclusions.md']){
  const rel='.private/job-search/'+file;
  assert.ok(root.includes(rel),rel);
  assert.ok(privateDoc.includes(rel),rel);
  assert.ok(fs.existsSync(path.join(skill,'references',file)),file);
  const ignored=execFileSync('git',['check-ignore',rel],{cwd:repo,encoding:'utf8'}).trim();
  assert.equal(ignored,rel);
 }
 assert.match(root,/缺失/);
 assert.match(root,/不写 WORTH\/PASS/);
 assert.match(privateDoc,/用户确认/);
});

test('common workflow sequences platform capture, ingestion, assessment, decision and authorized receipt',()=>{
 for(const term of ['List','Detail','import-list','import-detail','existing','updated',
  'NEED_DETAIL','decision_stale','decide-ai','expectedRevision','expectedSourceHash',
  'claim','import-greet','communication_state','授权','去重']){
  assert.ok(root.includes(term),term);
 }
 assert.ok(root.indexOf('import-list') < root.indexOf('decide-ai'));
 assert.ok(root.indexOf('decide-ai') < root.indexOf('import-greet'));
 assert.match(root,/不负责投递后的/);
});

test('public policy documents are generic, cross-platform and do not embed private user preferences',()=>{
 for(const name of ['candidate-profile','target-roles','exclusions']){
  const ref=read('skills/job-search/references/'+name+'.md');
  assert.ok(ref.includes('.private/job-search/'+name+'.md'));
  assert.ok(!/真实姓名|私人电话号码|身份证号|真实邮箱地址|个人简历全文/.test(ref));
 }
 assert.ok(evaluation.includes('个人画像')||evaluation.includes('简历'));
 assert.match(evaluation,/求职偏好/);
 assert.match(evaluation,/排除条件/);
 assert.match(root,/目前只有 BOSS/);
});

test('all Skill references are real and no retired system docs referenced',()=>{
 for(const f of ['database.md','boss-workflow.md','candidate-profile.md','target-roles.md',
 'exclusions.md','evaluation.md','private-policy.md']){
  assert.ok(fs.existsSync(path.join(skill,'references',f)),f);
  assert.ok(root.includes(f),f);
 }
 assert.doesNotMatch(root+read('skills/job-search/references/boss-workflow.md'),/app\/JOB-SYSTEM\.md|extensions\/boss-list-observer\/skills/);
 assert.ok(fs.existsSync(path.join(repo,'skills/boss-extension/SKILL.md')));
 assert.ok(fs.existsSync(path.join(repo,'app/db/ingestion/job-store.ts')));
});
