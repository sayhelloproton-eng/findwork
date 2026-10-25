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
const runner="(async()=>{\n const out=document.createElement('pre');out.id='browser-test-result';document.body.append(out);\n const wait=async(fn,name)=>{for(let i=0;i<170;i++){if(fn())return;await new Promise(r=>setTimeout(r,60));}throw Error('TIMEOUT_'+name)};\n const checks=[];\n try{\n  const communications=location.pathname.includes('communications');\n  await wait(()=>document.querySelector('.ant-table-tbody')&&document.querySelectorAll('.ant-table-tbody tr').length>0,'react-table');\n  if(communications){\n   await wait(()=>document.querySelector('.communication-tabs')&&document.querySelector('button'),'communications-tabs');\n   if(!document.body.innerText.includes('值得投递')||!document.body.innerText.includes('今日已沟通'))throw Error('BOTH_TABS_MISSING');\n   if(!document.body.innerText.includes('复制 AI 执行提示词'))throw Error('COPY_PROMPT_MISSING');\n   if(document.body.innerText.includes('一键沟通（'))throw Error('OLD_SEND_BUTTON_PRESENT');\n   checks.push('communications tabs and non-sending copy action');\n  }else{\n   await wait(()=>document.querySelectorAll('.dashboard-panel').length===4,'charts');\n   await wait(()=>document.querySelectorAll('.dashboard-panel canvas').length===4,'charts-canvas');\n   if(!document.body.innerText.includes('每日新出现岗位趋势')||!document.body.innerText.includes('每日收录与沟通'))throw Error('CHART_TITLES_WRONG');\n   if(!document.querySelector('.filter-form')||!document.querySelector('.ant-pagination'))throw Error('FILTER_OR_PAGINATION_MISSING');\n   const n=document.querySelectorAll('tr.job-row').length;\n   if(n!==15)throw Error('SYNTHETIC_ROWS_'+n);\n   checks.push('four ECharts canvases and synthetic 15-row worktable');\n   const first=document.querySelector('tr.job-row .job-name');first?.click();\n   await wait(()=>!!document.querySelector('.ant-table-expanded-row .jd-text'),'job-detail');\n   checks.push('row click opens full JD');\n  }\n  out.textContent=JSON.stringify({ok:true,checks});\n }catch(e){out.textContent=JSON.stringify({ok:false,error:e.message,checks});}\n})();";
test('isolated real Chrome renders current worktables, ECharts, filters and copy-only action',
 {skip:!existsSync(chrome),timeout:75000},async()=>{
 const app=createApp({demo:true}),profile=mkdtempSync(join(tmpdir(),'findwork-browser-'));
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port;
 const proxy=createServer(async(req,res)=>{
  try{
   if(req.url==='/browser-test-runner.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(runner);return;}
   const chunks=[];for await(const x of req)chunks.push(x);
   const headers={};
   if(req.headers['content-type'])headers['content-type']=req.headers['content-type'];
   if(req.headers.origin)headers.origin=base;
   const source=await fetch(base+req.url,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined});
   const outgoing=Object.fromEntries(source.headers);delete outgoing['content-length'];delete outgoing['transfer-encoding'];
   let body=await source.text();
   if(req.url==='/'||req.url==='/communications')body=body.replace('</body>','<script type="module" src="/browser-test-runner.js"></script></body>');
   res.writeHead(source.status,outgoing);res.end(body);
  }catch(e){res.writeHead(500);res.end('TEST_PROXY_FAILURE');}
 });
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 try{
  for(const route of ['/','/communications']){
   const flags=['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
    '--disable-background-networking','--disable-extensions','--disable-dev-shm-usage',
    '--user-data-dir='+profile,'--window-size=1680,1050','--dump-dom',
    '--virtual-time-budget=10000','http://127.0.0.1:'+proxy.address().port+route];
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
