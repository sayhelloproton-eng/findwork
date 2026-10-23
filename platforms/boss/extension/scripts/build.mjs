import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
if(manifest.manifest_version!==3||manifest.background?.service_worker!=='auto-entry.js')
 throw Error('UNEXPECTED_MANIFEST_ENTRY');
const pages=['actions/reload/reload.html','actions/refresh/refresh.html',
 'actions/scroll/scroll.html','actions/detail/dom.html','actions/greet/greet.html',
 'actions/detail/diagnose.html','diagnostics/greet-status.html'];
const entries=new Set(['manifest.json',manifest.background.service_worker,...pages]);
for(const c of manifest.content_scripts||[])for(const f of c.js||[])entries.add(f);
const worker=fs.readFileSync(path.join(root,'auto-entry.js'),'utf8');
const imported=/importScripts\(([\s\S]*?)\);/.exec(worker);
if(!imported)throw Error('MISSING_WORKER_IMPORTS');
for(const m of imported[1].matchAll(/['"]([a-z0-9/_-]+\.js)['"]/g))entries.add(m[1]);
for(const page of pages){
 const html=fs.readFileSync(path.join(root,page),'utf8');
 const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=['"]([^'"]+)['"]/g)];
 if(!scripts.length)throw Error('PAGE_NO_SCRIPT:'+page);
 for(const m of scripts)entries.add(path.posix.normalize(path.posix.join(path.posix.dirname(page),m[1])));
}
for(const required of ['actions/detail/dom.js','actions/detail/dom-native-store.js',
 'core/capture/page-observer.js','core/network/main-hook.js'])
 if(!entries.has(required))throw Error('PRODUCTION_CAPTURE_NOT_BUNDLED:'+required);
const files=[...entries].sort();
for(const file of files){
 if(!/^(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(?:html|js|json)$/.test(file)||
  !fs.statSync(path.join(root,file),{throwIfNoEntry:false})?.isFile())
  throw Error('INVALID_BUILD_FILE:'+file);
}
const dest=path.join(root,'dist/boss-list-observer');
fs.rmSync(dest,{recursive:true,force:true});
for(const file of files){
 const name=path.join(dest,file);fs.mkdirSync(path.dirname(name),{recursive:true});
 fs.copyFileSync(path.join(root,file),name);
}
function tree(dir,prefix=''){
 return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>
  x.isDirectory()?tree(path.join(dir,x.name),prefix+x.name+'/'):[prefix+x.name]);
}
if(JSON.stringify(tree(dest).sort())!==JSON.stringify(files))
 throw Error('BUNDLE_FILE_SET_DRIFT');
console.log('CHROME_UNPACKED_BUILD_PASS files='+files.length+' destination='+dest);
