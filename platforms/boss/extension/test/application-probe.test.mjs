import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
test('research probe is source-only and excluded from production manifest and bundle',()=>{
 const m=JSON.parse(read('manifest.json'));
 assert.equal(m.permissions.includes('webRequest'),false);
 assert.equal(m.permissions.includes('debugger'),false);
 assert.ok(!m.content_scripts.some(c=>c.js.some(f=>f.startsWith('core/application/'))));
 assert.ok(!read('scripts/build.mjs').includes('actions/application/probe.html'));
 assert.doesNotMatch(read('core/application/probe-main.js'),/credentials:|headers:|body:.*post|response\.text\(|response\.json\(/i);
});
test('passive probe sees POST metadata, ignores Greet and external domains without issuing requests',async()=>{
 const out=[],requests=[],target='https://www.zhipin.com/web/geek/jobs';
 const xhrProto={open(){},send(){}};
 const XMLHttpRequest=function(){};
 XMLHttpRequest.prototype=xhrProto;
 const ctx={location:{href:target,origin:'https://www.zhipin.com',pathname:'/web/geek/jobs'},
  window:{top:null,postMessage:(x)=>out.push(x),fetch:(url,opts)=>{requests.push({url,opts});return Promise.resolve({status:200});}},
  XMLHttpRequest,URL,Promise,Date,WeakMap};
 ctx.window.top=ctx.window;
 vm.runInNewContext(read('core/application/probe-main.js'),ctx);
 await ctx.window.fetch('/wapi/ats/native/apply.json',{method:'POST',body:'secret-synthetic'});
 await ctx.window.fetch('/wapi/zpgeek/friend/add.json',{method:'POST',body:'greet'});
 await ctx.window.fetch('https://evil.invalid/wapi/ats/apply',{method:'POST'});
 assert.equal(requests.length,3);
 assert.equal(out.length,1);
 assert.equal(out[0].item.path,'/wapi/ats/native/apply.json');
 assert.equal(out[0].item.method,'POST');
 assert.equal(out[0].item.httpStatus,200);
 assert.equal(JSON.stringify(out).includes('secret-synthetic'),false);
});
