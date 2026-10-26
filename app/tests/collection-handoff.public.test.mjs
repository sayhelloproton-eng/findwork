import test from 'node:test';import assert from 'node:assert/strict';
import {collectionParameters,collectionHandoff} from '../web/collection-handoff.mjs';
test('collection form rejects invalid expectation and page counts',()=>{
 assert.equal(collectionParameters(2,20).expectedCount,300);
 for(const [expect,pages] of [[0,1],[1,0],[1,22],[1,1.5],[null,20],['2',20]])assert.throws(()=>collectionParameters(expect,pages));
});
test('handoff ties input to actual start, handles midnight and directs AI to formal policies and ingestion',()=>{
 const prompt=collectionHandoff({repoRoot:'/synthetic/findwork',expect:2,pages:20,startedAt:'2026-10-26T16:01:00.000Z'});
 for(const s of ['BOSS/2026-10-27/list/','2026-10-26T16:01:00.000Z','求职期望序号 2','预计300条','skills/job-search/SKILL.md','skills/boss-extension/SKILL.md','candidate-profile.md','target-roles.md','exclusions.md','import-list','import-detail','decide-ai','不授权打招呼','不能把同一天所有旧文件都当本批','入库和评估完成分别举证'])assert.ok(prompt.includes(s),s);
 assert.match(collectionHandoff({repoRoot:'/synthetic/findwork',expect:1,pages:1}),/尚未确认启动/);assert.throws(()=>collectionHandoff({repoRoot:'',expect:1,pages:1}));
});
