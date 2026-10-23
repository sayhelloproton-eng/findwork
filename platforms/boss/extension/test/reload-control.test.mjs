import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const dir=path.resolve(import.meta.dirname,'..');
const source=name=>fs.readFileSync(path.join(dir,name),'utf8');

test('Reload page calls one and only one Chrome native API',()=>{
 const calls=[];
 const chrome={runtime:{reload(){calls.push('runtime.reload')}}};
 vm.runInNewContext(source('actions/reload/reload.js'),{chrome});
 assert.deepEqual(calls,['runtime.reload']);
 assert.equal(source('actions/reload/reload.js').trim(),'chrome.runtime.reload();');
});

test('Reload has no state, message or business action dependency',()=>{
 const js=source('actions/reload/reload.js');
 for(const term of ['storage','sendMessage','tabs.','scripting','fetch','setTimeout','Promise','bootId','runId','querySelector']){
  assert.doesNotMatch(js,new RegExp(term.replace('.','\\.')));
 }
 const html=source('actions/reload/reload.html');
 assert.match(html,/src="reload.js"/);
 assert.doesNotMatch(html,/onclick|<button|status/);
 assert.doesNotMatch(source('auto-entry.js'),/reload-worker|auto-worker/);
 assert.equal(fs.existsSync(path.join(dir,'reload-worker.js')),false);
});

test('version and fixed extension entry remain stable',()=>{
 const manifest=JSON.parse(source('manifest.json'));
 assert.match(manifest.version,/^1\.1\.\d+$/);
 assert.equal(manifest.background.service_worker,'auto-entry.js');
 assert.equal(Object.hasOwn(manifest,'action'),false);
 assert.equal(manifest.content_scripts.length,2);
 assert.doesNotMatch(source('auto-entry.js'),/flow-control\.js/);
 assert.match(source('auto-entry.js'),/BossNaturalDetail\.install\(\)/);
 assert.match(source('auto-entry.js'),/BossGreetQueue\.install\(\)/);
});
