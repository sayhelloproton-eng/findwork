import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
test('README and DESIGN are the two human document authorities',()=>{
 for(const p of ['README.md','docs/DESIGN.md'])assert.ok(fs.existsSync(path.join(root,p)));
 for(const p of ['docs/ARCHITECTURE.md','docs/OPERATIONS.md','docs/DATA-CONTRACTS.md',
  'docs/PRIVACY.md','actions/detail/STATUS.md','docs/HISTORY.md','docs/EXPERIMENTS.md'])
  assert.equal(fs.existsSync(path.join(root,p)),false,p);
 assert.match(read('README.md'),/docs\/DESIGN\.md/);
 assert.match(read('docs/DESIGN.md'),/技术演进路线图/);
 assert.match(read('docs/DESIGN.md'),/改进建议/);
});
test('extension owns downloads not SQLite and documents exactly one DOM Detail',()=>{
 for(const p of ['README.md','docs/DESIGN.md','../../../skills/boss-extension/SKILL.md'])
  assert.match(read(p),/SQLite|数据库/);
 const runtime=read('auto-entry.js')+read('actions/detail/dom.js')+
  read('actions/detail/dom-native-store.js')+read('core/capture/auto-download.js');
 assert.doesNotMatch(runtime,/openJobsDatabase|node:sqlite|BOSS_JOBS_DB_PATH|BossDetailQueue/);
 assert.doesNotMatch(read('README.md'),/actions\/detail\/detail\.html/);
});
test('independent Greet diagnostics are shipped and read only',()=>{
 assert.match(read('scripts/build.mjs'),/diagnostics\/greet-status\.html/);
 assert.match(read('scripts/verify-engineering.mjs'),/diagnostics\/greet-status\.html/);
 assert.ok(fs.existsSync(path.join(root,'diagnostics/greet-status.js')));
});

test('one readable evolution diagram retains successful, constrained and production routes',()=>{
 const design=read('docs/DESIGN.md');
 assert.match(design,/flowchart TD/);
 for(const x of ['Rspack','Webpack','10 条','300 条','业务码 37','正式生产方案'])
  assert.ok(design.includes(x),x);
 const history=path.join(root,'docs/history');
 const remains=fs.existsSync(history)?
  fs.readdirSync(history,{recursive:true}).filter(name=>name.endsWith('.md')):[];
 assert.equal(remains.length,0);
 assert.doesNotMatch(read('README.md'),/docs\/history\/README\.md/);
 const manifest=JSON.parse(read('manifest.json'));
 assert.ok(!manifest.permissions.includes('debugger'));
 assert.ok(!manifest.permissions.includes('webRequest'));
 assert.ok(!(manifest.optional_permissions||[]).includes('debugger'));
 assert.ok(!fs.existsSync(path.join(root,'diagnostics/environment-diagnostic.html')));
 assert.ok(!fs.existsSync(path.join(root,'diagnostics/environment-diagnostic.js')));
});
