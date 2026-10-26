import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../actions/greet/greet-state.js',import.meta.url),'utf8')+'\n'+fs.readFileSync(new URL('../actions/greet/greet.js',import.meta.url),'utf8');
function page(search='',initial={}){
 const nodes=new Map(),messages=[],removed=[],listeners=[],opened=[];
 const node=()=>({textContent:'',hidden:false,disabled:false,children:[],events:{},
  append(x){this.children.push(x);},replaceChildren(){this.children=[];},addEventListener(name,fn){this.events[name]=fn;}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 const chrome={runtime:{getURL:p=>'chrome-extension://synthetic/'+p,sendMessage:async m=>{messages.push(m);return{ok:true};}},
  tabs:{getCurrent:async()=>({id:19}),remove:async id=>removed.push(id)},
  storage:{local:{get:async()=>({'boss-greet-queue-v1':initial})},onChanged:{addListener:fn=>listeners.push(fn)}}};
 vm.runInNewContext(source,{chrome,document:{getElementById:get,createElement:node},
  location:{search},URLSearchParams,window:{confirm:()=>true,open:url=>opened.push(url)},Set,Object});
 const flush=async()=>{for(let i=0;i<8;i++)await new Promise(setImmediate);};
 return{get,messages,removed,listeners,opened,flush};
}
test('default Greet page shows stored queue and observes changes without enqueuing or BOSS requests',async()=>{
 const s={queue:[{id:'queued'}],results:{queued:{status:'QUEUED'},done:{status:'SUCCESS',download:{filename:'BOSS/synthetic.json'}}}};
 const h=page('',s);await h.flush();
 assert.equal(h.messages.length,0);assert.deepEqual(h.removed,[]);
 assert.match(h.get('summary').textContent,/排队 1.*成功 1/);
 assert.equal(h.get('jobs').children.length,2);
 s.queue=[];s.results.queued={status:'FAILED',failure:{kind:'CLOSED',message:'<script>synthetic</script>'},download:{status:'COMPLETE'}};s.paused={jobId:'queued',at:5};
 h.listeners[0]({'boss-greet-queue-v1':{}},'local');await h.flush();
 assert.equal(h.get('resume').disabled,true,'empty queue cannot resume');
 assert.equal(h.get('jobs').children.find(row=>row.children[0].textContent==='岗位 queued').children[2].textContent,'<script>synthetic</script>');
 assert.doesNotMatch(source,/chrome\.scripting|fetch\(/);
});
test('human acknowledgment uses exact displayed pause identity, never re-enqueues the failed job',async()=>{
 const h=page('',{queue:[{id:'remaining'}],results:{remaining:{status:'QUEUED'},failed:{status:'FAILED',failure:{kind:'REMINDER',message:'请人工确认'},download:{status:'COMPLETE'}}},paused:{jobId:'failed',at:42}});
 await h.flush();assert.equal(h.get('resume').disabled,false);
 await h.get('resume').events.click();await h.flush();
 assert.equal(h.messages.length,1);assert.equal(h.messages[0].type,'GREET_QUEUE_RESUME');assert.equal(h.messages[0].jobId,'failed');assert.equal(h.messages[0].pausedAt,42);
});
test('partial parameters never send and full parameters keep original enqueue then close behavior',async()=>{
 const partial=page('?jobId=synthetic');await partial.flush();assert.equal(partial.messages.length,0);assert.match(partial.get('state').textContent,/参数不完整/);
 const full=page('?jobId=synthetic&securityId=synthetic');await full.flush();assert.equal(full.messages[0].type,'GREET_QUEUE_ENQUEUE');assert.deepEqual(full.removed,[19]);
});
test('daily cap tells the user the actual reason and never asks them to review JSON or exposes paths',async()=>{
 const h=page('',{queue:[],results:{failed:{status:'FAILED',recordFinishedAt:new Date().toISOString(),failure:{kind:'DAILY_LIMIT',message:'今天已沟通150位'},download:{status:'COMPLETE',actualFilename:'/private/synthetic/greet.json'}}},paused:{jobId:'failed',at:42}});
 await h.flush();assert.equal(h.get('pause-title').textContent,'BOSS 已限制今天继续沟通');assert.match(h.get('pause-detail').textContent,/失败不计入成功/);
 assert.equal(h.get('resume').disabled,true);assert.equal(h.get('resume').textContent,'继续执行');assert.equal(h.get('state').textContent,'已完成');assert.equal(h.get('clear').disabled,false);assert.equal(h.get('clear').hidden,false);
 const text=h.get('jobs').children.flatMap(r=>r.children.map(c=>c.textContent)).join(' ');assert.doesNotMatch(text,/private|\.json/);
});
test('controls always remain visible; completed batch can clear but running, pending and unknown cannot',async()=>{
 const finished=page('',{queue:[],active:null,lastFinishedAt:1,archivedResults:Object.fromEntries(Array.from({length:150},(_,i)=>['prior-'+i,{status:'SUCCESS',at:Date.now(),download:{status:'COMPLETE'}}])),results:{done:{status:'SUCCESS',download:{status:'COMPLETE'}}}});
 await finished.flush();assert.equal(finished.get('state').textContent,'已完成');assert.equal(finished.get('resume').disabled,true);assert.equal(finished.get('clear').disabled,false);
 await finished.get('clear').events.click();assert.equal(finished.messages[0].type,'GREET_QUEUE_CLEAR_COMPLETED');assert.equal(finished.messages[0].resultCount,1);
 for(const s of [{queue:[{id:'pending'}],results:{pending:{status:'QUEUED'}}},{active:{id:'running'},results:{running:{status:'RUNNING'}}},{results:{unknown:{status:'UNKNOWN'}}}]){
  const h=page('',s);await h.flush();assert.equal(h.get('clear').disabled,true);
 }
 const html=fs.readFileSync(new URL('../actions/greet/greet.html',import.meta.url),'utf8');
 assert.match(html,/id="resume"/);assert.match(html,/id="clear"/);assert.doesNotMatch(html.match(/<div id="notice"[^>]*>(.*?)<\/div>/s)?.[1]||'',/<button/);
});
test('only today successful durable results count toward 150; archived results count once and failures never count',async()=>{
 const at=Date.now(),old=at-86400000,success={status:'SUCCESS',at,download:{status:'COMPLETE'}};
 const history=Object.fromEntries(Array.from({length:149},(_,i)=>['prior-'+i,success]));
 const h=page('',{archivedResults:history,results:{...Object.fromEntries(Array.from({length:30},(_,i)=>['failure-'+i,{status:'FAILED',at,download:{status:'COMPLETE'}}])),old:{...success,at:old},'prior-0':success},queue:[]});
 await h.flush();assert.match(h.get('summary').textContent,/今日成功 149 \/ 150/);assert.equal(h.get('clear').textContent,'清理往日记录');assert.equal(h.get('clear').hidden,false);
});
test('only reminder failures expose an enabled manual retry using the same parameterized Greet page',async()=>{
 for(const kind of ['REMINDER','CLOSED','UNKNOWN','BUSINESS','DAILY_LIMIT']){
  const at=Date.now();const h=page('',{queue:[],results:{failed:{status:'FAILED',at,recordFinishedAt:new Date(at).toISOString(),failure:{kind},download:{status:'COMPLETE'}}},paused:{jobId:'failed',at:42}});await h.flush();
  const button=h.get('jobs').children[0].children[3].children[0];assert.equal(button.textContent,'重新发送');assert.equal(button.disabled,!['REMINDER','DAILY_LIMIT'].includes(kind));
  if(kind==='REMINDER'){button.events.click();assert.match(h.opened[0],/actions\/greet\/greet\.html\?jobId=failed&retry=1&retryAt=/);assert.equal(h.messages.length,0);}
 }
});
