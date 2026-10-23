import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
test('greet status reads storage without write or network',async()=>{
 const body=fs.readFileSync(path.join(root,'diagnostics/greet-status.js'),'utf8');
 const page=fs.readFileSync(path.join(root,'diagnostics/greet-status.html'),'utf8');
 assert.match(page,/greet-status\.js/);
 const out={textContent:''};
 const chrome={storage:{local:{get:async()=>({'boss-greet-queue-v1':{
  active:null,queue:[{id:'private'}],paused:{reason:'SECURITY_CODE_37_STOP'},
  results:{a:{status:'SUCCESS'},b:{status:'UNKNOWN',sideEffectState:'UNKNOWN'}}
 }})}}};
 vm.runInNewContext(body,{chrome,document:{getElementById:()=>out},JSON,Object,String});
 for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.match(out.textContent,/GREET_QUEUE_STATUS=/);
 const state=JSON.parse(out.textContent.slice(out.textContent.indexOf('=')+1));
 assert.equal(state.paused,true);
 assert.equal(state.queued,1);
 assert.equal(state.resultCounts.SUCCESS,1);
 assert.equal(state.unknownSideEffects,1);
 assert.doesNotMatch(out.textContent,/private/);
});
