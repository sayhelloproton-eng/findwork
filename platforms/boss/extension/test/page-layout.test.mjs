import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const pages=['actions/reload/reload.html','actions/refresh/refresh.html',
 'actions/scroll/scroll.html','actions/detail/dom.html','actions/greet/greet.html',
 'actions/detail/diagnose.html','diagnostics/greet-status.html'];
test('7 public pages exist, ship and reference valid script assets',()=>{
 const build=fs.readFileSync(path.join(root,'scripts/build.mjs'),'utf8');
 for(const page of pages){
  assert.ok(build.includes(page),page);
  const html=fs.readFileSync(path.join(root,page),'utf8');
  const js=[...html.matchAll(/<script\b[^>]*\bsrc=['"]([^'"]+)['"]/g)];
  assert.ok(js.length,page);
  for(const v of js)assert.ok(fs.existsSync(path.join(root,
   path.posix.normalize(path.posix.join(path.posix.dirname(page),v[1])))),page);
 }
 assert.equal(fs.existsSync(path.join(root,'actions/detail/detail.html')),false);
});
test('manifest and Worker load existing core components',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 for(const c of manifest.content_scripts)for(const f of c.js)
  assert.ok(fs.existsSync(path.join(root,f)),f);
 const worker=fs.readFileSync(path.join(root,'auto-entry.js'),'utf8');
 for(const m of worker.matchAll(/['"]([a-z0-9/_-]+\.js)['"]/g))
  assert.ok(fs.existsSync(path.join(root,m[1])),m[1]);
 assert.doesNotMatch(worker,/BossDetailQueue|BossCaptureScheduler/);
});
