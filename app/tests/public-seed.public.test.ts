import test from 'node:test';
import assert from 'node:assert/strict';
import {openJobsDatabase,queryJobs} from '../db/ingestion/job-store.ts';
import {seedDatabase} from '../server/seed.ts';
test('public demo uses 15 synthetic jobs, 11 complete details and clearly simulated decisions',()=>{
 const db=openJobsDatabase(':memory:');try{seedDatabase(db);const r=queryJobs(db);assert.equal(r.total,15);assert.equal(r.items.filter((j:any)=>j.has_detail).length,11);assert.equal(r.items.filter((j:any)=>j.facts.closed).length,2);assert.ok(r.items.every((j:any)=>j.job_id.startsWith('demo-')&&j.decision_source==='DEMO'));assert.equal(r.items.filter((j:any)=>j.eligible).length,2);}finally{db.close();}
});
