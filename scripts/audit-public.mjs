import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=path.resolve(import.meta.dirname,'..');
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root})
 .toString('utf8').split('\0').filter(Boolean);
const forbiddenPath=/(^|\/)(\.private|private|runtime|runtime-upload|node_modules|dist|career-assets)(\/|$)|\.(sqlite3?|db|db-wal|db-shm|db-journal|zip|pem|p12)$/i;
const patterns=[
 ['PRIVATE_KEY',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['ACCESS_TOKEN',/(?:gh[pousr]_[A-Za-z0-9_]{18,}|github_pat_[A-Za-z0-9_]{18,}|sk-(?:proj-|live-)?[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16})/],
 ['ABS_LOCAL_HOME',/\/(?:Users|home)\/[a-zA-Z][a-zA-Z0-9._-]+\//],
 ['PERSONAL_MOBILE',/(?:^|\D)1[3-9][0-9]{9}(?:\D|$)/],
 ['EMAIL_LITERAL',/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/],
];
const failures=[];
for(const rel of paths){
 if(forbiddenPath.test(rel)){failures.push(rel+':FORBIDDEN_FILE');continue;}
 const content=fs.readFileSync(path.join(root,rel));
 if(content.includes(0)){failures.push(rel+':BINARY_IN_PUBLIC_SCOPE');continue;}
 const text=content.toString('utf8');
 for(const [kind,pattern] of patterns){
  const match=pattern.exec(text);
  if(match){const line=text.slice(0,match.index).split('\n').length;failures.push(rel+':'+line+':'+kind);}
 }
}
const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
const link='https://github.com/sayhelloproton-eng/findwork/blob/main/GETTING_STARTED.md';
if(!readme.includes(link))failures.push('README.md:GUIDE_LINK_MISSING');
if(/BOSS|直聘|风控|逆向|伪造/.test(readme))failures.push('README.md:VENDOR_OR_RISK_WORDING');
for(const rel of ['.private/job-search/candidate-profile.md','.private/job-search/target-roles.md',
 '.private/job-search/exclusions.md','app/db/runtime/jobs.sqlite']){
 const ignored=execFileSync('git',['check-ignore',rel],{cwd:root,encoding:'utf8'}).trim();
 if(ignored!==rel)failures.push(rel+':NOT_IGNORED');
}
if(failures.length){
 console.error('FINDWORK_PUBLIC_AUDIT_FAILED '+JSON.stringify(failures));
 process.exitCode=1;
}else console.log('FINDWORK_PUBLIC_AUDIT_PASS files='+paths.length);
