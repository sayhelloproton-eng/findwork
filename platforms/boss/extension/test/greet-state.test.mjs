import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const context=vm.createContext({Date,Object,Number});vm.runInContext(fs.readFileSync(new URL('../actions/greet/greet-state.js',import.meta.url),'utf8'),context);const state=context.BossGreetState;
test('midnight download never moves business success to the next day or unlocks clearing',()=>{
 const now=Date.parse('2026-10-27T16:00:01Z'),results=Object.fromEntries(Array.from({length:150},(_,i)=>['id-'+i,{status:'SUCCESS',at:now,recordFinishedAt:'2026-10-27T15:59:59.000Z',download:{status:'COMPLETE'}}]));
 assert.equal(state.successToday({results},now),0);assert.equal(state.successToday({results},now-2000),150);
 assert.equal(state.successToday({results,archivedResults:results},now-2000),150);
});
test('legacy fallback is explicit and failures never consume successes',()=>{
 const at=Date.now();assert.equal(state.successToday({results:{a:{status:'SUCCESS',at,download:{status:'COMPLETE'}},b:{status:'FAILED',at,download:{status:'COMPLETE'}}}},at),1);
});
test('cleanup permits a verified platform cap below150 and preserves success count after archival',()=>{
 const now=Date.parse('2026-10-26T09:00:00Z'),done={status:'SUCCESS',recordFinishedAt:new Date(now).toISOString(),download:{status:'COMPLETE'}};
 const s={queue:[],results:{done,cap:{status:'FAILED',recordFinishedAt:new Date(now).toISOString(),failure:{kind:'DAILY_LIMIT'},download:{status:'COMPLETE'}}}};
 const p=state.cleanupPlan(s,now);assert.equal(p.allowed,true);assert.equal(p.platformLimit,true);
 assert.equal(state.successToday(s,now),1);assert.equal(state.successToday({results:{},archivedResults:s.results},now),1);
 assert.equal(state.successToday({results:{},archivedResults:s.results},now+86400000),0);
});
test('next day cleanup removes only older records, never auto-deletes or drops live/unknown tasks',()=>{
 const now=Date.parse('2026-10-27T09:00:00Z'),done=stamp=>({status:'SUCCESS',recordFinishedAt:new Date(stamp).toISOString(),download:{status:'COMPLETE'}});
 const s={queue:[],results:{old:done(now-86400000),today:done(now)}};const p=state.cleanupPlan(s,now);
 assert.equal(p.allowed,true);assert.equal(p.olderOnly,true);assert.deepEqual([...p.ids],['old']);assert.equal(Object.keys(s.results).length,2);
 assert.equal(state.cleanupPlan({...s,queue:[{id:'pending'}]},now).allowed,false);
 assert.equal(state.cleanupPlan({...s,results:{...s.results,unknown:{status:'UNKNOWN'}}},now).allowed,false);
});
test('legacy FAILED/UNKNOWN-kind records, pending resume handoff and platform security cannot be cleared',()=>{
 const at=Date.parse('2026-10-27T01:00:00Z'),done={status:'FAILED',at,download:{status:'COMPLETE'}};
 const legacy={results:{a:{...done,failure:{kind:'UNKNOWN'},sideEffectState:'NOT_CONFIRMED'}}};assert.equal(state.isUnknown(legacy.results.a),true);assert.equal(state.cleanupPlan(legacy,at+86400000).allowed,false);
 assert.equal(state.cleanupPlan({results:{a:{...done,resumeTask:{status:'PENDING'}}}},at+86400000).allowed,false);
 assert.equal(state.cleanupPlan({results:{a:done},paused:{kind:'SECURITY',reason:'RESUME_SECURITY_STOP'}},at+86400000).allowed,false);
});
