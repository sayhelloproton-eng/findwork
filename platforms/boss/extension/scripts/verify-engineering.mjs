import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.statSync(path.join(root,p),{throwIfNoEntry:false})?.isFile();
const pages=['actions/reload/reload.html','actions/refresh/refresh.html',
 'actions/scroll/scroll.html','actions/detail/dom.html','actions/greet/greet.html',
 'actions/detail/diagnose.html','diagnostics/greet-status.html'];
for(const page of pages){
 if(!exists(page))throw Error('PAGE_MISSING:'+page);
 const assets=[...read(page).matchAll(/<script\b[^>]*\bsrc=['"]([^'"]+)['"]/g)];
 if(!assets.length)throw Error('PAGE_SCRIPT_MISSING:'+page);
 for(const m of assets){
  const file=path.posix.normalize(path.posix.join(path.posix.dirname(page),m[1]));
  if(!exists(file))throw Error('PAGE_SCRIPT_MISSING:'+file);
 }
}
const worker=read('auto-entry.js');
for(const owner of ['BossRawDownloads','BossNaturalDetail','BossGreetQueue','BossResumeDelivery','BossCollectionLaunch','BossActionRouter'])
 if(!worker.includes(owner+'.install()'))throw Error('OWNER_MISSING:'+owner);
for(const dead of ['BossDetailQueue','BossDetailNativeClient','BossCaptureScheduler',
 'BossCaptureCoordinator','BossBatchStore','BossCaptureEvidence'])
 if(worker.includes(dead))throw Error('DEAD_OWNER_IN_RUNTIME:'+dead);
for(const m of worker.matchAll(/['"]([a-z0-9/_-]+\.js)['"]/g))
 if(!exists(m[1]))throw Error('WORKER_IMPORT_MISSING:'+m[1]);
for(const file of ['diagnostics/inspect.html','diagnostics/inspect.js',
 'diagnostics/scroll-geometry.html','diagnostics/scroll-geometry.js',
 'diagnostics/dom-debug.html','diagnostics/dom-debug.js'])
 if(exists(file))throw Error('REDUNDANT_DIAGNOSTIC_REMAINS:'+file);
for(const file of ['actions/detail/detail.html','actions/detail/detail-queue.js',
 'actions/detail/detail-native-client.js','core/capture/capture-scheduler.js'])
 if(exists(file))throw Error('RETIRED_FILE_REMAINS:'+file);
if(!exists('docs/DESIGN.md')||!read('README.md').includes('docs/DESIGN.md'))
 throw Error('DESIGN_DOCUMENT_NOT_LINKED');
for(const retired of ['docs/ARCHITECTURE.md','docs/OPERATIONS.md','docs/DATA-CONTRACTS.md',
 'docs/PRIVACY.md','actions/detail/STATUS.md'])
 if(exists(retired))throw Error('RETIRED_DOCUMENT_REMAINS:'+retired);
if(!read('docs/DESIGN.md').includes('flowchart TD')||
 !read('docs/DESIGN.md').includes('Rspack')||
 !read('docs/DESIGN.md').includes('10 条'))
 throw Error('EVOLUTION_ROADMAP_MISSING');
for(const f of ['test/fixtures/list.json','test/fixtures/detail.json','test/fixtures/job-card.html'])
 if(!exists(f))throw Error('SYNTHETIC_FIXTURE_MISSING:'+f);
const m=JSON.parse(read('manifest.json'));
if(['debugger','webRequest'].some(p=>m.permissions.includes(p)||
 (m.optional_permissions||[]).includes(p)))throw Error('UNNECESSARY_DIAGNOSTIC_PRIVILEGE');
if(exists('diagnostics/environment-diagnostic.html')||
 exists('diagnostics/environment-diagnostic.js'))throw Error('RETIRED_DEBUGGER_DIAGNOSTIC');
if(JSON.parse(read('package.json')).version!==JSON.parse(read('manifest.json')).version)
 throw Error('VERSION_DRIFT');
console.log('ENGINEERING_BOUNDARY_PASS owners=6 pages='+pages.length);
