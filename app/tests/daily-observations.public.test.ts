import test from 'node:test';
import assert from 'node:assert/strict';
import {openJobsDatabase,importList,getJobsDashboard} from '../db/ingestion/job-store.ts';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const make=(ids:string[],type=1)=>({code:0,zpData:{type,jobList:ids.map(jobId=>({encryptJobId:jobId,jobName:'合成岗位'}))}});
const day=stamp=>new Date(new Date(stamp).getTime()+8*3600000).toISOString().slice(0,10);
test('newly collected counts use first inclusion in local time and never count recaptured jobs as new',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 const today=day(new Date().toISOString());
 const yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 importList(db,make(['old','new-a','new-b']));
 // 23:30 UTC is the following local date, so this belongs to yesterday.
 const earlier=new Date(Date.parse(yesterday+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 db.prepare('UPDATE jobs SET first_seen_at=? WHERE job_id=?').run(earlier+'T23:30:00.000Z','old');
 importList(db,make(['old','new-a','new-b']));
 const dashboard=getJobsDashboard(db),latest=dashboard.days.at(-1);
 assert.equal(latest.collected,3);
 assert.equal(latest.newComparedYesterday,null);
 assert.equal(latest.newlyCollected,2);
 assert.equal(dashboard.days.find(d=>d.date===yesterday).newlyCollected,1);
 assert.equal(dashboard.days.reduce((n,d)=>n+d.newlyCollected,0),3);
});
test('same response hash same day dedups, identical response next day still observed',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 const sample=make(['a','b']);importList(db,sample);importList(db,sample);
 assert.equal(db.prepare('SELECT count(*) n FROM job_daily_observations').get().n,2);
 assert.equal(db.prepare('SELECT count(*) n FROM job_daily_batches').get().n,1);
 db.prepare("UPDATE job_daily_batches SET local_day='2026-10-21'").run();
 db.prepare("UPDATE job_daily_observations SET local_day='2026-10-21'").run();
 importList(db,sample);
 assert.equal(db.prepare('SELECT count(*) n FROM job_daily_observations').get().n,4);
 assert.equal(db.prepare('SELECT count(*) n FROM job_daily_batches').get().n,2);
 assert.equal(db.prepare('SELECT count(*) n FROM list_responses').get().n,1);
 assert.equal(getJobsDashboard(db).days.at(-1).collected,2);
});
test('daily difference across comparable scopes, and mismatch suppresses unreliable values',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 const today=day(new Date().toISOString());
 const yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 importList(db,make(['a','b','c']));
 importList(db,make(['b','d']));
 importList(db,make([],2));
 db.prepare('UPDATE job_daily_batches SET local_day=?').run(yesterday);
 db.prepare('UPDATE job_daily_observations SET local_day=?').run(yesterday);
 importList(db,make(['b','d','e']));
 importList(db,make(['c'],2));
 let d=getJobsDashboard(db).days.at(-1);
 assert.equal(d.collected,4);assert.equal(d.newComparedYesterday,null); // Cannot compare unproven capture scopes.
 importList(db,make(['f'],3));
 d=getJobsDashboard(db).days.at(-1);
 assert.equal(d.newComparedYesterday,null);
 assert.equal(d.scopeComparable,false);
});
test('migrate v6 source archive to incomplete historical evidence without inventing repeated imports',()=>{
 const dir=mkdtempSync(join(tmpdir(),'findwork-daily-')),path=join(dir,'data.sqlite');
 try{
  let db=openJobsDatabase(path);importList(db,make(['old-a','old-b']));
  const hash=db.prepare('SELECT source_hash FROM list_responses').get().source_hash;
  db.exec('DROP TABLE job_daily_observations; DROP TABLE job_daily_batches; PRAGMA user_version=6;');
  db.prepare("UPDATE list_responses SET imported_at='2026-10-22T15:59:00.000Z'").run();
  db.close();db=openJobsDatabase(path);
  const rows=db.prepare('SELECT local_day,job_id FROM job_daily_observations ORDER BY job_id').all();
  assert.deepEqual(rows.map(x=>x.job_id),['old-a','old-b']);
  assert.equal(rows[0].local_day,'2026-10-22');
  const archive=db.prepare('SELECT historical,source_hash FROM job_daily_batches').get();
  assert.equal(archive.historical,1);assert.equal(archive.source_hash,hash);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,7);
  db.close();db=openJobsDatabase(path);
  assert.equal(db.prepare('SELECT count(*) n FROM job_daily_batches').get().n,1);
  db.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
