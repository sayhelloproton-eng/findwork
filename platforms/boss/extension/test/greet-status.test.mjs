import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('legacy status URL only redirects to the one default Greet page without sending or mutation',()=>{
 const source=fs.readFileSync(new URL('../diagnostics/greet-status.js',import.meta.url),'utf8');const urls=[];
 vm.runInNewContext(source,{location:{replace:x=>urls.push(x)},chrome:{runtime:{getURL:p=>'chrome-extension://synthetic/'+p}}});
 assert.deepEqual(urls,['chrome-extension://synthetic/actions/greet/greet.html']);
 assert.doesNotMatch(source,/storage|sendMessage|fetch/);
});
