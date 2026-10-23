import { pathToFileURL } from 'node:url';
import { openJobsDatabase, readJobFile, importList, decideJob, importDetail, importGreet, claimGreet, queryJobs, getJobDetail, restoreRawSources,restoreRawReceipts,importAiSummaries,decideAiJob,importApplication,getJobEvents } from '../db/ingestion/job-store.ts';

export function runJobCommand(db: any, command: string, argument?: string, expectedJobId?: string) {
  if (command==='init') return {version:6,tables:['jobs','job_details','list_responses','job_events']};
  if (command==='restore-sources') return restoreRawSources(db);
  if (command==='restore-receipts') return restoreRawReceipts(db);
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
  if (command==='claim') return claimGreet(db,input);
  if (command==='query') return queryJobs(db,input);
  throw new Error('UNKNOWN_COMMAND');
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  let db: any;
  try {
    db=openJobsDatabase();
    console.log(JSON.stringify({ok:true,result:runJobCommand(db,process.argv[2],process.argv[3],process.argv[4])}));
  } catch (error: any) {
    // Never echo paths, raw JSON, credentials, or SQLite diagnostic text.
    const code=/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'LOCAL_OPERATION_FAILED';
    console.error(JSON.stringify({ok:false,error:code})); process.exitCode=1;
  } finally { db?.close(); }
}
