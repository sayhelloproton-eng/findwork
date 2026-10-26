import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('identity bridge reports running worker capabilities and does not claim compatibility on failure',async()=>{
 for(const pathname of ['/','/communications'])for(const fails of [false,true]){
  const out=[];const window={postMessage:v=>out.push(v),addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(new URL('../core/findwork/communication-bridge.js',import.meta.url),'utf8'),{location:{hostname:'127.0.0.1',pathname,origin:'http://127.0.0.1:4317'},window,chrome:{runtime:{id:'a'.repeat(32),getManifest:()=>({version:'1.1.22'}),sendMessage:async()=>{if(fails)throw Error('OLD_WORKER');return{ok:true,protocolVersion:2,capabilities:['pre-send-check']};}}}});
  for(let i=0;i<5;i++)await new Promise(setImmediate);
  assert.equal(out[0].extensionId,'a'.repeat(32));assert.equal(out[0].protocolVersion,fails?undefined:2);assert.equal(out[0].compatible,fails?false:undefined);
 }
});
