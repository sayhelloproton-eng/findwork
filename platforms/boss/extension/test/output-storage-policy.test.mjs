import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
test('List Detail Greet have separate dated output locations',()=>{
 assert.match(read('core/capture/auto-download.js'),/\/list\/job-list-/);
 assert.match(read('actions/detail/dom-native-store.js'),/\/detail\/native-/);
 assert.match(read('actions/greet/greet-queue.js'),/\/greet\/greet-/);
});
test('persistent business and session diagnostics isolated',()=>{
 const diag=read('actions/detail/diagnose.js');
 assert.match(diag,/chrome\.storage\.local\.get/);
 assert.doesNotMatch(diag,/chrome\.storage\.local\.set/);
 assert.doesNotMatch(diag,/chrome\.downloads\.download/);
 assert.doesNotMatch(diag,/document\.documentElement\.outerHTML/);
 for(const n of ['core/capture/auto-download.js','actions/detail/dom-native-store.js',
  'actions/greet/greet-queue.js'])assert.match(read(n),/chrome\.storage\.local/);
});
