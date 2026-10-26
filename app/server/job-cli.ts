import { pathToFileURL } from 'node:url';
import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {reconcileUnlaunchedCommunicationBatch,reserveCommunicationBatch,retryCommunication} from './communications.ts';
import { openJobsDatabase, readJobFile, importList, decideJob, importDetail, importGreet, claimGreet, queryJobs, getJobDetail, restoreRawSources,restoreRawReceipts,importAiSummaries,decideAiJob,importApplication,getJobEvents,checkGreetBeforeSend,getCommunicationQuota,DEFAULT_JOBS_DB } from '../db/ingestion/job-store.ts';

export const jobCommandHelp={version:7,readOnly:['help','status','query','get','events','check-greet'],writes:['init','import-list','import-detail','decide-ai','import-ai-summaries','claim','claim-batch','retry-greet','import-greet','import-application','restore-sources','restore-receipts','reconcile-unlaunched-greet'],workflow:'Read skills/job-search/SKILL.md; platform actions only through skills/boss-extension/SKILL.md. Greet parameter page enqueues; default page observes. No direct BOSS automation.',database:'FINDWORK_DB_PATH or app/db/runtime/jobs.sqlite',references:'skills/job-search/references/database.md'};
export function jobSystemStatus(db:any){
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version!==7)return{ready:false,exists:true,version,reason:'SCHEMA_REQUIRES_EXPLICIT_INIT'};
 return{ready:true,exists:true,version,total:db.prepare('SELECT count(*) n FROM jobs').get().n,screening:Object.fromEntries(db.prepare('SELECT screening_status,count(*) n FROM jobs GROUP BY screening_status').all().map(r=>[r.screening_status,r.n])),communication:Object.fromEntries(db.prepare('SELECT communication_state,count(*) n FROM jobs GROUP BY communication_state').all().map(r=>[r.communication_state,r.n])),quota:getCommunicationQuota(db),browser:'NOT_CHECKED',extension:'NOT_CHECKED'};
}
export function runJobCommand(db: any, command: string, argument?: string, expectedJobId?: string) {
  if (command==='help'||command==='--help')return jobCommandHelp;
  if (command==='status')return jobSystemStatus(db);
  if (command==='init') return {version:7,tables:['jobs','job_details','list_responses','job_events','job_daily_observations','job_daily_batches']};
  if (command==='restore-sources') return restoreRawSources(db);
  if (command==='restore-receipts') return restoreRawReceipts(db);
  if (command==='reconcile-unlaunched-greet') {if(!argument)throw Error('INPUT_FILE_REQUIRED');return reconcileUnlaunchedCommunicationBatch(db,readJobFile(argument).payload);}
  if (command==='import-ai-summaries') {if(!argument) throw new Error('INPUT_FILE_REQUIRED');return importAiSummaries(db,readJobFile(argument).payload);}
  if (['import-list','import-detail','import-greet','import-application'].includes(command)) {
    if (!argument) throw new Error('INPUT_FILE_REQUIRED');
    const {payload,evidence}=readJobFile(argument);
    if (command==='import-list') return importList(db,payload,evidence);
    if (command==='import-detail') return importDetail(db,payload,evidence,expectedJobId);
    if(command==='import-greet')return importGreet(db,payload,{...evidence,requireClaim:true},expectedJobId);
    return importApplication(db,payload,evidence,expectedJobId);
  }
  if (command==='get') return getJobDetail(db,argument!);
  let input: any={};
  if (argument) { try { input=JSON.parse(argument); } catch { throw new Error('INVALID_JSON'); } }
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('INVALID_PAYLOAD');
  if (command==='decide') return decideJob(db,input);
  if (command==='decide-ai') return decideAiJob(db,input);
  if (command==='events') return getJobEvents(db,input.jobId);
  if (command==='claim-batch')return reserveCommunicationBatch(db,input);
  if (command==='retry-greet')return retryCommunication(db,input);
  if (command==='claim') return claimGreet(db,input);
  if (command==='check-greet') return checkGreetBeforeSend(db,input);
  if (command==='query') return queryJobs(db,input);
  throw new Error('UNKNOWN_COMMAND');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  let db: any;
  try {
    const command=process.argv[2]||'help';
    if(command==='help'||command==='--help'){console.log(JSON.stringify({ok:true,result:jobCommandHelp}));}
    else if(command==='status'){
      const path=process.env.FINDWORK_DB_PATH||process.env.BOSS_JOBS_DB_PATH||DEFAULT_JOBS_DB;
      if(!existsSync(path))console.log(JSON.stringify({ok:true,result:{ready:false,exists:false,reason:'DATABASE_NOT_INITIALIZED',browser:'NOT_CHECKED',extension:'NOT_CHECKED'}}));
      else{db=new DatabaseSync(path,{readOnly:true});console.log(JSON.stringify({ok:true,result:jobSystemStatus(db)}));}
    }else{
      if(![...jobCommandHelp.readOnly,...jobCommandHelp.writes,'decide'].includes(command))throw Error('UNKNOWN_COMMAND');
      db=openJobsDatabase();console.log(JSON.stringify({ok:true,result:runJobCommand(db,command,process.argv[3],process.argv[4])}));
    }
  } catch (error: any) {
    // Never echo paths, raw JSON, credentials, or SQLite diagnostic text.
    const code=/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'LOCAL_OPERATION_FAILED';
    console.error(JSON.stringify({ok:false,error:code})); process.exitCode=1;
  } finally { db?.close(); }
}
