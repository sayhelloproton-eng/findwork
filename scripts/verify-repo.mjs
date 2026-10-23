import fs from 'node:fs';import path from 'node:path';
import {execFileSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
for(const file of ['app/db/schema/jobs.sql','app/db/ingestion/job-store.ts',
 'app/server/server.ts','app/web/dist/antd-entry.js','skills/job-search/SKILL.md',
 'skills/boss-extension/SKILL.md','platforms/boss/extension/dist/boss-list-observer/manifest.json'])
 if(!fs.existsSync(path.join(root,file)))throw Error('MISSING_MIGRATED_ASSET:'+file);
const sql=fs.readFileSync(path.join(root,'app/db/schema/jobs.sql'),'utf8');
for(const name of ['jobs','job_details','list_responses','job_events'])
 if(!sql.includes('CREATE TABLE '+name))throw Error('SCHEMA_TABLE_MISSING:'+name);
if(!sql.includes('PRAGMA user_version=6'))throw Error('SCHEMA_V6_DRIFT');
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
for(const f of files)
 if(/(^|\/)(private|\.private|runtime|node_modules|dist|career-assets)(\/|$)/.test(f)||
 /\.(sqlite3?|db|zip)$/.test(f))throw Error('PRIVATE_FILE_IN_GIT_SCOPE:'+f);
console.log('FINDWORK_PUBLIC_BOUNDARY_PASS');
