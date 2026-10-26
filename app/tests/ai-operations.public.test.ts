import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,existsSync,rmSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
import {openJobsDatabase,importList,decideJob,claimGreet,getCommunicationQuota} from '../db/ingestion/job-store.ts';
import {runJobCommand} from '../server/job-cli.ts';import {checkCommunicationSend} from '../server/communications.ts';
import {readReservationOutcome,reservationFailureMessage} from '../web/communication-recovery.mjs';
import {compatibleBossExtension} from '../web/greet-launch.mjs';
test('help, unknown commands and status on absent DB never create a database',()=>{
 const dir=mkdtempSync(join(tmpdir(),'findwork-ai-help-')),dbPath=join(dir,'not-created','jobs.sqlite');
 try{for(const cmd of ['--help','status','unknown-command']){
  const r=spawnSync(process.execPath,['app/server/job-cli.ts',cmd],{encoding:'utf8',env:{...process.env,FINDWORK_DB_PATH:dbPath}});
  assert.equal(r.status,cmd==='unknown-command'?1:0,r.stderr);assert.equal(existsSync(join(dir,'not-created')),false);
 }}finally{rmSync(dir,{recursive:true,force:true});}
});
test('CLI and HTTP pre-send gates agree on150 confirmed successes',t=>{
 const db=openJobsDatabase(':memory:');t.after(()=>db.close());
 importList(db,{code:0,zpData:{jobList:Array.from({length:151},(_,i)=>({encryptJobId:'quota-unified-'+i,jobName:'Synthetic',securityId:'synthetic'}))}});
 decideJob(db,{jobId:'quota-unified-150',status:'WORTH',reason:'Synthetic'});claimGreet(db,{jobId:'quota-unified-150',actionId:'synthetic-action'});
 db.prepare("UPDATE jobs SET communication_state='SUCCEEDED',greet_confirmed_at=? WHERE job_id<>'quota-unified-150'").run(new Date().toISOString());
 const input={jobId:'quota-unified-150',actionId:'synthetic-action'};
 assert.throws(()=>runJobCommand(db,'check-greet',JSON.stringify(input)),/DAILY_COMMUNICATION_LIMIT/);
 assert.throws(()=>checkCommunicationSend(db,input),/DAILY_COMMUNICATION_LIMIT/);
 assert.equal(getCommunicationQuota(db).succeeded,150);
});
test('lost reservation response is read back without declaring unconfirmed jobs unclaimed or retrying',async()=>{
 const calls=[];const outcome=await readReservationOutcome(['claimed','settled','no-record','offline'],async url=>{calls.push(url);if(url.endsWith('offline'))throw Error('OFFLINE');return{job:{communication_state:url.endsWith('claimed')?'IN_FLIGHT':url.endsWith('settled')?'SUCCEEDED':'NONE'}};});
 assert.deepEqual(outcome,{claimed:1,recorded:1,unconfirmed:2});
 assert.match(reservationFailureMessage(outcome),/不能视为未领取/);assert.ok(calls.every(p=>p.startsWith('/api/jobs/')));
});
test('extension ID alone or old protocol cannot authorize reservation',()=>{
 const base={extensionId:'a'.repeat(32),protocolVersion:2,capabilities:['greet-enqueue','queue-observation','pre-send-check','manual-retry','clear-completed']};
 assert.equal(compatibleBossExtension(base),true);assert.equal(compatibleBossExtension({extensionId:base.extensionId}),false);assert.equal(compatibleBossExtension({...base,protocolVersion:1}),false);assert.equal(compatibleBossExtension({...base,capabilities:['greet-enqueue']}),false);
});
