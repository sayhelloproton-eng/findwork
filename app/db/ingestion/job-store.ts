import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

export const DEFAULT_JOBS_DB=resolve(import.meta.dirname,'../runtime/jobs.sqlite');
const schema=readFileSync(resolve(import.meta.dirname,'../schema/jobs.sql'),'utf8');
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const now=()=>new Date().toISOString();
const fail=(code:string):never=>{throw new Error(code);};
const object=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:any)=>typeof v==='string'?v:null;
const bit=(v:any)=>typeof v==='boolean'?Number(v):null;
const nonempty=(...v:any[])=>v.find(x=>typeof x==='string'&&x.trim())??null;
const strings=(v:any)=>Array.isArray(v)?v.map(x=>typeof x==='string'?x:nonempty(x?.name,x?.label,x?.text)).filter(Boolean):[];
function id(v:any){if(typeof v!=='string'||!v.trim()||v.length>256||/[\s/\\\x00-\x1f]/.test(v))fail('INVALID_JOB_ID');return v;}
function timestamp(v:any){if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v)))fail('INVALID_TIMESTAMP');return new Date(v).toISOString();}
function transaction<T>(db:any,fn:()=>T):T{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}

// Preserve nested business facts; remove credentials and transient action context at every depth.
export function sanitizeJobPayload(value:any):any {
  if(Array.isArray(value))return value.map(sanitizeJobPayload);
  if(object(value))return Object.fromEntries(Object.entries(value)
    .filter(([k])=>!/(cookie|token|authorization|headers|api.?key|secret|password|credential|securityId|sessionId|^lid$|encryptBossId|encryptUserId|encryptAddressId|__proto__|^constructor$)/i.test(k))
    .map(([k,v])=>[k,sanitizeJobPayload(v)]));
  if(typeof value==='string'&&/^https?:\/\//i.test(value)) {
    try{const url=new URL(value);url.username='';url.password='';url.search='';url.hash='';return url.toString();}catch{return null;}
  }
  return value;
}
function unwrap(p:any){if(!object(p))fail('INVALID_PAYLOAD');return p.rawResponse??p.response??p;}
function evidenceFor(p:any,e:any={}){return{source:text(e.source),sourceHash:text(e.sourceHash)||hash(JSON.stringify(p))};}
export function readJobFile(path:string){
  let content:string;try{content=readFileSync(resolve(path),'utf8');}catch{fail('INPUT_FILE_UNREADABLE');}
  let payload:any;try{payload=JSON.parse(content!);}catch{fail('INVALID_JSON');}
  return{payload,evidence:{source:resolve(path),sourceHash:hash(content!)}};
}
export function openJobsDatabase(path=process.env.FINDWORK_DB_PATH||process.env.BOSS_JOBS_DB_PATH||DEFAULT_JOBS_DB){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const db=new DatabaseSync(path);
  try{
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
    db.function('job_sha256',{deterministic:true},(value:any)=>value==null?null:hash(String(value)));
    transaction(db,()=>{
      const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r:any)=>r.name);
      const version=(db.prepare('PRAGMA user_version').get() as any).user_version;
      if(!tables.length&&version===0)db.exec(schema);
      else if(version===2&&tables.includes('job_details')&&tables.includes('jobs')&&!tables.includes('list_responses')){
        db.exec(`ALTER TABLE jobs ADD COLUMN communicated_at TEXT GENERATED ALWAYS AS (CASE WHEN communication_state='SUCCEEDED' THEN greet_confirmed_at ELSE NULL END) VIRTUAL;
CREATE TABLE list_responses (source_hash TEXT PRIMARY KEY NOT NULL,response_json TEXT NOT NULL CHECK(json_valid(response_json)),source TEXT,imported_at TEXT NOT NULL) STRICT;
PRAGMA user_version=3;`);
      }else if(![3,4,5,6].includes(version))fail('NOT_BOSS_JOBS_DATABASE');
      const actual=(db.prepare('PRAGMA user_version').get() as any).user_version;
      const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r:any)=>r.name);
      if(![['job_details','jobs','list_responses'],['job_details','job_events','jobs','list_responses']].some(v=>JSON.stringify(v)===JSON.stringify(names))||
        !db.prepare('PRAGMA table_xinfo(jobs)').all().some((r:any)=>r.name==='communicated_at'))fail('NOT_BOSS_JOBS_DATABASE');
      if(actual===3)db.exec([
        'ALTER TABLE jobs ADD COLUMN ai_summary_json TEXT CHECK(ai_summary_json IS NULL OR json_valid(ai_summary_json));',
        'ALTER TABLE jobs ADD COLUMN ai_summary_source_hash TEXT;',
        'ALTER TABLE jobs ADD COLUMN ai_summary_at TEXT;',
        'PRAGMA user_version=4;'].join(' '));
      if((db.prepare('PRAGMA user_version').get() as any).user_version===4)db.exec([
        'ALTER TABLE jobs ADD COLUMN brand_id TEXT;',
        'UPDATE jobs SET brand_id=COALESCE(NULLIF(json_extract(list_json,\'$.encryptBrandId\'),\'\'),(SELECT NULLIF(json_extract(d.detail_json,\'$.brandComInfo.encryptBrandId\'),\'\') FROM job_details d WHERE d.job_id=jobs.job_id));',
        'PRAGMA user_version=5;'].join(' '));
      if((db.prepare('PRAGMA user_version').get() as any).user_version===5){
        const has=(table:string,col:string)=>db.prepare('PRAGMA table_info('+table+')').all().some((r:any)=>r.name===col);
        const columns:any={screening_basis_hash:'TEXT',screening_basis_type:'TEXT',
          greet_raw_json:'TEXT CHECK(greet_raw_json IS NULL OR json_valid(greet_raw_json))',
          application_state:"TEXT NOT NULL DEFAULT 'NONE' CHECK(application_state IN ('NONE','SUCCEEDED','FAILED','UNKNOWN'))",
          application_action_id:'TEXT',application_at:'TEXT',
          application_raw_json:'TEXT CHECK(application_raw_json IS NULL OR json_valid(application_raw_json))',
          application_source_hash:'TEXT'};
        for(const [col,type] of Object.entries(columns))if(!has('jobs',col))db.exec('ALTER TABLE jobs ADD COLUMN '+col+' '+type);
        if(!has('job_details','raw_envelope_json'))
          db.exec('ALTER TABLE job_details ADD COLUMN raw_envelope_json TEXT CHECK(raw_envelope_json IS NULL OR json_valid(raw_envelope_json))');
        db.exec("CREATE TABLE IF NOT EXISTS job_events (event_id INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT NOT NULL REFERENCES jobs(job_id),event_type TEXT NOT NULL,old_state TEXT,new_state TEXT,source_hash TEXT,occurred_at TEXT NOT NULL,event_key TEXT NOT NULL UNIQUE); CREATE INDEX IF NOT EXISTS job_events_time ON job_events(occurred_at,event_type); PRAGMA user_version=6;");
      }
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS jobs_application_action_id ON jobs(application_action_id) WHERE application_action_id IS NOT NULL;');
      if((db.prepare('PRAGMA user_version').get() as any).user_version!==6||
        !['ai_summary_json','brand_id','screening_basis_hash','application_state','greet_raw_json'].every(x=>db.prepare('PRAGMA table_xinfo(jobs)').all().some((r:any)=>r.name===x)))fail('NOT_BOSS_JOBS_DATABASE');
    });
    if(path!==':memory:')chmodSync(path,0o600);
    return db;
  }catch(e){db.close();throw e;}
}
function addEvent(db:any,id:string,type:string,before:string|null,after:string|null,source:string|null,key:string){
 db.prepare('INSERT OR IGNORE INTO job_events(job_id,event_type,old_state,new_state,source_hash,occurred_at,event_key) VALUES(?,?,?,?,?,?,?)')
  .run(id,type,before,after,source,now(),key);
}
export function getJobEvents(db:any,jobId:string){
 getJob(db,jobId);
 return db.prepare('SELECT event_type,old_state,new_state,source_hash,occurred_at FROM job_events WHERE job_id=? ORDER BY event_id').all(jobId);
}
export function getDecisionBasis(job:any){
 return job.has_detail&&job.facts?.jd_text?{kind:'DETAIL_JD',hash:hash(job.facts.jd_text)}:{kind:'LIST',hash:job.list_hash};
}
export function decideAiJob(db:any,input:any){
 if(!object(input)||!Number.isInteger(input.expectedRevision)||typeof input.expectedSourceHash!=='string'||!input.expectedSourceHash)
   fail('AI_DECISION_PRECONDITION_REQUIRED');
 if(!['PENDING','WORTH','PASS'].includes(input.status))fail('INVALID_SCREENING_STATUS');
 if(input.source!=null&&input.source!=='SKILL')fail('INVALID_DECISION_SOURCE');
 return decideJob(db,{...input,source:'SKILL'});
}
const listColumns:Record<string,string>={job_name:'jobName',brand_name:'brandName',city:'cityName',district:'areaDistrict',business_district:'businessDistrict',salary:'salaryDesc',
  experience:'jobExperience',education:'jobDegree',brand_industry:'brandIndustry',brand_scale:'brandScaleName',brand_stage:'brandStageName',boss_name:'bossName',boss_title:'bossTitle'};
function addSignals(db:any,jobId:string,signals:string[]){
  if(!signals.length)return;
  const row=db.prepare('SELECT history_signals FROM jobs WHERE job_id=?').get(jobId);
  const before=JSON.parse(row.history_signals);
  const after=[...new Set([...before,...signals])].sort();
  if(after.length===before.length)return;
  db.prepare('UPDATE jobs SET history_blocked=1,history_signals=?,updated_at=? WHERE job_id=?').run(JSON.stringify(after),now(),jobId);
}
export function importList(db:any,payload:any,evidence:any={}){
  const raw=unwrap(payload);if(raw?.code!==0||!Array.isArray(raw?.zpData?.jobList))fail('NOT_LIST_RESPONSE');
  const stamp=now(),source=evidenceFor(payload,evidence),result={read:raw.zpData.jobList.length,added:0,existing:0,updated:0,invalid:0};
  return transaction(db,()=>{
    db.prepare('INSERT OR IGNORE INTO list_responses(source_hash,response_json,source,imported_at) VALUES(?,?,?,?)')
      .run(source.sourceHash,JSON.stringify(payload),source.source,stamp);
    for(const entry of raw.zpData.jobList){
      let jobId:string;try{jobId=id(entry?.encryptJobId);}catch{result.invalid++;continue;}
      if(!text(entry?.jobName)?.trim()){result.invalid++;continue;}
      const listJson=JSON.stringify(entry),listHash=hash(listJson);
      const values:any=Object.fromEntries(Object.entries(listColumns).map(([k,v])=>[k,text(entry[v])]));
      values.brand_id=nonempty(entry.encryptBrandId);values.boss_online=bit(entry.bossOnline);values.contact_signal=bit(entry.contact);
      const before=db.prepare('SELECT list_hash,brand_id FROM jobs WHERE job_id=?').get(jobId);
      if(before){
        // A later anonymous/partial List payload must not erase an ID already established by Detail.
        if(!values.brand_id)values.brand_id=before.brand_id;
        result.existing++;
        if(before.list_hash!==listHash){
          result.updated++;
          addEvent(db,jobId,'LIST_UPDATED',before.list_hash,listHash,source.sourceHash,'list:'+jobId+':'+listHash);
          db.prepare(`UPDATE jobs SET ${Object.keys(values).map(k=>`${k}=?`).join(',')},list_json=?,list_hash=?,list_source=?,list_source_hash=?,list_updated_at=?,updated_at=? WHERE job_id=?`)
            .run(...Object.values(values),listJson,listHash,source.source,source.sourceHash,stamp,stamp,jobId);
        }
        db.prepare('UPDATE jobs SET last_seen_at=? WHERE job_id=?').run(stamp,jobId);
      }else{
        const row={job_id:jobId,...values,list_json:listJson,list_hash:listHash,list_source:source.source,list_source_hash:source.sourceHash,first_seen_at:stamp,last_seen_at:stamp,list_updated_at:stamp,updated_at:stamp};
        db.prepare(`INSERT INTO jobs(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
        addEvent(db,jobId,'COLLECTED',null,'COLLECTED',source.sourceHash,'collected:'+jobId);
        result.added++;
      }
      if(entry.contact===true)addSignals(db,jobId,['LIST_CONTACT']);
    }
    return result;
  });
}

export function restoreRawSources(db:any){
 const jobs=db.prepare('SELECT job_id,list_json,list_source,list_source_hash FROM jobs WHERE list_source IS NOT NULL').all() as any[];
 const details=db.prepare('SELECT job_id,detail_json,source_ref,source_hash FROM job_details WHERE source_ref IS NOT NULL').all() as any[];
 const batches=new Map<string,{payload:any,source:string,sourceHash:string,entries:Map<string,any>}>();
 const lists:any[]=[], detailRows:any[]=[];
 for(const row of jobs){
  const batchKey=row.list_source_hash;
  let batch=batches.get(batchKey);
  if(!batch){
   const file=readJobFile(row.list_source);
   if(file.evidence.sourceHash!==batchKey)fail('SOURCE_HASH_MISMATCH');
   const raw=unwrap(file.payload);
   if(raw?.code!==0||!Array.isArray(raw?.zpData?.jobList))fail('NOT_LIST_RESPONSE');
   batch={payload:file.payload,source:file.evidence.source!,sourceHash:batchKey,
     entries:new Map(raw.zpData.jobList.filter((x:any)=>object(x)&&typeof x.encryptJobId==='string').map((x:any)=>[x.encryptJobId,x]))};
   batches.set(batchKey,batch);
  }
  const original=batch.entries.get(row.job_id);
  if(!original)fail('SOURCE_JOB_MISMATCH');
  lists.push({jobId:row.job_id,json:JSON.stringify(original)});
 }
 for(const row of details){
  const file=readJobFile(row.source_ref);
  if(file.evidence.sourceHash!==row.source_hash)fail('SOURCE_HASH_MISMATCH');
  const raw=unwrap(file.payload);
  if(raw?.code!==0||raw?.zpData?.jobInfo?.encryptId!==row.job_id)fail('SOURCE_JOB_MISMATCH');
  detailRows.push({jobId:row.job_id,json:JSON.stringify(raw.zpData)});
 }
 return transaction(db,()=>{
  for(const batch of batches.values())db.prepare('INSERT OR IGNORE INTO list_responses(source_hash,response_json,source,imported_at) VALUES(?,?,?,?)')
    .run(batch.sourceHash,JSON.stringify(batch.payload),batch.source,now());
  let listUpdated=0,detailUpdated=0;
  for(const item of lists){const digest=hash(item.json);const result=db.prepare('UPDATE jobs SET list_json=?,list_hash=?,updated_at=? WHERE job_id=? AND list_hash<>?')
    .run(item.json,digest,now(),item.jobId,digest);listUpdated+=Number(result.changes);}
  for(const item of detailRows){const digest=hash(item.json);const result=db.prepare('UPDATE job_details SET detail_json=?,detail_hash=? WHERE job_id=? AND detail_hash<>?')
    .run(item.json,digest,item.jobId,digest);detailUpdated+=Number(result.changes);
    if(result.changes)db.prepare('UPDATE jobs SET updated_at=? WHERE job_id=?').run(now(),item.jobId);}
  return {listChecked:lists.length,listRestored:listUpdated,detailChecked:detailRows.length,detailRestored:detailUpdated,batches:batches.size};
 });
}

// Backfill original legacy receipts only from original files whose SHA256 and job identity match.
export function restoreRawReceipts(db:any){
 const details=db.prepare('SELECT job_id,detail_hash,source_ref,source_hash FROM job_details WHERE raw_envelope_json IS NULL AND source_ref IS NOT NULL').all() as any[];
 const greets=db.prepare('SELECT job_id,greet_started_at,greet_source,greet_source_hash FROM jobs WHERE greet_raw_json IS NULL AND greet_source IS NOT NULL').all() as any[];
 const toDetail:any[]=[],toGreet:any[]=[];
 for(const row of details){
  const f=readJobFile(row.source_ref);
  if(f.evidence.sourceHash!==row.source_hash)fail('SOURCE_HASH_MISMATCH');
  const body=unwrap(f.payload);
  if(body?.code!==0||body?.zpData?.jobInfo?.encryptId!==row.job_id||
    hash(JSON.stringify(body.zpData))!==row.detail_hash)fail('SOURCE_JOB_MISMATCH');
  toDetail.push({jobId:row.job_id,raw:JSON.stringify(f.payload)});
 }
 for(const row of greets){
  const f=readJobFile(row.greet_source);
  if(f.evidence.sourceHash!==row.greet_source_hash)fail('SOURCE_HASH_MISMATCH');
  if(f.payload?.contract!=='boss-greet-result.v1'||f.payload.jobId!==row.job_id||
    timestamp(f.payload.startedAt)!==row.greet_started_at)fail('SOURCE_JOB_MISMATCH');
  toGreet.push({jobId:row.job_id,raw:JSON.stringify(f.payload)});
 }
 return transaction(db,()=>{
  for(const row of toDetail)db.prepare('UPDATE job_details SET raw_envelope_json=? WHERE job_id=? AND raw_envelope_json IS NULL').run(row.raw,row.jobId);
  for(const row of toGreet)db.prepare('UPDATE jobs SET greet_raw_json=? WHERE job_id=? AND greet_raw_json IS NULL').run(row.raw,row.jobId);
  return{detailChecked:details.length,detailRestored:toDetail.length,greetChecked:greets.length,greetRestored:toGreet.length};
 });
}
function checkedSummary(s:any){
 const keys=['headline','responsibilities','requirements','bonus','notices'];
 if(!object(s)||Object.keys(s).some(k=>!keys.includes(k))||typeof s.headline!=='string'||!s.headline.trim()||s.headline.length>280)fail('INVALID_AI_SUMMARY');
 for(const key of keys.slice(1))if(!Array.isArray(s[key])||s[key].length>12||s[key].some((v:any)=>typeof v!=='string'||!v.trim()||v.length>360))fail('INVALID_AI_SUMMARY');
 if(!s.responsibilities.length||!s.requirements.length)fail('INVALID_AI_SUMMARY');
 return s;
}
export function importAiSummaries(db:any,p:any){
 if(!object(p)||p.contract!=='job-ai-summaries.v1'||!Array.isArray(p.items)||!p.items.length||p.items.length>300)fail('INVALID_AI_SUMMARY_BATCH');
 return transaction(db,()=>{
  const seen=new Set<string>();
  for(const x of p.items){
   if(!object(x)||Object.keys(x).some(k=>!['jobId','sourceHash','summary'].includes(k)))fail('INVALID_AI_SUMMARY');
   const key=id(x.jobId);if(seen.has(key))fail('DUPLICATE_AI_SUMMARY');seen.add(key);
   const detail=db.prepare('SELECT jd_text FROM job_details WHERE job_id=?').get(key) as any;
   if(!detail?.jd_text)fail('AI_SUMMARY_MISSING_DETAIL');
   const digest=hash(detail.jd_text);if(x.sourceHash!==digest)fail('AI_SUMMARY_STALE_SOURCE');
   const summary=JSON.stringify(checkedSummary(x.summary));
   const current=db.prepare('SELECT ai_summary_json,ai_summary_source_hash FROM jobs WHERE job_id=?').get(key) as any;
   if(current.ai_summary_json!==summary||current.ai_summary_source_hash!==digest){
     const stamp=now();
     db.prepare('UPDATE jobs SET ai_summary_json=?,ai_summary_source_hash=?,ai_summary_at=?,updated_at=? WHERE job_id=?').run(summary,digest,stamp,stamp,key);
   }
  }
  return {stored:seen.size};
 });
}
const joinSql=`SELECT j.*,d.detail_json,d.jd_text,d.job_status_desc,d.invalid_status,d.boss_active_desc,d.fetched_at detail_fetched_at FROM jobs j LEFT JOIN job_details d ON d.job_id=j.job_id`;
function present(row:any){
  const list=JSON.parse(row.list_json),detail=row.detail_json?JSON.parse(row.detail_json):null;
  const info=detail?.jobInfo??{},company=detail?.brandComInfo??{},boss=detail?.bossInfo??{};
  const facts:any={},sources:any={};
  for(const [key,dv,lv] of [
    ['job_name',info.jobName,row.job_name],['brand_name',company.brandName,row.brand_name],['salary',info.salaryDesc,row.salary],
    ['experience',info.experienceName,row.experience],['education',info.degreeName,row.education],['brand_industry',company.industryName,row.brand_industry],
    ['brand_scale',company.scaleName,row.brand_scale],['brand_stage',company.stageName,row.brand_stage],['boss_name',boss.name,row.boss_name],['boss_title',boss.title,row.boss_title]
  ]){facts[key]=nonempty(dv,lv);sources[key]=nonempty(dv)?'Detail':'List';}
  Object.assign(facts,{city:row.city,district:row.district,business_district:row.business_district,address:nonempty(info.address,info.locationName),
    skills:[...new Set([...strings(list.skills),...strings(info.showSkills)])],labels:strings(list.jobLabels),welfare:strings(list.welfareList),
    company_introduction:nonempty(company.introduce),company_labels:strings(company.labels),customer_company:nonempty(company.customerBrandName),
    boss_online:row.boss_online==null?(typeof boss.bossOnline==='boolean'?boss.bossOnline:null):Boolean(row.boss_online),boss_active_desc:row.boss_active_desc,
    job_status_desc:row.job_status_desc,closed:row.invalid_status===1||/已关闭|停止招聘/.test(row.job_status_desc??''),
    gold_hunter:list.goldHunter??null,proxy_job:list.proxyJob??null,proxy_type:list.proxyType??null,job_type:list.jobType??null,
    least_month_desc:nonempty(list.leastMonthDesc),days_per_week_desc:nonempty(list.daysPerWeekDesc),jd_text:row.jd_text??null,sources});
  const jdHash=row.jd_text?hash(row.jd_text):null;
  const ai_summary_status=!jdHash?'NO_DETAIL':!row.ai_summary_json?'PENDING':row.ai_summary_source_hash===jdHash?'READY':'STALE';
  const ai_summary=ai_summary_status==='READY'?JSON.parse(row.ai_summary_json):null;
  const basis=row.screening_basis_hash?getDecisionBasis({has_detail:!!detail,facts,list_hash:row.list_hash}):null;
  const decision_stale=!!row.screening_basis_hash&&row.screening_basis_hash!==basis?.hash;
  const {ai_summary_json,...publicRow}=row;
  const eligible=row.screening_status==='WORTH'&&!decision_stale&&row.application_state==='NONE'&&
    row.communication_state==='NONE'&&!row.history_blocked&&!facts.closed;
  const blockReason=facts.closed?'职位已关闭':row.history_blocked?'已有关系或申请记录，请核验后再联系':row.communication_state==='SUCCEEDED'?'已确认沟通':row.communication_state!=='NONE'?'已有联系动作记录，请核验后再联系':null;
  return{...publicRow,decision_basis:getDecisionBasis({has_detail:!!detail,facts,list_hash:row.list_hash}),decision_stale,ai_summary,ai_summary_status,communicated:Boolean(row.communicated),has_detail:!!detail,list,history_signals:JSON.parse(row.history_signals),facts,eligible,block_reason:blockReason};
}
export function getJob(db:any,jobId:string){const row=db.prepare(`${joinSql} WHERE j.job_id=?`).get(id(jobId));if(!row)fail('JOB_NOT_FOUND');return present(row);}
export function getJobDetail(db:any,jobId:string){const job=getJob(db,jobId),d=db.prepare('SELECT * FROM job_details WHERE job_id=?').get(jobId);return{job,detail:d?{...d,data:JSON.parse(d.detail_json)}:null};}
export function decideJob(db:any,input:any){
  if(!object(input))fail('INVALID_PAYLOAD');const jobId=id(input.jobId);
  const allowed=new Set(['jobId','status','reason','source','strategyVersion','expectedRevision','expectedSourceHash']);
  if(Object.keys(input).some(k=>!allowed.has(k)))fail('INVALID_DECISION_FIELD');
  return transaction(db,()=>{
    const old=getJob(db,jobId),status=input.status??old.screening_status;
    if(!['PENDING','NEED_DETAIL','WORTH','PASS'].includes(status))fail('INVALID_SCREENING_STATUS');
    if(status==='NEED_DETAIL'&&old.has_detail)fail('DETAIL_ALREADY_AVAILABLE');
    if(input.expectedRevision!=null&&(!Number.isInteger(input.expectedRevision)||input.expectedRevision!==old.revision))fail('DECISION_CONFLICT');
    const basis=getDecisionBasis(old);
    if(input.expectedSourceHash!=null&&input.expectedSourceHash!==basis.hash)fail('DECISION_SOURCE_STALE');
    const reason=Object.hasOwn(input,'reason')?text(input.reason)?.trim()||null:old.screening_reason;
    if(['WORTH','PASS'].includes(status)&&!reason)fail('DECISION_REASON_REQUIRED');
    if(reason&&reason.length>4000)fail('DECISION_REASON_TOO_LONG');
    const source=input.source??'SKILL';if(!['MANUAL','SKILL','DEMO'].includes(source))fail('INVALID_DECISION_SOURCE');
    const stamp=now();
    const strategy=text(input.strategyVersion)??(source==='MANUAL'?'manual':null);
    if(status===old.screening_status&&reason===old.screening_reason&&source===old.decision_source&&strategy===old.strategy_version&&(!input.expectedSourceHash||old.screening_basis_hash===basis.hash))return old;
    db.prepare('UPDATE jobs SET screening_status=?,screening_reason=?,decision_source=?,strategy_version=?,screened_at=?,screening_basis_hash=?,screening_basis_type=?,revision=revision+1,updated_at=? WHERE job_id=?')
      .run(status,reason,source,strategy,stamp,input.expectedSourceHash?basis.hash:null,
        input.expectedSourceHash?basis.kind:null,stamp,jobId);
    addEvent(db,jobId,'DECISION',old.screening_status,status,input.expectedSourceHash||null,
      'decision:'+jobId+':'+(old.revision+1));
    return getJob(db,jobId);
  });
}
export function importDetail(db:any,payload:any,evidence:any={},expectedJobId?:string){
  const raw=unwrap(payload),info=raw?.zpData?.jobInfo;
  if(raw?.code!==0||!object(info)||!text(info.postDescription)?.trim()||!text(info.jobName)?.trim()||
    (payload.apiCode!=null&&payload.apiCode!==0)||/FAIL|UNKNOWN|BLOCKED/.test(String(payload.status||'')))fail('NOT_SUCCESSFUL_DETAIL');
  const jobId=id(info.encryptId);for(const v of[payload.jobId,payload.encryptJobId,expectedJobId])if(v!=null&&id(v)!==jobId)fail('DETAIL_ID_MISMATCH');
  const stamp=now(),fetched=payload.capturedAt??payload.finishedAt,fetchedAt=fetched==null?stamp:timestamp(fetched);
  const safe=raw.zpData; // Retain all native Detail fields, including future fields.
  const source=evidenceFor(payload,evidence),detailJson=JSON.stringify(safe),detailHash=hash(detailJson),fullEnvelope=JSON.stringify(payload);
  return transaction(db,()=>{
    getJob(db,jobId);
    addSignals(db,jobId,[safe.relationInfo?.beFriend===true?'DETAIL_BE_FRIEND':null,safe.oneKeyResumeInfo?.alreadySend===true?'DETAIL_ALREADY_SEND':null,safe.atsOnlineApplyInfo?.alreadyApply===true?'DETAIL_ALREADY_APPLY':null].filter(Boolean) as string[]);
    const old=db.prepare('SELECT fetched_at,detail_hash FROM job_details WHERE job_id=?').get(jobId);
    if(old&&old.fetched_at>fetchedAt)return getJobDetail(db,jobId);
    if(old&&old.detail_hash===detailHash){db.prepare('UPDATE job_details SET fetched_at=?,source_ref=?,source_hash=?,raw_envelope_json=? WHERE job_id=?').run(fetchedAt,source.source,source.sourceHash,fullEnvelope,jobId);return getJobDetail(db,jobId);}
    const row={job_id:jobId,jd_text:info.postDescription,job_name:info.jobName,job_status_desc:text(info.jobStatusDesc),invalid_status:bit(info.invalidStatus),boss_active_desc:text(safe.bossInfo?.activeTimeDesc),
      be_friend:bit(safe.relationInfo?.beFriend),already_send:bit(safe.oneKeyResumeInfo?.alreadySend),already_apply:bit(safe.atsOnlineApplyInfo?.alreadyApply),detail_json:detailJson,detail_hash:detailHash,raw_envelope_json:fullEnvelope,source_ref:source.source,source_hash:source.sourceHash,fetched_at:fetchedAt,updated_at:stamp};
    db.prepare(`INSERT INTO job_details(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')}) ON CONFLICT(job_id) DO UPDATE SET ${Object.keys(row).filter(k=>k!=='job_id').map(k=>`${k}=excluded.${k}`).join(',')}`).run(...Object.values(row));
    db.prepare("UPDATE jobs SET brand_id=coalesce(brand_id,?),screening_status=CASE WHEN screening_status='NEED_DETAIL' THEN 'PENDING' ELSE screening_status END,screening_reason=CASE WHEN screening_status='NEED_DETAIL' THEN NULL ELSE screening_reason END,revision=revision+1,updated_at=? WHERE job_id=?")
      .run(nonempty(safe.brandComInfo?.encryptBrandId),stamp,jobId);
    addEvent(db,jobId,'DETAIL_CHANGED',old?.detail_hash||null,detailHash,source.sourceHash,
      'detail:'+jobId+':'+detailHash);
    return getJobDetail(db,jobId);
  });
}
export function claimGreet(db: any, input: any) {
  const jobId=id(input?.jobId), actionId=id(input?.actionId), stamp=now();
  return transaction(db,()=>{
    const job=getJob(db,jobId);
    if (job.action_id===actionId && job.communication_state==='IN_FLIGHT') return job;
    if (!job.eligible) fail('GREET_BLOCKED');
    if (db.prepare('SELECT 1 FROM jobs WHERE action_id=?').get(actionId)) fail('ACTION_ID_CONFLICT');
    db.prepare("UPDATE jobs SET communication_state='IN_FLIGHT',action_id=?,claimed_at=?,updated_at=? WHERE job_id=?")
      .run(actionId,stamp,stamp,jobId);
    return getJob(db,jobId);
  });
}
export function importGreet(db: any, payload: any, evidence: any = {}, expectedJobId?: string) {
  if (payload?.contract!=='boss-greet-result.v1' || payload.method!=='POST' || payload.endpoint!=='/wapi/zpgeek/friend/add.json' ||
    !['SUCCESS','FAILED','UNKNOWN'].includes(payload.result)) fail('NOT_GREET_RESULT');
  const jobId=id(payload.jobId);
  if (expectedJobId!=null && id(expectedJobId)!==jobId) fail('GREET_ID_MISMATCH');
  const start=timestamp(payload.startedAt), finish=timestamp(payload.finishedAt);
  if (finish<start) fail('INVALID_TIMESTAMP');
  let state='UNKNOWN', reason='RESULT_UNCONFIRMED';
  if (payload.sideEffectState!=='UNKNOWN' && !payload.error && payload.httpStatus===200 && payload.response?.code===0 && payload.result==='SUCCESS') {
    state='SUCCEEDED'; reason='HTTP_200_BUSINESS_CODE_ZERO';
  } else if (payload.sideEffectState!=='UNKNOWN' && !payload.error && payload.result==='FAILED' && payload.httpStatus===200 &&
    Number.isInteger(payload.response?.code) && payload.response.code!==0) { state='FAILED'; reason='BUSINESS_REJECTED'; }
  const source=evidenceFor(payload,evidence), stamp=now(),strictClaim=evidence?.requireClaim===true;
  const summary=JSON.stringify({contract:payload.contract,jobId,startedAt:start,finishedAt:finish,result:payload.result,
    httpStatus:Number.isInteger(payload.httpStatus)?payload.httpStatus:null,apiCode:Number.isInteger(payload.response?.code)?payload.response.code:null,state,reason});
  return transaction(db,()=>{
    const job=getJob(db,jobId);
    if(strictClaim&&(!job.action_id||!['IN_FLIGHT','SUCCEEDED','FAILED','UNKNOWN'].includes(job.communication_state)))
      fail('GREET_CLAIM_REQUIRED');
    if (job.greet_source_hash===source.sourceHash) return job;
    if (job.greet_started_at && job.greet_started_at!==start) fail('GREET_ATTEMPT_CONFLICT');
    if (job.claimed_at && start<job.claimed_at) fail('GREET_PREDATES_CLAIM');
    // Confirmed success is monotonic. Stale/uncertain receipts cannot downgrade it.
    if (job.communication_state==='SUCCEEDED') return job;
    if (job.communication_state==='UNKNOWN' && state==='FAILED') return job;
    const actionId=job.action_id || `receipt-${hash(`${jobId}|${start}`)}`;
    db.prepare(`UPDATE jobs SET communication_state=?,action_id=?,greet_started_at=?,greet_confirmed_at=?,greet_reason=?,greet_json=?,greet_source=?,greet_source_hash=?,greet_raw_json=?,updated_at=? WHERE job_id=?`)
      .run(state,actionId,start,state==='SUCCEEDED'?finish:null,reason,summary,source.source,
        source.sourceHash,JSON.stringify(payload),stamp,jobId);
    addEvent(db,jobId,'GREET',job.communication_state,state,source.sourceHash,
      'greet:'+jobId+':'+source.sourceHash);
    return getJob(db,jobId);
  });
}
export function importApplication(db:any,p:any,evidence:any={},expectedJobId?:string){
 if(!object(p)||p.contract!=='job-application-result.v1'||p.kind!=='RESUME_SUBMISSION'||
   !['SUCCESS','FAILED','UNKNOWN'].includes(p.result))fail('NOT_APPLICATION_RESULT');
 const jobId=id(p.jobId),actionId=id(p.actionId);
 if(expectedJobId!=null&&id(expectedJobId)!==jobId)fail('APPLICATION_ID_MISMATCH');
 const ended=timestamp(p.finishedAt);
 if(p.result==='SUCCESS'&&p.confirmed!==true)fail('APPLICATION_UNCONFIRMED');
 if(p.result==='SUCCESS'&&(!object(p.receipt)||!Object.keys(p.receipt).length))fail('APPLICATION_RECEIPT_REQUIRED');
 const state=p.result==='SUCCESS'?'SUCCEEDED':p.result;
 const source=evidenceFor(p,evidence);
 return transaction(db,()=>{
  const job=getJob(db,jobId);
  if(job.application_source_hash===source.sourceHash)return job;
  if(job.application_state==='SUCCEEDED')fail('APPLICATION_ALREADY_CONFIRMED');
  if(job.application_action_id&&job.application_action_id!==actionId)fail('APPLICATION_ACTION_CONFLICT');
  db.prepare('UPDATE jobs SET application_state=?,application_action_id=?,application_at=?,application_raw_json=?,application_source_hash=?,updated_at=? WHERE job_id=?')
   .run(state,actionId,state==='SUCCEEDED'?ended:null,JSON.stringify(p),source.sourceHash,now(),jobId);
  addEvent(db,jobId,'APPLICATION',job.application_state,state,source.sourceHash,'application:'+jobId+':'+source.sourceHash);
  return getJob(db,jobId);
 });
}
export function queryJobs(db:any,input:any={}){
 if(!object(input))fail('INVALID_QUERY');
 const allowed=['status','communicated','q','location','brandId','education','candidates','limit','offset','hasDetail','online','sort'];
 if(Object.keys(input).some(k=>!allowed.includes(k)))fail('INVALID_QUERY_FIELD');
 if(input.status&&!['PENDING','NEED_DETAIL','WORTH','PASS'].includes(input.status))fail('INVALID_SCREENING_STATUS');
 for(const k of ['communicated','candidates','hasDetail','online'])if(input[k]!=null&&![true,false,'true','false'].includes(input[k]))fail('INVALID_QUERY');
 for(const k of ['q','location','brandId','education'])if(input[k]!=null&&typeof input[k]!=='string')fail('INVALID_QUERY');
 if(input.education!=null&&!['','不限','大专','本科','其他'].includes(input.education))fail('INVALID_EDUCATION');
 if(input.sort!=null&&!['updated','recommended','recent','online'].includes(input.sort))fail('INVALID_QUERY');
 const limit=Number(input.limit??50),offset=Number(input.offset??0);
 if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0)fail('INVALID_PAGINATION');
 const join=' FROM jobs j LEFT JOIN job_details d ON d.job_id=j.job_id';
 const opened="(coalesce(d.invalid_status,0)<>1 AND coalesce(d.job_status_desc,'') NOT LIKE '%已关闭%' AND coalesce(d.job_status_desc,'') NOT LIKE '%停止招聘%')";
 const eligible="(j.screening_status='WORTH' AND j.communication_state='NONE' AND j.application_state='NONE' "+
  "AND (j.screening_basis_hash IS NULL OR j.screening_basis_hash=coalesce(job_sha256(d.jd_text),j.list_hash)) "+
  "AND j.history_blocked=0 AND "+opened+")";
 const clauses=[],params:any[]=[];
 if(input.status==='PENDING')clauses.push("j.screening_status IN ('PENDING','NEED_DETAIL')");
 else if(input.status){clauses.push('j.screening_status=?');params.push(input.status);}
 if(input.brandId==='__ANONYMOUS__')clauses.push("(j.brand_id IS NULL AND coalesce(json_extract(j.list_json,'$.goldHunter'),0)=1)");
 else if(input.brandId?.trim()){clauses.push('j.brand_id=?');params.push(input.brandId.trim());}
 if(input.education){
  const degree="coalesce(j.education,'')";
  if(input.education==='不限')clauses.push("("+degree+" LIKE '%不限%' OR "+degree+" LIKE '%无要求%')");
  else if(input.education==='其他')clauses.push("("+degree+" NOT LIKE '%本科%' AND "+degree+" NOT LIKE '%大专%' AND "+degree+" NOT LIKE '%不限%' AND "+degree+" NOT LIKE '%无要求%')");
  else {clauses.push(degree+" LIKE ?");params.push('%'+input.education+'%');}
 }
 if(input.communicated!=null)clauses.push("j.communication_state"+(String(input.communicated)==='true'?'=':'<>')+"'SUCCEEDED'");
 if(String(input.candidates)==='true')clauses.push(eligible);
 if(input.hasDetail!=null)clauses.push('d.job_id IS '+(String(input.hasDetail)==='true'?'NOT ':'')+'NULL');
 if(input.online!=null)clauses.push('j.boss_online='+(String(input.online)==='true'?'1':'0'));
 if(input.q?.trim()){
  const term=input.q.trim().toLowerCase();
  clauses.push("(instr(lower(j.job_name),?)>0 OR instr(lower(coalesce(j.brand_name,'')),?)>0 OR instr(lower(j.list_json),?)>0 OR instr(lower(coalesce(d.jd_text,'')),?)>0)");
  params.push(term,term,term,term);
 }
 if(input.location?.trim()){
  const term=input.location.trim();
  clauses.push("(instr(coalesce(j.city,''),?)>0 OR instr(coalesce(j.district,''),?)>0 OR instr(coalesce(j.business_district,''),?)>0 OR instr(coalesce(json_extract(d.detail_json,'$.jobInfo.address'),''),?)>0)");
  params.push(term,term,term,term);
 }
 const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
 const total=(db.prepare('SELECT count(*) n'+join+where).get(...params) as any).n;
 const recommended="CASE WHEN "+eligible+" THEN 0 ELSE 1 END,CASE WHEN j.screening_status='WORTH' AND j.communication_state<>'SUCCEEDED' THEN 0 ELSE 1 END,CASE WHEN j.screening_status='PASS' THEN 1 ELSE 0 END,coalesce(j.boss_online,-1) DESC,j.last_seen_at DESC,j.job_id ASC";
 const order=input.sort==='recommended'?recommended:input.sort==='recent'?'j.last_seen_at DESC,j.job_id ASC':input.sort==='online'?'coalesce(j.boss_online,-1) DESC,j.last_seen_at DESC,j.job_id ASC':'j.updated_at DESC,j.job_id ASC';
 const items=db.prepare('SELECT j.*,d.detail_json,d.jd_text,d.job_status_desc,d.invalid_status,d.boss_active_desc,d.fetched_at detail_fetched_at'+join+where+' ORDER BY '+order+' LIMIT ? OFFSET ?').all(...params,limit,offset).map(present);
 const summary:any=db.prepare("SELECT count(*) total,sum(CASE WHEN j.screening_status='WORTH' THEN 1 ELSE 0 END) worth,sum(CASE WHEN j.screening_status='PASS' THEN 1 ELSE 0 END) pass,sum(CASE WHEN j.screening_status IN ('PENDING','NEED_DETAIL') THEN 1 ELSE 0 END) pending,sum(CASE WHEN j.screening_status='NEED_DETAIL' THEN 1 ELSE 0 END) need_detail,sum(CASE WHEN j.communication_state='SUCCEEDED' THEN 1 ELSE 0 END) communicated,sum(CASE WHEN "+eligible+" THEN 1 ELSE 0 END) eligible"+join).get();
 const locations=db.prepare("SELECT DISTINCT city FROM jobs WHERE city IS NOT NULL AND trim(city)<>'' ORDER BY city").all().map((r:any)=>r.city);
 const companies=db.prepare("SELECT brand_id id,min(brand_name) name,count(*) count FROM jobs WHERE brand_id IS NOT NULL GROUP BY brand_id ORDER BY name").all();
 const anonymous=(db.prepare("SELECT count(*) count FROM jobs WHERE brand_id IS NULL AND coalesce(json_extract(list_json,'$.goldHunter'),0)=1").get() as any).count;
 if(anonymous)companies.push({id:'__ANONYMOUS__',name:'匿名',count:anonymous});
 return{total,items,limit,offset,locations,companies,summary:{total:summary.total,worth:summary.worth??0,pass:summary.pass??0,pending:summary.pending??0,need_detail:summary.need_detail??0,communicated:summary.communicated??0,eligible:summary.eligible??0}};
}
// Statistics are read from persisted job lifecycle timestamps, never from simulated chart fixtures.
export function getJobsDashboard(db:any){
 const rows=db.prepare('SELECT first_seen_at,screening_status,screened_at,communication_state,greet_confirmed_at,education FROM jobs').all() as any[];
 const today=new Date(Date.now()+8*3600000);
 const monday=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-(today.getUTCDay()+6)%7);
 const weeks=Array.from({length:13},(_,i)=>{
  const start=monday-(12-i)*7*86400000,end=start+7*86400000;
  const iso=new Date(start).toISOString().slice(0,10);
  return {date:iso,label:iso.slice(5).replace('-','/'),start,end};
 });
 const timestamps=(x:any)=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
 const events=[
  {name:'received',date:'first_seen_at',valid:(_row:any)=>true},
  {name:'pass',date:'screened_at',valid:(r:any)=>r.screening_status==='PASS'},
  {name:'communicated',date:'greet_confirmed_at',valid:(r:any)=>r.communication_state==='SUCCEEDED'}
 ];
 const points=weeks.map(w=>{
  const v:any={date:w.date,label:w.label};
  for(const e of events){
   v[e.name+'New']=0;v[e.name+'Total']=0;
   for(const row of rows){
    if(!e.valid(row))continue;
    const at=timestamps(row[e.date])??(e.name==='pass'?timestamps(row.first_seen_at):null);
    if(at==null)continue;
    if(at<w.end)v[e.name+'Total']++;
    if(at>=w.start&&at<w.end)v[e.name+'New']++;
   }
  }
  return v;
 });
 const education={不限:0,大专:0,本科:0,'其他/未提供':0};
 const judgment={WORTH:0,PENDING:0,PASS:0};
 for(const r of rows){
  if(r.screening_status==='WORTH'){
   const e=String(r.education||'');
   if(/本科/.test(e))education.本科++;
   else if(/大专/.test(e))education.大专++;
   else if(/不限|无要求/.test(e))education.不限++;
   else education['其他/未提供']++;
  }
  const status=r.screening_status==='NEED_DETAIL'?'PENDING':r.screening_status;
  if(Object.hasOwn(judgment,status))judgment[status as keyof typeof judgment]++;
 }
 return{window:'recent-13-weeks',weeks:points,education,judgment,total:rows.length,
  methodology:'Timeline counts current PASS status by screened_at and confirmed communication by greet_confirmed_at; historical status transitions are not available.'};
}
