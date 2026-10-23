import fs from 'node:fs';import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
for(const file of ['app/db/schema/jobs.sql','app/db/ingestion/job-store.ts',
 'app/server/server.ts','app/web/dist/antd-entry.js','skills/job-search/SKILL.md',
 'skills/boss-extension/SKILL.md','platforms/boss/extension/dist/boss-list-observer/manifest.json'])
 if(!fs.existsSync(path.join(root,file)))throw Error('MISSING_MIGRATED_ASSET:'+file);
for(const name of ['LICENSE','DISCLAIMER.md','PRIVACY.md','SECURITY.md','CONTRIBUTING.md'])
 if(!fs.existsSync(path.join(root,name)))throw Error('OSS_DOC_MISSING:'+name);
const license=fs.readFileSync(path.join(root,'LICENSE'),'utf8');
const childLicense=fs.readFileSync(path.join(root,'platforms/boss/extension/LICENSE'),'utf8');
if(!license.startsWith('MIT License')||!license.includes('Copyright (c) 2026 Findwork contributors'))
 throw Error('ROOT_LICENSE_INVALID');
if(!childLicense.includes('Copyright (c) 2026 Job Search System contributors'))
 throw Error('EXTENSION_COPYRIGHT_LOST');
if(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).license!=='MIT')
 throw Error('PACKAGE_LICENSE_DRIFT');
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
for(const name of ['LICENSE','DISCLAIMER.md','PRIVACY.md','SECURITY.md','CONTRIBUTING.md'])
 if(!readme.includes('](./'+name+')'))throw Error('README_OSS_LINK_MISSING:'+name);
for(const name of ['AGENTS.md','docs/DESIGN.md','platforms/boss/extension/AGENTS.md'])
 if(/本机工程协议|旧 job-search-system/.test(fs.readFileSync(path.join(root,name),'utf8')))
  throw Error('INTERNAL_DOC_REFERENCE:'+name);
const sql=fs.readFileSync(path.join(root,'app/db/schema/jobs.sql'),'utf8');

for(const name of ['jobs','job_details','list_responses','job_events'])
 if(!sql.includes('CREATE TABLE '+name))throw Error('SCHEMA_TABLE_MISSING:'+name);
if(!sql.includes('PRAGMA user_version=6'))throw Error('SCHEMA_V6_DRIFT');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
for(const f of files)
 if(/(^|\/)(private|\.private|runtime|node_modules|dist|career-assets)(\/|$)/.test(f)||
 /\.(sqlite3?|db|zip)$/.test(f))throw Error('PRIVATE_FILE_IN_GIT_SCOPE:'+f);
console.log('FINDWORK_PUBLIC_BOUNDARY_PASS');
