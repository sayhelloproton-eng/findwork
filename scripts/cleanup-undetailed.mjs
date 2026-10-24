// Preview is read-only. Apply requires a fingerprint of the current candidate IDs.
import {DatabaseSync,backup} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {resolve,join} from 'node:path';
const source=resolve(process.env.FINDWORK_DB_PATH||'app/db/runtime/jobs.sqlite');
const backupDir=resolve(process.env.FINDWORK_BACKUP_DIR||'app/db/runtime/backups');
const mode=process.argv[2]||'preview';
if(!['preview','apply'].includes(mode))throw Error('INVALID_MODE');
const db=new DatabaseSync(source);
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
const selection="SELECT j.job_id FROM jobs j LEFT JOIN job_details d ON d.job_id=j.job_id WHERE (d.jd_text IS NULL OR trim(d.jd_text)='') AND j.communication_state<>'SUCCEEDED' AND j.application_state<>'SUCCEEDED' ORDER BY j.job_id";
const ids=()=>db.prepare(selection).all().map(r=>r.job_id);
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
try{
 const candidates=ids(),fingerprint=digest(candidates);
 const protectedCount=db.prepare("SELECT count(*) n FROM jobs j LEFT JOIN job_details d ON d.job_id=j.job_id WHERE (d.jd_text IS NULL OR trim(d.jd_text)='') AND (j.communication_state='SUCCEEDED' OR j.application_state='SUCCEEDED')").get().n;
 if(mode==='preview')console.log(JSON.stringify({mode,count:candidates.length,protectedCount,fingerprint}));
 else{
  if(!process.argv[3]||process.argv[3]!==fingerprint)throw Error('CLEANUP_PREVIEW_MISMATCH');
  mkdirSync(backupDir,{recursive:true,mode:0o700});
  const name=new Date().toISOString().replace(/[-:.TZ]/g,'');
  const backupPath=join(backupDir,'jobs-pre-clean-'+name+'.sqlite');
  const auditPath=join(backupDir,'cleanup-'+name+'.json');
  await backup(db,backupPath);
  chmodSync(backupPath,0o600);
  const b=new DatabaseSync(backupPath,{readOnly:true});
  try{
   const copy=b.prepare(selection).all().map(r=>r.job_id);
   if(digest(copy)!==fingerprint)throw Error('CLEANUP_BACKUP_MISMATCH');
  }finally{b.close();}
  const audit={contract:'findwork-undetailed-cleanup.v1',recordedAt:new Date().toISOString(),source,backupPath,
   fingerprint,candidateCount:candidates.length,protectedCount,jobIds:candidates,removedCount:0};
  writeFileSync(auditPath,JSON.stringify(audit,null,2),{mode:0o600});
  db.exec('BEGIN IMMEDIATE');let removed=0;
  try{
   if(digest(ids())!==fingerprint)throw Error('CLEANUP_CONCURRENT_CHANGE');
   const del=db.prepare("DELETE FROM jobs WHERE job_id=? AND communication_state<>'SUCCEEDED' AND application_state<>'SUCCEEDED' AND NOT EXISTS(SELECT 1 FROM job_details d WHERE d.job_id=jobs.job_id AND d.jd_text IS NOT NULL AND trim(d.jd_text)<>'')");
   const events=db.prepare('DELETE FROM job_events WHERE job_id=?');
   for(const id of candidates){events.run(id);if(del.run(id).changes!==1)throw Error('CLEANUP_ROW_RACE');removed++;}
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  audit.removedCount=removed;
  writeFileSync(auditPath,JSON.stringify(audit,null,2),{mode:0o600});
  console.log(JSON.stringify({mode:'applied',removed,protectedCount,remainingCandidates:ids().length,backupPath,auditPath}));
 }
}finally{db.close();}
