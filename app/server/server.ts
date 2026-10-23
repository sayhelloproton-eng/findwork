import { createServer as createHttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openJobsDatabase,queryJobs,getJobsDashboard,getJobDetail,decideAiJob,importApplication,getJobEvents } from '../db/ingestion/job-store.ts';
import { seedDatabase,seedLocalFixtures } from './seed.ts';
const WEB=resolve(import.meta.dirname,'../web');
const files:Record<string,[string,string]>={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/styles.css':['styles.css','text/css'],'/job-view.js':['job-view.js','text/javascript'],'/antd-entry.js':['dist/antd-entry.js','text/javascript']};
const json=(res:any,body:any,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body));};
export function createApp(options:any={}){
 const demo=!!(options.demo||options.localFixtures),db=openJobsDatabase(demo?':memory:':options.dbPath);
 try{if(options.localFixtures)seedLocalFixtures(db,options.localFixtures);else if(options.demo)seedDatabase(db);}catch(e){db.close();throw e;}
 const server=createHttpServer(async(req,res)=>{
  try{
   const url=new URL(req.url||'/','http://localhost');
   const decision=url.pathname.match(/^\/api\/jobs\/([^/]+)\/decision$/);
   const application=url.pathname.match(/^\/api\/jobs\/([^/]+)\/application$/);
   if(req.method==='POST'&&(decision||application)){
    const host=req.headers.host??'',origin=req.headers.origin;
    if(!['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+host).hostname)|| (origin&&origin!=='http://'+host))return json(res,{error:'ORIGIN_REJECTED'},403);
    if(!req.headers['content-type']?.startsWith('application/json'))return json(res,{error:'JSON_CONTENT_TYPE_REQUIRED'},415);
    let body='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>16384)throw Error('PAYLOAD_TOO_LARGE');body+=chunk;}
    let input:any;try{input=JSON.parse(body);}catch{throw Error('INVALID_JSON');}
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('INVALID_PAYLOAD');
    const wanted=decodeURIComponent((decision||application)![1]);
    const {jobId,...fields}=input;if(jobId!=null&&jobId!==wanted)throw Error('JOB_ID_MISMATCH');
    if(decision)return json(res,decideAiJob(db,{...fields,jobId:wanted}));
    return json(res,importApplication(db,{...fields,jobId:wanted}));
   }
   if(req.method!=='GET')return json(res,{error:'METHOD_NOT_ALLOWED'},405);
   if(url.pathname==='/api/jobs')return json(res,{...queryJobs(db,Object.fromEntries(url.searchParams)),demo});
   if(url.pathname==='/api/dashboard')return json(res,{...getJobsDashboard(db),demo});
   const events=url.pathname.match(/^\/api\/jobs\/([^/]+)\/events$/);
   if(events)return json(res,{items:getJobEvents(db,decodeURIComponent(events[1]))});
   if(url.pathname.startsWith('/api/jobs/'))return json(res,getJobDetail(db,decodeURIComponent(url.pathname.slice('/api/jobs/'.length))));
   const file=files[url.pathname];if(!file)return json(res,{error:'NOT_FOUND'},404);
   const nonce=url.pathname==='/'?randomBytes(16).toString('base64'):null;
   const policy="default-src 'self'; script-src 'self'; style-src 'self'"+(nonce?" 'nonce-"+nonce+"'":"")+"; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'";
   const body=readFileSync(resolve(WEB,file[0]));
   res.writeHead(200,{'content-type':file[1]+'; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':policy});
   res.end(nonce?body.toString('utf8').replace('__ANTD_STYLE_NONCE__',nonce):body);
  }catch(e:any){const code=/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:'INTERNAL_ERROR';json(res,{error:code},code==='JOB_NOT_FOUND'?404:['DECISION_CONFLICT','DECISION_SOURCE_STALE','APPLICATION_ACTION_CONFLICT'].includes(code)?409:code==='PAYLOAD_TOO_LARGE'?413:code==='INTERNAL_ERROR'?500:400);}
 });
 return{server,db,close:()=>new Promise<void>(done=>{if(!server.listening){db.close();done();return;}server.close(()=>{db.close();done();});})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const {server}=createApp({demo:process.argv.includes('--demo'),localFixtures:process.argv.includes('--local-fixtures')?resolve('.private/boss-fixtures/fixtures.json'):undefined});
 const port=Number(process.env.PORT||4317);server.listen(port,'127.0.0.1',()=>console.log(`Findwork: http://127.0.0.1:${port}`));
}
