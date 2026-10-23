import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const source=path.resolve(root,'../../../skills');
const out=path.join(root,'dist/boss-extension-skill.zip');
const names=['boss-extension/SKILL.md',
 'boss-extension/references/actions.md',
 'boss-extension/references/workflows.md',
 'boss-extension/references/results.md',
 'boss-extension/references/recovery.md',
 'boss-extension/references/fields.md'];
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.rmSync(out,{force:true});
const zip=spawnSync('zip',['-X','-q',out,...names],{cwd:source,encoding:'utf8'});
if(zip.status!==0)throw Error('SKILL_ZIP_FAILED:'+zip.stderr);
const list=spawnSync('unzip',['-Z1',out],{encoding:'utf8'});
if(list.status!==0)throw Error('SKILL_ZIP_LIST_FAILED:'+list.stderr);
const actual=list.stdout.trim().split('\n').sort();
if(JSON.stringify(actual)!==JSON.stringify([...names].sort()))
 throw Error('SKILL_PUBLIC_FILE_WHITELIST_DRIFT:'+actual.join(','));
console.log('SKILL_ZIP_PASS files='+names.length+' archive='+out);
