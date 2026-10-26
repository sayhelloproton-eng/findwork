import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const b=path.resolve(import.meta.dirname,'..');
const source=n=>fs.readFileSync(path.join(b,n),'utf8');
function policy(){
 const ctx=vm.createContext({URL});
 vm.runInContext(source('core/network/network-allowlist.js'),ctx);
 return ctx.BossNetworkAllowlist;
}
test('only natural List and Detail requests pass the business allowlist',()=>{
 const p=policy();
 assert.equal(p.shouldCapture('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json?page=1&pageSize=15'),true);
 assert.equal(p.shouldCapture('/wapi/zpgeek/pc/recommend/job/list.json?page=2&pageSize=15'),true);
 assert.equal(p.shouldCapture('/wapi/zpgeek/job/detail.json?securityId=redacted'),true);
 for(const pathname of [
  '/wapi/zpgeek/pc/recommend/expect/list.json',
  '/wapi/zpgeek/pc/all/filter/conditions.json',
  '/wapi/zpCommon/actionLog/common.json',
  '/wapi/zppassport/set/zpToken',
  '/wapi/zpchat/notify/setting/get',
  '/wapi/zpCommon/toggle/all'
 ])assert.equal(p.shouldCapture(pathname),false,pathname);
 assert.equal(p.shouldCapture('https://evil.example/wapi/zpgeek/pc/recommend/job/list.json'),false);
 assert.equal(p.shouldCapture('https://www.zhipin.com/wapi/zpgeek/pc/recommend/job/list.json/extra'),false);
});
test('MAIN Hook passes unrelated fetch through without response cloning or recording',async()=>{
 const messages=[],calls=[];
 const win={
  top:null,
  fetch:(...args)=>{
   calls.push(args[0]);
   return Promise.resolve({status:200,headers:{get:()=>null},
    clone:()=>{throw Error('UNRELATED_BODY_MUST_NOT_BE_READ');}});
  },
  addEventListener:()=>{},
  postMessage:m=>messages.push(m)
 };
 win.top=win;
 class Xhr{open(){} send(){} addEventListener(){}}
 const ctx=vm.createContext({window:win,XMLHttpRequest:Xhr,URL,URLSearchParams,
  location:{href:'https://www.zhipin.com/web/geek/jobs?city=101020100',
   origin:'https://www.zhipin.com'},crypto:{randomUUID:()=> 'hook-test'},
  Date,setTimeout,clearTimeout,TextDecoder,Uint8Array});
 vm.runInContext(source('core/network/normalizer.js'),ctx);
 vm.runInContext(source('core/network/network-allowlist.js'),ctx);
 vm.runInContext(source('core/network/main-hook.js'),ctx);
 await win.fetch('/wapi/zpCommon/actionLog/common.json');
 await win.fetch('/wapi/zpgeek/pc/all/filter/conditions.json');
 assert.equal(calls.length,2);
 assert.equal(messages.filter(x=>x.type==='BOSS_DIAG_NET_V1').length,0);
 // The one enabled endpoint emits a request and uses the original fetch.
 await win.fetch('/wapi/zpgeek/pc/recommend/job/list.json?page=1&pageSize=15');
 const request=messages.find(x=>x.type==='BOSS_DIAG_NET_V1'&&x.value.kind==='request');
 assert.equal(request?.value.path,'/wapi/zpgeek/pc/recommend/job/list.json');
 assert.equal(request?.value.query.paging.page,1);
 assert.equal(calls.length,3);
});
test('Manifest installs policy before the MAIN hook and retains single observer',()=>{
 const m=JSON.parse(source('manifest.json'));
 assert.match(m.version,/^1\.1\.\d+$/);
 assert.deepEqual(m.content_scripts[0].js,
  ['core/network/normalizer.js','core/network/network-allowlist.js',
   'core/network/main-hook.js']);
 assert.deepEqual(m.content_scripts[1].js,
  ['core/capture/page-observer.js']);
 assert.match(source('core/application/probe-main.js'),/BOSS_DIRECT_APPLY_PROBE_CANDIDATE_V1/);
 assert.match(source('core/network/main-hook.js'),/BossNetworkAllowlist\.shouldCapture/);
});

test('MAIN network normalizer exports only methods used by the live Hook',()=>{
 const ctx=vm.createContext({URL,URLSearchParams});
 vm.runInContext(source('core/network/normalizer.js'),ctx);
 assert.deepEqual(Object.keys(ctx.BossCaptureCore).sort(),
  ['VERSION','target','parameters','shape','network'].sort());
 const hook=source('core/network/main-hook.js');
 for(const k of ['VERSION','target','parameters','shape','network'])
  assert.match(hook,new RegExp('C\\.'+k+'\\b'));
});
