import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=f=>fs.readFileSync(new URL('../actions/greet/'+f,import.meta.url),'utf8');
const source=['greet-state.js','resume-delivery.js','greet-queue.js'].map(read).join('\n');
const G='boss-greet-queue-v1',R='boss-resume-delivery-v1',a='synthetic-job-0001',b='synthetic-job-0002';
function scene({initial={},resumeResponse={code:0},ambiguousGreet=false,remindOnce=false,crashAfterHandoff=false,crashDuringResumeReceipt=false}={}){
 let now=Date.parse('2026-10-27T01:00:00Z'),uuid=0,crashed=false,snapshot=null;
 const storage=structuredClone(initial),listeners=[],timers=[],calls=[],records=[];let ctx;
 class Clock extends Date{constructor(...v){super(...(v.length?v:[now]));}static now(){return now;}}
 const fetch=async(url,options={})=>{
  url=String(url);calls.push({url,options});const u=new URL(url,'https://www.zhipin.com'),id=u.searchParams.get('jobId');
  let p;
  if(u.pathname==='/api/communications/retry')return{ok:true,json:async()=>({jobId:a,securityId:'synthetic-security',actionId:'synthetic-new-action'})};
  if(u.pathname.includes('/api/'))return{ok:true,json:async()=>({allowed:true})};
  if(u.pathname==='/wapi/zpgeek/friend/add.json'){
   const first=calls.filter(c=>c.url==='/wapi/zpgeek/friend/add.json').length===1;
   p=ambiguousGreet?{}:remindOnce&&first?{code:1,message:'开聊提醒',zpData:{bizData:{chatRemindDialog:{blockLevel:0,title:'提醒',content:'合成提醒'}}}}:{code:0};
  }else if(u.pathname.includes('/job/detail.json'))p={code:0,zpData:{jobInfo:{encryptId:id},oneKeyResumeInfo:{canSendResume:true,alreadySend:false},securityId:'fresh-synthetic',lid:'synthetic-lid'}};
  else if(u.pathname.includes('/exchange/precheck/'))p={code:0,zpData:{status:0}};
  else if(u.pathname.includes('/attachment/checkbox'))p={code:0,zpData:{resumeCount:1,resumeList:[{resumeId:'synthetic-resume',resumeName:'合成附件.pdf'}]}};
  else if(u.pathname.includes('/resume/onekeydeliver')){assert.equal(options.method,'POST');assert.equal(options.credentials,'include');assert.equal(u.searchParams.get('securityId'),'fresh-synthetic');p=resumeResponse;}
  else throw Error('UNEXPECTED_SYNTHETIC_URL '+url);
  return{status:200,json:async()=>structuredClone(p)};
 };
 const chrome={runtime:{id:'synthetic-extension',getURL:p=>'chrome-extension://synthetic-extension/'+p,onMessage:{addListener:f=>listeners.push(f)}},
  storage:{local:{get:async key=>key===null?structuredClone(storage):typeof key==='string'?{[key]:structuredClone(storage[key])}:Object.fromEntries(key.map(k=>[k,structuredClone(storage[k])])),
   set:async values=>{Object.assign(storage,structuredClone(values));if(crashAfterHandoff&&!crashed&&values[G]?.results?.[a]?.resumeTask?.status==='PENDING'&&!storage[R]?.active){crashed=true;snapshot=structuredClone(storage);throw Error('SYNTHETIC_WORKER_TERMINATION');}if(crashDuringResumeReceipt&&!crashed&&values[R]?.active?.stage==='RECEIPT_PENDING'){crashed=true;snapshot=structuredClone(storage);throw Error('SYNTHETIC_RECEIPT_INTERRUPTION');}}}},
  tabs:{query:async()=>[{id:10,url:'https://www.zhipin.com/web/geek/jobs'},{id:20,url:'http://127.0.0.1:4318/communications'}]},
  scripting:{executeScript:async({func,args,target})=>{const original=ctx.location;if(target.tabId===20)ctx.location={origin:'http://127.0.0.1:4318',pathname:'/communications'};try{return[{result:await func(args[0])}];}finally{ctx.location=original;}}},
  alarms:{create:async()=>{},clear:async()=>{},onAlarm:{addListener(){}}},downloads:{onChanged:{addListener(){},removeListener(){}},download:async info=>{records.push({record:JSON.parse(decodeURIComponent(info.url.split(',').slice(1).join(','))),filename:info.filename});return records.length;},search:async({id})=>records[id-1]?[{state:'complete',exists:true,filename:'/synthetic/Downloads/'+records[id-1].filename}]:[]}};
 ctx=vm.createContext({chrome,fetch,Date:Clock,Intl,Math,AbortSignal,URL,URLSearchParams,crypto:{randomUUID:()=>String(++uuid).padStart(32,'0')},document:{readyState:'complete',querySelector:()=>({})},location:{origin:'https://www.zhipin.com',pathname:'/web/geek/jobs'},setTimeout:(fn,ms)=>{const t={fn,at:now+ms,active:true};timers.push(t);return t;},clearTimeout:t=>{t.active=false;}});
 vm.runInContext(source,ctx);ctx.BossResumeDelivery.install();ctx.BossGreetQueue.install();
 const send=m=>new Promise(resolve=>{for(const fn of listeners){if(fn(m,{id:'synthetic-extension',url:chrome.runtime.getURL('actions/greet/greet.html')},resolve)===true)return;}});
 const flush=async()=>{for(let i=0;i<100;i++)await new Promise(setImmediate);};
 const step=async()=>{await flush();const t=timers.filter(t=>t.active).sort((x,y)=>x.at-y.at)[0];if(t){t.active=false;now=t.at;t.fn();await flush();}};
 const enqueue=id=>send({type:'GREET_QUEUE_ENQUEUE',jobId:id,securityId:'synthetic-security',actionId:'synthetic-action',serverOrigin:'http://127.0.0.1:4318'});
 return{storage,calls,records,send,flush,step,enqueue,snapshot:()=>snapshot,rules:ctx.BossGreetState};
}
const greets=h=>h.calls.filter(c=>c.url==='/wapi/zpgeek/friend/add.json');
const resumes=h=>h.calls.filter(c=>c.url.startsWith('/wapi/zpgeek/resume/onekeydeliver.json?'));
test('real queue plus real resume owner stop later Greet after platform security, including restart',async()=>{
 const h=scene({resumeResponse:{code:37,message:'合成安全验证'}});await h.send({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.enqueue(a);await h.enqueue(b);await h.flush();await h.step();
 assert.equal(greets(h).length,1);assert.equal(resumes(h).length,1);assert.equal(h.storage[G].paused.kind,'SECURITY');assert.equal(h.storage[G].results[a].status,'SUCCESS');assert.equal(h.storage[G].queue[0].id,b);assert.equal((await h.send({type:'RESUME_DELIVERY_SETTINGS',enabled:true,continue:true})).ok,false);
 const restart=scene({initial:h.storage});await restart.flush();await restart.step();assert.equal(greets(restart).length,0);assert.equal(resumes(restart).length,0);assert.equal(restart.storage[G].paused.kind,'SECURITY');
});
test('atomic Greet handoff survives worker loss before resume registration; recovered task sends once',async()=>{
 const h=scene({crashAfterHandoff:true});await h.send({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.enqueue(a);await h.flush();
 const saved=h.snapshot();assert.equal(saved[G].results[a].status,'SUCCESS');assert.equal(saved[G].results[a].resumeTask.status,'PENDING');assert.equal(saved[R].active,null);assert.equal(resumes(h).length,0);
 const recovered=scene({initial:saved});await recovered.flush();assert.equal(greets(recovered).length,0);assert.equal(resumes(recovered).length,1);assert.equal(recovered.storage[G].results[a].resumeTask.status,'DONE');
 const again=scene({initial:recovered.storage});await again.flush();assert.equal(resumes(again).length,0);
});
test('interrupted resume SENDING is reconciled to review without replay or downgrading Greet',async()=>{
 const initial={[G]:{queue:[],active:null,paused:null,lastFinishedAt:0,nextEligibleAt:0,results:{[a]:{status:'SUCCESS',download:{status:'COMPLETE'},resumeTask:{status:'PENDING',job:{id:a,resumeIntent:{generation:1}}}}}},[R]:{enabled:true,generation:1,results:{},active:{jobId:a,actionId:'synthetic-app',stage:'SENDING',resumeId:'synthetic-resume',resumeName:'合成附件.pdf'}}};
 const h=scene({initial});await h.flush();assert.equal(resumes(h).length,0);assert.equal(h.storage[G].results[a].status,'SUCCESS');assert.equal(h.storage[G].results[a].resumeTask.status,'REVIEW_REQUIRED');assert.equal(h.storage[R].results[a].resumeId,'synthetic-resume');assert.equal(h.storage[R].results[a].status,'UNKNOWN');assert.equal(h.rules.cleanupPlan(h.storage[G]).allowed,false);
});
test('formal retry keeps authorized resume snapshot and actual submitted attachment in raw receipt',async()=>{
 const h=scene({remindOnce:true});await h.send({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.enqueue(a);await h.flush();const failed=h.storage[G].results[a];assert.ok(failed.retryRequest.resumeIntent);
 assert.equal((await h.send({type:'GREET_QUEUE_RETRY',jobId:a,retryAt:failed.at})).ok,true);await h.step();await h.flush();assert.equal(greets(h).length,2);assert.equal(resumes(h).length,1);
 const file=h.records.find(r=>r.record.contract==='job-application-result.v1'),r=file.record;assert.equal(r.resumeId,'synthetic-resume');assert.equal(r.resumeName,'合成附件.pdf');assert.equal(h.storage[R].results[a].resumeId,r.resumeId);assert.equal(r.greetActionId,'synthetic-new-action');assert.equal(r.result,'SUCCESS');assert.equal(r.confirmed,true);assert.match(file.filename,/BOSS\/\d{4}-\d{2}-\d{2}\/application\//);
});
test('unknown greeting is consistently UNKNOWN, blocks cleanup across midnight and never triggers resume',async()=>{
 const h=scene({ambiguousGreet:true});await h.send({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.enqueue(a);await h.flush();assert.equal(h.storage[G].results[a].status,'UNKNOWN');assert.equal(h.records[0].record.result,'UNKNOWN');assert.equal(resumes(h).length,0);assert.equal(h.rules.cleanupPlan(h.storage[G],Date.parse('2026-10-28T01:00:00Z')).allowed,false);
});
test('ordinary resume rejection keeps Greet successful and allows subsequent Greet',async()=>{
 const h=scene({resumeResponse:{code:1,message:'合成普通拒绝'}});await h.send({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.enqueue(a);await h.enqueue(b);await h.flush();await h.step();assert.equal(greets(h).length,2);assert.equal(h.storage[G].paused,null);assert.equal(h.storage[G].results[a].status,'SUCCESS');assert.equal(h.storage[G].results[b].status,'SUCCESS');
});

test('platform stop survives interruption before application receipt download completes',async()=>{
 const h=scene({resumeResponse:{code:37,message:'合成安全验证'},crashDuringResumeReceipt:true});await h.send({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.enqueue(a);await h.enqueue(b);await h.flush();const saved=h.snapshot();assert.equal(saved[R].halt.requiresReview,true);assert.equal(saved[R].active.stage,'RECEIPT_PENDING');
 const restart=scene({initial:saved});await restart.flush();await restart.step();assert.equal(greets(restart).length,0);assert.equal(resumes(restart).length,0);assert.equal(restart.storage[G].results[a].status,'SUCCESS');assert.equal(restart.storage[G].results[a].resumeTask.status,'REVIEW_REQUIRED');assert.equal(restart.storage[R].results[a].status,'UNKNOWN');
});
