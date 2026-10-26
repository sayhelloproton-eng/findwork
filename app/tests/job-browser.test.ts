import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createApp} from '../server/server.ts';
const chrome=process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'/usr/bin/google-chrome');
const runner='('+async function(){
 const out=document.createElement('pre');out.id='browser-test-result';document.body.append(out);
 const wait=async(fn,name)=>{for(let i=0;i<170;i++){if(fn())return;await new Promise(r=>setTimeout(r,60));}throw Error('TIMEOUT_'+name);};
 const collectionTest=new URL(location.href).searchParams.has('collection-launch-test');
 const checks=[];
 const stage=name=>{out.textContent=JSON.stringify({ok:false,stage:name,checks});};stage('boot');
 try{
  await wait(()=>document.querySelectorAll('.ant-table-tbody tr').length>0,'table');
  if(location.pathname.includes('communications')){
   await wait(()=>document.querySelector('.communication-tabs'),'tabs');stage('tabs');
   if(!document.body.innerText.includes('值得投递 · 可沟通')||!document.body.innerText.includes('今日已沟通'))throw Error('TABS_MISSING');
   if(document.body.innerText.includes('复制 AI 执行提示词'))throw Error('RETIRED_ACTION');
   const opened=[];
   window.open=()=>({closed:false,close(){this.closed=true;},location:{replace:url=>opened.push(url)}});
   window.postMessage({type:'FINDWORK_BOSS_EXTENSION_INFO',extensionId:'a'.repeat(32),version:'1.1.22',protocolVersion:2,capabilities:['greet-enqueue','queue-observation','pre-send-check','manual-retry','clear-completed']},location.origin);
   await wait(()=>document.body.innerText.includes('沟通扩展已连接'),'capabilities');stage('capabilities');
   document.querySelector('.ant-table-tbody tr[data-row-key] input[type="checkbox"]:not(:disabled)').click();
   await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.includes('一键沟通（1）')&&!b.disabled),'selection');
   stage('selection');[...document.querySelectorAll('button')].find(b=>b.textContent.includes('一键沟通（1）')).click();
   await wait(()=>opened.length===1,'parameter-page');
   const url=new URL(opened[0]);if(url.protocol!=='chrome-extension:'||url.pathname!=='/actions/greet/greet.html'||!url.searchParams.get('actionId')||!url.searchParams.get('securityId'))throw Error('BAD_GREET_PARAMETERS');
   checks.push('worker capability gate, selected synthetic job, reservation response and parameter URL; real tab open mocked');
  }else{
   await wait(()=>document.querySelectorAll('.dashboard-panel canvas').length===4,'charts');
   if(!document.body.innerText.includes('每日新增收录岗位趋势'))throw Error('CHART_TITLE');
   if(document.querySelectorAll('tr.job-row').length!==15)throw Error('SYNTHETIC_ROWS');
   document.querySelector('tr.job-row .job-name').click();
   await wait(()=>document.querySelector('.ant-table-expanded-row .jd-text'),'full-jd');
   checks.push('current four charts,15 synthetic jobs and full JD');
   const collect=[...document.querySelectorAll('.worktable-header button')].find(b=>b.textContent==='采集岗位');if(!collect)throw Error('COLLECTION_HEADER_BUTTON');collect.click();
   await wait(()=>document.querySelector('textarea[aria-label="采集完成后交给 AI 的提示词"]')?.value.includes('skills/job-search/SKILL.md'),'collection-prompt');
   const dialog=document.querySelector('.ant-modal');if(!dialog.innerText.includes('预计采集 300 条'))throw Error('COLLECTION_COUNT');
   if(!dialog.querySelector('input[aria-label="求职期望序号"]')||!dialog.querySelector('input[aria-label="采集页数"]'))throw Error('COLLECTION_FIELDS');
   const copy=[...dialog.querySelectorAll('button')].find(b=>b.textContent==='复制提示词');if(!copy||copy.disabled)throw Error('COLLECTION_COPY');
   let copied='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copied=text;}}});copy.click();await wait(()=>copied.includes('import-list')&&copied.includes('不授权打招呼'),'collection-copy-content');
   const launch=[...dialog.querySelectorAll('button')].find(b=>b.textContent==='确认并打开扩展采集页');if(!launch?.disabled)throw Error('COLLECTION_UNCONNECTED_MUST_BE_DISABLED');
   if(collectionTest){
    const launchRequests=[];let statusRequests=0;
    window.open=()=>{throw Error('DIRECT_COLLECTION_TAB_OPEN_FORBIDDEN');};
    window.addEventListener('message',e=>{
     if(e.source!==window||!['FINDWORK_COLLECTION_LAUNCH','FINDWORK_COLLECTION_STATUS'].includes(e.data?.type))return;
     const m=e.data;let result;
     if(m.type==='FINDWORK_COLLECTION_LAUNCH'){launchRequests.push(m);result={ok:true,requestId:m.requestId,expect:m.expect,pages:m.pages,startedAt:new Date().toISOString(),tabId:99};}
     else result={ok:true,canStart:++statusRequests>1,reason:'COLLECTION_RUNNING'};
     window.postMessage({type:'FINDWORK_COLLECTION_REPLY',requestId:m.requestId,extensionId:m.extensionId,result},location.origin);
    });
    window.postMessage({type:'FINDWORK_BOSS_EXTENSION_INFO',extensionId:'a'.repeat(32),capabilities:['detail-collection-launch-v2']},location.origin);
    await wait(()=>!launch.disabled,'collection-capabilities');launch.click();
    await wait(()=>launchRequests.length===1&&document.querySelector('textarea[aria-label="采集完成后交给 AI 的提示词"]').value.includes(launchRequests[0].requestId),'collection-launch-ack');
    if(!launch.disabled||!dialog.querySelector('input[aria-label="采集页数"]').disabled)throw Error('COLLECTION_NOT_LOCKED');
    const next=[...dialog.querySelectorAll('button')].find(b=>b.textContent==='核查并准备下一批');await wait(()=>!next.disabled,'next-check-ready');next.click();
    await wait(()=>dialog.innerText.includes('本批仍在采集'),'active-collection-blocked');
    await wait(()=>!next.disabled,'next-check-ready-again');next.click();await wait(()=>!launch.disabled,'completed-collection-unlocked');
    launch.click();await wait(()=>launchRequests.length===2,'second-collection-request');if(launchRequests[0].requestId===launchRequests[1].requestId)throw Error('NEW_COLLECTION_ID_REUSED');
    checks.push('real React collection ACK flow, pending-batch guard and preparation of next batch; extension bridge mocked, no BOSS calls');
   }
   checks.push('collection modal numeric fields,300-job preview, handoff prompt and disabled demo launch; no BOSS access');
  }
  out.textContent=JSON.stringify({ok:true,checks});
 }catch(e){out.textContent=JSON.stringify({ok:false,error:e.message,checks,buttons:[...document.querySelectorAll('button')].map(b=>b.textContent),checkboxes:[...document.querySelectorAll('input[type="checkbox"]')].map(x=>({checked:x.checked,disabled:x.disabled}))});}
}.toString()+')();';

test('isolated real Chrome renders current worktables, ECharts, filters and Greet entry without sending',
 {skip:!existsSync(chrome),timeout:75000},async()=>{
 const app=createApp({demo:true}),profile=mkdtempSync(join(tmpdir(),'findwork-browser-'));
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 const proxy=createServer(async(req,res)=>{
  try{
   if(req.url==='/browser-test-runner.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(runner);return;}
   const chunks=[];for await(const x of req)chunks.push(x);
   // Browser integration uses synthetic API responses; it never reserves a real job
   // or opens an extension tab, even if this machine has a live BOSS profile.
   if(req.url==='/api/communications/batch'&&req.method==='POST'){
    const body=JSON.parse(Buffer.concat(chunks).toString());res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({accepted:body.jobIds.length,items:body.jobIds.map(jobId=>({jobId,securityId:'synthetic-security',actionId:'synthetic-action'}))}));return;
   }
   const headers={};
   if(req.headers['content-type'])headers['content-type']=req.headers['content-type'];
   if(req.headers.origin)headers.origin=base;
   const source=await fetch(base+req.url,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined});
   const outgoing=Object.fromEntries(source.headers);delete outgoing['content-length'];delete outgoing['transfer-encoding'];
   let body=await source.text();
   if(req.url?.startsWith('/api/jobs?')&&req.headers.referer?.includes('collection-launch-test')){const data=JSON.parse(body);data.demo=false;body=JSON.stringify(data);}
   if(req.url?.startsWith('/api/communications/candidates')){const data=JSON.parse(body);data.items=data.items.map(j=>({...j,job_id:'synthetic-'+j.job_id}));body=JSON.stringify(data);}
   if(req.url==='/'||req.url==='/communications'||req.url?.startsWith('/?collection-launch-test'))body=body.replace('</body>','<script type="module" src="/browser-test-runner.js"></script></body>');
   res.writeHead(source.status,outgoing);res.end(body);
  }catch(e){res.writeHead(500);res.end('TEST_PROXY_FAILURE');}
 });
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 try{
  for(const route of ['/','/communications','/?collection-launch-test=1']){
   const flags=['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--disable-extensions','--disable-dev-shm-usage',
    '--user-data-dir='+profile,'--window-size=1680,1050','--dump-dom',
    '--virtual-time-budget=20000','http://127.0.0.1:'+proxy.address().port+route];
   const {stdout}=await promisify(execFile)(chrome,flags,{timeout:32000,maxBuffer:14*1024*1024});
   const text=stdout.match(/<pre id="browser-test-result">([^<]*)<\/pre>/);
   assert.ok(text,'Chrome returned no client proof for '+route+': '+stdout.slice(-1500));
   const evidence=JSON.parse(text[1].replace(/&quot;/g,'"').replace(/&amp;/g,'&'));
   assert.equal(evidence.ok,true,JSON.stringify({route,...evidence}));
   assert.ok(evidence.checks.length>0);
  }
 }finally{
  await new Promise(r=>proxy.close(r));await app.close();
  try{rmSync(profile,{recursive:true,force:true,maxRetries:15,retryDelay:200});}
  catch(e){if(process.env.CI)throw e;}
 }
});
