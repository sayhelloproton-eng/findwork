import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/server.ts';
import {resolveSelectedCandidateJobs} from '../web/communication-selection.mjs';
import {openJobsDatabase,importList,getJobsDashboard} from '../db/ingestion/job-store.ts';
import {writeFileSync,readFileSync,rmSync,mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';import {tmpdir} from 'node:os';
const listing=(ids,type=1)=>({code:0,zpData:{type,jobList:ids.map(id=>({encryptJobId:id,jobName:'Synthetic',securityId:'PRIVATE'}))}});
test('HTML API only emits presentation fields and cannot accept arbitrary application success',async t=>{
 const a=createApp({demo:true});await new Promise(r=>a.server.listen(0,'127.0.0.1',r));t.after(()=>a.close());
 const url='http://127.0.0.1:'+a.server.address().port;
 const all=await(await fetch(url+'/api/jobs')).json();assert.equal(all.total,15);
 const raw=JSON.stringify(all);
 for(const k of ['securityId','encryptBossId','list_json','greet_raw_json','list_source'])
  assert.ok(!raw.includes('"'+k+'"'),k);
 const id=all.items[0].job_id;
 const detail=await(await fetch(url+'/api/jobs/'+id)).json();assert.ok(!JSON.stringify(detail).includes('"securityId"'));
 const resp=await fetch(url+'/api/jobs/'+id+'/application',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({result:'SUCCESS',confirmed:true,receipt:{x:1}})});
 assert.equal(resp.status,405);
});
test('cross-page candidate copy resolves only currently eligible selected IDs in user order',async()=>{
 const items=Array.from({length:125},(_,i)=>({job_id:'job-'+i,eligible:true}));
 const read=async url=>{const offset=Number(new URL(url,'http://local').searchParams.get('offset')||0);return{total:125,items:items.slice(offset,offset+100)};};
 assert.deepEqual((await resolveSelectedCandidateJobs(['job-120','job-2'],read)).map(x=>x.job_id),['job-120','job-2']);
 await assert.rejects(()=>resolveSelectedCandidateJobs(['job-120','invalid'],read),/SELECTION_STALE/);
});
test('missing collection provenance is noncomparable; verified original + scope uses capture day',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());importList(db,listing(['a']));
 assert.equal(getJobsDashboard(db).days.at(-1).coverage,'historical-partial');
 const tmp=mkdtempSync(join(tmpdir(),'fw-provenance-'));t.after(()=>rmSync(tmp,{recursive:true,force:true}));
 const captured=new Date().toISOString();
 const original={...listing(['b']),capturedAt:captured,collectionScope:{expectIndex:1,queryFingerprint:'abcdef0123456789'}};
 const path=join(tmp,'capture.json');writeFileSync(path,JSON.stringify(original));
 importList(db,original,{source:path,sourceHash:createHash('sha256').update(readFileSync(path)).digest('hex')});
 assert.equal(db.prepare('SELECT count(*) n FROM job_daily_batches WHERE historical=0').get().n,1);
});
