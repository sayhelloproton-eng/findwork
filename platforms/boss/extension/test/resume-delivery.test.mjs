import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
const src=fs.readFileSync(new URL('../actions/greet/resume-delivery.js',import.meta.url),'utf8'),KEY='boss-resume-delivery-v1';
const job={id:'synthetic-job-001',securityId:'synthetic-security'};
function harness({canSend=true,alreadySent=false,precheck=0,resumes=[{resumeId:1,resumeName:'合成简历.pdf'}],response={code:0},networkFailure=false,download='COMPLETE',checkAllowed=true,onPrepare=null}={}){
 let saved,id=0;const calls=[],records=[],listeners=[];
 const chrome={storage:{local:{get:async()=>({[KEY]:structuredClone(saved)}),set:async x=>{saved=structuredClone(x[KEY]);}}},
 runtime:{id:'synthetic-ext',getURL:p=>'chrome-extension://synthetic-ext/'+p,onMessage:{addListener:f=>listeners.push(f)}},
 tabs:{query:async()=>[{id:1,url:'https://www.zhipin.com/web/geek/jobs'}]},
 scripting:{executeScript:async({func,args})=>[{result:await func(args[0])}]}};
 const fetch=async(url,opts={})=>{
  calls.push({url:String(url),options:opts});
  if(String(url).startsWith('http://127.0.0.1:'))return{ok:checkAllowed,json:async()=>({allowed:checkAllowed})};
  if(String(url).includes('/job/detail.json?'))return{status:200,json:async()=>({code:0,zpData:{jobInfo:{encryptId:job.id,invalidStatus:false},oneKeyResumeInfo:{canSendResume:canSend,alreadySend:alreadySent},securityId:'fresh-synthetic-security',lid:'synthetic-lid'}})};
  if(String(url).includes('/exchange/precheck/')){if(onPrepare)await onPrepare();return{status:200,json:async()=>({code:0,zpData:{status:precheck}})};}
  if(String(url).includes('/attachment/checkbox.json'))return{status:200,json:async()=>({code:0,zpData:{resumeCount:resumes.length,resumeList:resumes}})};
  assert.match(String(url),/\/resume\/onekeydeliver.json\?/);
  assert.equal(opts.method,'POST');assert.equal(opts.credentials,'include');
  assert.equal(new URL('https://example.invalid'+url).searchParams.get('securityId'),'fresh-synthetic-security');
  if(networkFailure)throw Error('synthetic-timeout');return{status:200,json:async()=>response};
 };
 const context=vm.createContext({chrome,fetch,URL,URLSearchParams,Date,Intl,AbortSignal,crypto:{randomUUID:()=>String(++id)},location:{origin:'https://www.zhipin.com',pathname:'/web/geek/jobs'},document:{readyState:'complete',querySelector:()=>({})}});
 vm.runInContext(src,context);const owner=context.BossResumeDelivery;owner.install();
 const sender={id:'synthetic-ext',url:'chrome-extension://synthetic-ext/actions/greet/greet.html'};
 const message=(m,from=sender)=>new Promise(resolve=>{for(const f of listeners){const r=f(m,from,resolve);if(r===true)return;} });
 const run=async extra=>{const intent=await owner.captureIntent();return owner.afterGreet({...job,...extra,resumeIntent:intent},async(record,filename)=>{records.push({record:JSON.parse(JSON.stringify(record)),filename});return{status:download};});};
 return{owner,message,run,calls,records,state:()=>saved};
}
test('default off and foreign pages cannot authorize a resume request',async()=>{
 const h=harness();assert.equal((await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true},{id:'synthetic-ext',url:'http://127.0.0.1/communications'})).reason,'INVALID_GREET_PAGE');assert.equal(await h.owner.captureIntent(),null);await h.run();assert.equal(h.calls.length,0);assert.equal(h.records.length,0);
});
test('unsupported or already-sent jobs skip without a mutating request',async()=>{
 for(const opts of [{canSend:false},{alreadySent:true}]){const h=harness(opts);await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.run();assert.equal(h.state().results[job.id].status,'SKIPPED');assert.equal(h.calls.length,1);assert.equal(h.records.length,0);}
});
test('multiple attachments require explicit selection, never first item by default',async()=>{
 const h=harness({resumes:[{resumeId:1},{resumeId:2}]});await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.run();
 assert.equal(h.state().halt.reason,'SELECT_ATTACHMENT_RESUME');assert.equal(h.calls.some(c=>c.url.includes('onekeydeliver')),false);
 const picked=await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true,resumeId:'2',continue:true});assert.equal(picked.ok,true);
 // Continue never replays the already failed job.
 await h.run();assert.equal(h.calls.some(c=>c.url.includes('onekeydeliver')),false);
});
test('native confirmation, missing attachments and denied Findwork check stop before submission',async()=>{
 for(const opts of [{precheck:1},{resumes:[]},{checkAllowed:false}]){
  const h=harness(opts);await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.run(opts.checkAllowed===false?{actionId:'synthetic-action',serverOrigin:'http://127.0.0.1:4318'}:{});
  assert.equal(h.state().results[job.id].status,'FAILED');assert.equal(h.calls.some(c=>c.url.includes('onekeydeliver')),false);
 }
});
test('unconfirmed response or undurable receipt cannot continue or retry',async()=>{
 for(const [opts,status] of [[{networkFailure:true},'UNKNOWN'],[{download:'FAILED'},'UNKNOWN']]){
  const h=harness(opts);await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.run();assert.equal(h.state().results[job.id].status,status);
  const before=h.calls.length;await h.run();assert.equal(h.calls.length,before);
  if(status==='UNKNOWN'){const r=await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true,continue:true});assert.equal(r.reason,'RESUME_UNKNOWN_STOP');}
 }
});
test('switch changes invalidate queued intent; disable during preparation stops POST',async()=>{
 const h=harness();await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true});const intent=await h.owner.captureIntent();await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:false});await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h.owner.afterGreet({...job,resumeIntent:intent},()=>assert.fail());assert.equal(h.calls.length,0);
 let changing;const h2=harness({onPrepare:async()=>changing.message({type:'RESUME_DELIVERY_SETTINGS',enabled:false})});changing=h2;await h2.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true});await h2.run();assert.equal(h2.calls.some(c=>c.url.includes('onekeydeliver')),false);
});
function ui(state={},search='',reply={ok:true}){
 class Element{constructor(){this.children=[];this.events={};this.value='';this.disabled=false;this.textContent='';}replaceChildren(){this.children=[];}append(x){this.children.push(x);}addEventListener(k,f){this.events[k]=f;}}
 const elements=new Map(),messages=[];const get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 vm.runInNewContext(fs.readFileSync(new URL('../actions/greet/resume-delivery-ui.js',import.meta.url),'utf8'),{location:{search},document:{getElementById:get,createElement:()=>new Element()},chrome:{storage:{local:{get:async()=>({[KEY]:structuredClone(state)})},onChanged:{addListener(){}}},runtime:{sendMessage:async m=>{messages.push(m);return reply;}}}});
 return{get,messages,flush:async()=>{for(let i=0;i<10;i++)await new Promise(setImmediate);}};
}
test('same-page controls default off and disable continuation for unknown or active resume actions',async()=>{
 const off=ui();await off.flush();assert.equal(off.get('resume-enabled').checked,false);assert.equal(off.get('resume-options').disabled,true);assert.equal(off.messages.length,0);
 for(const state of [{enabled:true,halt:{unknown:true,reason:'unknown'}},{enabled:true,active:{jobId:'synthetic'},halt:{unknown:false}}]){const h=ui(state);await h.flush();assert.equal(h.get('resume-continue').disabled,true);assert.equal(h.get('resume-file').disabled,Boolean(state.active));}
 const parameter=ui({},'?jobId=synthetic&securityId=synthetic');await parameter.flush();assert.equal(parameter.messages.length,0);
});
test('rejected settings remain visible and never report an enabled switch',async()=>{
 const h=ui({},'',{ok:false,reason:'INVALID_GREET_PAGE'});await h.flush();h.get('resume-enabled').checked=true;await h.get('resume-enabled').events.change();await h.flush();assert.equal(h.get('resume-enabled').checked,false);assert.match(h.get('resume-status').textContent,/INVALID_GREET_PAGE/);assert.equal(h.messages.length,1);
});

test('attachment selection is captured at enqueue; later selection cannot change an authorized task',async()=>{
 const h=harness({resumes:[{resumeId:1},{resumeId:2}]});await h.message({type:'RESUME_DELIVERY_OPTIONS'});await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true,resumeId:'1'});const intent=await h.owner.captureIntent();await h.message({type:'RESUME_DELIVERY_SETTINGS',enabled:true,resumeId:'2'});
 await h.owner.afterGreet({...job,resumeIntent:intent},async()=>({status:'COMPLETE'}));
 const sent=h.calls.find(c=>c.url.includes('onekeydeliver'));assert.equal(new URL('https://example.invalid'+sent.url).searchParams.get('resumeId'),'1');
});
