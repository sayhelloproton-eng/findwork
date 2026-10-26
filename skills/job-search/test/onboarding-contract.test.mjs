import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const repo=path.resolve(import.meta.dirname,'../../..');
const read=rel=>fs.readFileSync(path.join(repo,rel),'utf8');
const readme=read('README.md');
const guide=read('GETTING_STARTED.md');
const skill=read('skills/job-search/SKILL.md');
const contract=read('skills/job-search/references/private-policy.md');

test('README starts with a compact AI onboarding link and concise sections',()=>{
 const url='https://github.com/sayhelloproton-eng/findwork/blob/main/GETTING_STARTED.md';
 const section=readme.split('### 如何使用\n')[1].split('\n### ')[0].trim();
 assert.ok(section.includes('**['+url+']('+url+')**'));
 assert.equal((readme.match(/https:\/\/github\.com\/sayhelloproton-eng\/findwork\/blob\/main\/GETTING_STARTED\.md/g)||[]).length,2);
 assert.ok(fs.existsSync(path.join(repo,'GETTING_STARTED.md')));
 assert.equal((readme.match(/^## /gm)||[]).length,0,'Do not use oversized second-level headings');
 assert.ok((readme.match(/^### /gm)||[]).length>=4);
 assert.ok(readme.length<1600,'Landing README should remain concise');
 assert.ok(readme.includes('| 入库与去重 |'));
});

test('onboarding uses confirmed three labels consistently with private inputs',()=>{
 for(const title of ['个人画像','求职偏好','排除条件']){
  for(const text of [readme,guide,skill,contract])
   assert.ok(text.includes(title),'MISSING_TERMINOLOGY '+title);
 }
 for(const file of ['candidate-profile.md','target-roles.md','exclusions.md']){
  const rel='.private/job-search/'+file;
  assert.ok(guide.includes(rel),'MISSING_PRIVATE_CONTRACT '+file);
  assert.ok(skill.includes(rel),'MISSING_SKILL_PRIVATE_CONTRACT '+file);
  assert.equal(execFileSync('git',['check-ignore',rel],{cwd:repo,encoding:'utf8'}).trim(),rel);
 }
 assert.doesNotMatch(readme,/个人喜好|个人不喜好/);
 assert.doesNotMatch(guide,/个人喜好|个人不喜好/);
});

test('AI guide describes staged usage, actual npm commands, and action boundaries',()=>{
 for(const phrase of ['先让用户理解','第 1 步','第 2 步','第 3 步','第 4 步','第 5 步','第 6 步','第 7 步',
 'npm ci','npm run verify','npm run demo','npm run jobs -- init',
 'npm run jobs -- import-list','npm run jobs -- import-detail','decide-ai','import-greet',
 '不得','回执']){
  assert.ok(guide.includes(phrase),'MISSING_GUIDE_STEP '+phrase);
 }
 const scripts=JSON.parse(read('package.json')).scripts;
 for(const k of ['verify','demo','jobs','start'])assert.ok(scripts[k]);
 assert.match(guide,/未经用户授权/);
 assert.match(guide,/不能访问用户电脑/);
 assert.match(guide,/岗位期望/);
 assert.match(guide,/只读得到本 GitHub 文件/);
 assert.match(guide,/AI 主执行，用户最少操作/);
 assert.match(guide,/先看现状，再决定动作/);
 assert.match(guide,/同一.*Chrome.*Profile/);
 assert.match(guide,/manifest\.json/);
 assert.match(guide,/⌘.*Shift.*G/);
 assert.match(guide,/粘贴/);
 assert.match(guide,/加载已解压的扩展程序/);
 assert.match(guide,/chrome-extension:\/\/<EXTENSION_ID>\/actions\/detail\/dom\.html\?auto=1/);
 assert.match(guide,/pages=1/);
 assert.match(guide,/不强制安装 Playwright/);
 assert.match(guide,/真实可访问的本地链接/);
 assert.match(guide,/用户仅完成必要的一次加载/);
 assert.match(guide,/手机 App 登录状态代替/);
 assert.match(guide,/platforms\/boss\/extension\/README\.md/);
 assert.ok(read('platforms/boss/extension/README.md').includes('https://www.zhipin.com/web/geek/jobs'));
 assert.match(guide,/一个当前目标的职位列表 Tab/);
 assert.match(guide,/dist\/boss-list-observer/);
 assert.match(guide,/同一个已登录的 Chrome 实例/);
 assert.match(guide,/Chrome Downloads 为/);
 assert.match(guide,/15\/15/);
});

test('relative Markdown links resolve and public landing page has no vendor brand',()=>{
 for(const doc of [readme,guide,read('AGENTS.md')]){
  for(const match of doc.matchAll(/\]\((\.\/[^)#]+\.md)\)/g)){
   assert.ok(fs.existsSync(path.resolve(repo,match[1])),'BROKEN_LINK '+match[1]);
  }
 }
 assert.doesNotMatch(readme,/BOSS|直聘|风控|逆向|伪造/);
 assert.match(guide,/禁止.*Playwright.*CDP/);
 assert.ok(guide.indexOf('禁止')<guide.indexOf('### 第 1 步'));
 assert.ok(read('AGENTS.md').includes('GETTING_STARTED.md'));
});
