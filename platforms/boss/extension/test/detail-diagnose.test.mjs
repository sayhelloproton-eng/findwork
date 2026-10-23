import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const root=path.resolve(import.meta.dirname,'..');
const src=fs.readFileSync(path.join(root,'actions/detail/diagnose.js'),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function scene(tabs=[{id:3,url:'https://www.zhipin.com/web/geek/jobs'}]){
 const display={textContent:''},calls=[];
 const chrome={
  tabs:{query:async()=>tabs,sendMessage:async(_id,m)=>{
   calls.push('OBSERVER:'+m.type);return{ok:true,hookReady:true,events:[]};}},
  scripting:{executeScript:async v=>{
   calls.push('SCRIPT:'+v.world);
   return[{result:v.world==='MAIN'?{mainV3Marker:true}:{readyState:'complete'}}];}},
  storage:{local:{get:async()=>{calls.push('READ_STORAGE');return{};},
   set:()=>{throw Error('MUST_NOT_WRITE');}}},
  runtime:{sendMessage:async()=>({ok:true,status:'COMPLETE'})}
 };
 vm.runInNewContext(src,{chrome,document:{getElementById:()=>display},
  URL,URLSearchParams,location:{search:''},crypto:{randomUUID:()=> 'synthetic-probe'},Error,JSON});
 return{display,calls};
}
test('unified diagnose covers Hook, DOM, geometry and receipts',async()=>{
 const r=scene();await tick();await tick();await tick();
 const out=JSON.parse(r.display.textContent);assert.equal(out.ok,true);
 for(const name of ['observer','isolatedDom','pageStructure','scrollGeometry',
  'resourceSummary','mainHook','freshHandshake','bootRecovery','captureTimeline'])
  assert.ok(Object.hasOwn(out.checks,name),name);
 assert.equal(r.calls.filter(s=>s==='SCRIPT:ISOLATED').length,3);
 assert.equal(r.calls.filter(s=>s==='SCRIPT:MAIN').length,2);
});
test('missing or ambiguous BOSS jobs tab fails before any inspection',async()=>{
 for(const tabs of [[],[{id:1,url:'https://www.zhipin.com/web/geek/jobs'},
  {id:2,url:'https://www.zhipin.com/web/geek/jobs'}]]){
  const r=scene(tabs);await tick();await tick();
  const out=JSON.parse(r.display.textContent);
  assert.equal(out.ok,false);assert.equal(out.reason,'BOSS_TAB_NOT_UNIQUE');
  assert.deepEqual(r.calls,[]);
 }
});
test('passive diagnosis exposes geometry, never writes, scrolls or exports full HTML',()=>{
 for(const pattern of [/chrome\.tabs\.reload\s*\(/,/chrome\.tabs\.remove\s*\(/,
  /chrome\.downloads\.download\s*\(/,/chrome\.storage\.local\.set\s*\(/,
  /document\.documentElement\.outerHTML/,/\bfetch\s*\(/,
  /\.scrollTop\s*=/,/window\.scrollTo\s*\(/])
  assert.doesNotMatch(src,pattern);
 for(const t of ['jobLinkCount','selectorCounts','challenge','scrollHeight',
  'clientHeight','overflowY','getBoundingClientRect','jobCardDescendants',
  'naturalDetailResources','hookOwnership','captureTimeline'])
  assert.ok(src.includes(t),t);
});
