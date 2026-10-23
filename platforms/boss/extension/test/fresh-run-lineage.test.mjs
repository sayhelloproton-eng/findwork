import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
const source=fs.readFileSync(path.resolve(import.meta.dirname,'..','actions/detail/dom-native-store.js'),'utf8');
test('natural Detail retains current Fresh runId, old run cannot claim COMPLETE',async()=>{
 const records={};
 const listeners=[];const downloads=[];
 const chrome={
  runtime:{id:'extension-fixture',onMessage:{addListener:fn=>listeners.push(fn)}},
  storage:{local:{
   get:async key=>{
    if(key===null)return records;
    return {[key]:records[key]};
   },
   set:async obj=>Object.assign(records,obj),
   remove:async key=>delete records[key]
  }},
  downloads:{
   download:async x=>{downloads.push(x);return 8;},
   search:async()=>[{state:'complete',exists:true,filename:'/Downloads/'+downloads.at(-1).filename}],
   onChanged:{addListener(){}}
  }
 };
 const vmContext={chrome,URL,Date,Promise,JSON,Object,String,Number,Error,
  crypto:{randomUUID:()=> 'fixture-uuid'},encodeURIComponent};
 const boss=vm.runInNewContext(source+'\nBossNaturalDetail',vmContext);
 records['boss-dom-detail-sequence-v1']={runId:'fresh-run-A',fresh:true,status:'RUNNING'};
 const event={type:'BOSS_RAW_DETAIL_RESPONSE',path:'/wapi/zpgeek/job/detail.json',
  docId:'doc-abcdefgh123',requestId:1,httpStatus:200,
  responseBody:{code:0,zpData:{jobInfo:{encryptId:'syntheticABC2026',jobName:'虚构工程师',
   postDescription:'仅测试自然响应，没有真实职位'}}}};
 const sender={id:chrome.runtime.id,frameId:0,tab:{url:'https://www.zhipin.com/web/geek/jobs'}};
 const accepted=await boss.accept(event,sender);
 assert.equal(accepted.saved,true);
 assert.equal(records['boss-natural-detail-v1'].records.syntheticABC2026.runId,'fresh-run-A');
 boss.install();
 const listener=listeners.find(fn=>{
  let marker=false;
  try{marker=fn({type:'BOSS_NATIVE_DETAIL_LOOKUP',jobId:'invalid'},sender,()=>{})===false;}catch{}
  return marker;
 })||listeners[0];
 const ask=runId=>new Promise(resolve=>listener({type:'BOSS_NATIVE_DETAIL_LOOKUP',
  jobId:'syntheticABC2026',runId},{id:chrome.runtime.id},resolve));
 const current=await ask('fresh-run-A'),stale=await ask('fresh-run-B');
 assert.notEqual(current.status,'STALE_RUN');
 assert.equal(stale.status,'STALE_RUN');
 assert.equal(stale.downloadPath,null);
});
