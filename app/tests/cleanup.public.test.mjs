import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {openJobsDatabase,importList,importDetail,importGreet} from '../db/ingestion/job-store.ts';

test('undetailed cleanup removes uncontacted only after durable backup, including restricting events',()=>{
 const dir=mkdtempSync(join(tmpdir(),'findwork-prune-test-'));
 const dbPath=join(dir,'jobs.sqlite'),backupDir=join(dir,'backups');
 try{
  const db=openJobsDatabase(dbPath);
  importList(db,{code:0,zpData:{jobList:['drop','contact','detail'].map(encryptJobId=>({encryptJobId,jobName:'合成岗位'}))}});
  importDetail(db,{jobId:'detail',rawResponse:{code:0,zpData:{jobInfo:{encryptId:'detail',jobName:'合成岗位',postDescription:'有效 JD'}}}});
  importGreet(db,{contract:'boss-greet-result.v1',jobId:'contact',endpoint:'/wapi/zpgeek/friend/add.json',method:'POST',startedAt:'2026-10-23T00:00:00Z',finishedAt:'2026-10-23T00:00:01Z',result:'SUCCESS',httpStatus:200,response:{code:0}});
  db.close();
  const env={...process.env,FINDWORK_DB_PATH:dbPath,FINDWORK_BACKUP_DIR:backupDir};
  const run=(mode,...args)=>JSON.parse(execFileSync('node',['scripts/cleanup-undetailed.mjs',mode,...args],{encoding:'utf8',env}));
  const preview=run('preview');
  assert.equal(preview.count,1);assert.equal(preview.protectedCount,1);
  const result=run('apply',preview.fingerprint);
  assert.equal(result.removed,1);assert.equal(result.remainingCandidates,0);
  assert.ok(existsSync(result.backupPath)&&existsSync(result.auditPath));
  const check=new DatabaseSync(dbPath,{readOnly:true});
  assert.deepEqual(check.prepare('SELECT job_id FROM jobs ORDER BY job_id').all().map(x=>x.job_id),['contact','detail']);
  assert.equal(check.prepare('PRAGMA foreign_key_check').all().length,0);
  check.close();
  const backup=new DatabaseSync(result.backupPath,{readOnly:true});
  assert.equal(backup.prepare('SELECT count(*) n FROM jobs').get().n,3);
  assert.equal(backup.prepare("SELECT count(*) n FROM job_events WHERE job_id='drop'").get().n,1);
  backup.close();
 }finally{rmSync(dir,{recursive:true,force:true});}
});
