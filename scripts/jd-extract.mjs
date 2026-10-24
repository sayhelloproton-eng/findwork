// Source-extractive JD sections only; not a model-based assessment. Never changes WORTH/PASS/PENDING.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {importAiSummaries} from '../app/db/ingestion/job-store.ts';
const sha=x=>createHash('sha256').update(x).digest('hex');
const headers=[
 ['responsibilities',/^(?:岗位职责|工作职责|职位职责|岗位描述|职位描述|工作内容|主要职责|职责描述|你会做的事|你将负责|我们在做什么)[：:、]?\s*(.*)$/],
 ['requirements',/^(?:任职要求|任职资格|岗位要求|职位要求|任职条件|职位条件|能力要求|我们希望你|我们希望|你需要具备|招聘要求|我们需要你|要求)[：:、]?\s*(.*)$/],
 ['bonus',/^(?:加分项|优先考虑|加分条件|优先条件|额外加分)[：:、]?\s*(.*)$/],
 ['notices',/^(?:工作方式|办公方式|其他要求|注意事项|补充说明)[：:、]?\s*(.*)$/],
 ['skip',/^(?:福利待遇|薪酬福利|福利|待遇|薪资待遇|公司福利|我们提供|你能得到|关于我们)[：:、]?\s*(.*)$/]
];
export function extractJD(jobName,source){
 if(typeof source!=='string'||!source.trim())return null;
 const entries={responsibilities:[],requirements:[],bonus:[],notices:[]};
 let mode=null;
 const lines=source.replace(/\r/g,'').split('\n').map(v=>v.trim()).filter(Boolean);
 for(const raw of lines){
  const text=raw.replace(/^[\s#*•·\-]+/,'').replace(/^【(.+?)】\s*$/,'$1').replace(/^\d+[.、)）]\s*/,'').trim();
  if(!text)continue;
  let item=text;
  let matched=false;
  for(const [key,re] of headers){
   const m=text.match(re);
   if(m){
    mode=key;
    item=(m[1]||'').trim();
    matched=true;
    break;
   }
  }
  if(matched&&!item)continue;
  if(mode==='skip'||!mode)continue;
  if(item.length>360)continue;
  if(!entries[mode]||entries[mode].length>=12)continue;
  // Retain source text, only remove list-numbering; never invent facts or split unrelated sections.
  if(!entries[mode].includes(item))entries[mode].push(item);
 }
 if(!entries.responsibilities.length||!entries.requirements.length)return null;
 return{headline:('原文摘录｜'+String(jobName||'岗位')).slice(0,250),
  responsibilities:entries.responsibilities,requirements:entries.requirements,
  bonus:entries.bonus,notices:entries.notices};
}
export function planJDExtraction(db,date){
 const q=db.prepare("SELECT j.job_id,j.job_name,d.jd_text FROM jobs j JOIN job_details d ON d.job_id=j.job_id WHERE date(j.first_seen_at,'+8 hours')=? AND j.ai_summary_json IS NULL ORDER BY j.job_id");
 const rows=q.all(date),items=[],skipped=[];
 for(const job of rows){
  const summary=extractJD(job.job_name,job.jd_text);
  if(!summary){skipped.push(job.job_id);continue;}
  items.push({jobId:job.job_id,sourceHash:sha(job.jd_text),summary});
 }
 const signature=sha(JSON.stringify(items.map(x=>[x.jobId,x.sourceHash])));
 return{date,eligible:rows.length,extractable:items.length,skipped:skipped.length,items,signature};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const db=new DatabaseSync(resolve(process.env.FINDWORK_DB_PATH||'app/db/runtime/jobs.sqlite'));
 try{
  db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;');
  const mode=process.argv[2]||'preview';
  if(!['preview','apply'].includes(mode))throw Error('INVALID_MODE');
  const latest=db.prepare("SELECT max(date(first_seen_at,'+8 hours')) d FROM jobs").get().d;
  const date=process.argv[3]||latest;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('INVALID_DAY');
  const p=planJDExtraction(db,date);
  if(mode==='preview')console.log(JSON.stringify({mode,date,eligible:p.eligible,extractable:p.extractable,skipped:p.skipped,signature:p.signature}));
  else{
   if(!process.argv[4]||process.argv[4]!==p.signature)throw Error('EXTRACTION_PREVIEW_CHANGED');
   const results=[];
   for(let start=0;start<p.items.length;start+=300)results.push(importAiSummaries(db,{contract:'job-ai-summaries.v1',items:p.items.slice(start,start+300)}));
   const auditDir=resolve(process.env.FINDWORK_BACKUP_DIR||'app/db/runtime/backups');
   mkdirSync(auditDir,{recursive:true,mode:0o700});
   const auditPath=join(auditDir,'jd-source-extract-'+date+'.json');
   writeFileSync(auditPath,JSON.stringify({contract:'findwork-source-extraction.v1',date,method:'deterministic source-only, not LLM',items:p.items.map(x=>({jobId:x.jobId,sourceHash:x.sourceHash})),skipped:p.skipped,signature:p.signature},null,2),{mode:0o600});
   console.log(JSON.stringify({mode,date,extracted:results.reduce((n,r)=>n+r.stored,0),skipped:p.skipped,auditPath}));
  }
 }finally{db.close();}
}
