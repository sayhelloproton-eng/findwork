import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const fixture=n=>fs.readFileSync(path.join(root,'test/fixtures',n),'utf8');
test('synthetic List and downloaded Detail match by business identity',()=>{
 const list=JSON.parse(fixture('list.json')),detail=JSON.parse(fixture('detail.json'));
 const ids=list.zpData.jobList.map(x=>x.encryptJobId);
 assert.equal(ids.length,1);assert.equal(new Set(ids).size,ids.length);
 assert.equal(list.code,0);assert.equal(detail.apiCode,0);
 assert.equal(detail.contract,'boss-natural-detail.v1');
 assert.equal(detail.rawResponse.code,0);
 assert.equal(detail.jobId,ids[0]);
 assert.equal(detail.rawResponse.zpData.jobInfo.encryptId,ids[0]);
 assert.equal(detail.rawResponse.zpData.jobInfo.jobName,list.zpData.jobList[0].jobName);
 assert.ok(detail.rawResponse.zpData.jobInfo.postDescription.trim());
});
test('DOM demo has exactly one link matching the target job ID',()=>{
 const id=JSON.parse(fixture('list.json')).zpData.jobList[0].encryptJobId;
 const html=fixture('job-card.html');
 const urls=[...html.matchAll(/href="(\/job_detail\/[^"]+\.html)"/g)].map(x=>x[1]);
 assert.equal(urls.length,2);
 assert.equal(urls.filter(u=>u==='/job_detail/'+id+'.html').length,1);
 assert.match(html,/job-card-box/);
});
test('synthetic samples contain no real account tokens',()=>{
 for(const name of ['list.json','detail.json','job-card.html']){
  const s=fixture(name);assert.match(s,/synthetic|虚构/);
  assert.doesNotMatch(s,/securityId|sessionId|Authorization|cookie/i);
 }
});
