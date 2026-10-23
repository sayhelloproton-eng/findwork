import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const skill=path.resolve(root,'../../../skills/boss-extension');
const files=['SKILL.md','references/actions.md','references/workflows.md',
 'references/results.md','references/recovery.md','references/fields.md'];
const text=Object.fromEntries(files.map(f=>[f,fs.readFileSync(path.join(skill,f),'utf8')]));
const main=text['SKILL.md'];
if(!/^---\nname: boss-extension\ndescription: .+\n---\n/m.test(main))
 throw Error('SKILL_FRONTMATTER_INVALID');
const names=['Reload','Refresh','Scroll','Detail','Greet','Detail Diagnose','Greet Status'];
for(const name of names)
 if(!main.includes(name)||!text['references/actions.md'].includes(name))
  throw Error('SKILL_ACTION_MISSING:'+name);
for(const phrase of ['expect=0','N≥1','明确授权','UNKNOWN','下载',
 'List','Detail','Greet'])
 if(!main.includes(phrase))throw Error('SKILL_FIRST_LAYER_INCOMPLETE:'+phrase);
for(const file of files){
 const s=text[file];
 if(s.length<250)throw Error('SKILL_REFERENCE_TOO_BRIEF:'+file);
 for(const forbidden of [/\/wapi\//i,/\bRspack\b/i,/\bwebpack\b/i,
   /Service\s*Worker/i,/\bAxios\b/i,/chrome\.storage/i,
   /[A-Za-z0-9_-]+\.js\b/i,/docs\/(ARCHITECTURE|EXPERIMENTS|NATIVE-DETAIL)/i,
   /source-hashes/i,/private\//i,/contract[s]?\/actions\.json/i,
   /\b97994\b/]){
  if(forbidden.test(s))throw Error('SKILL_INTERNAL_DISCLOSURE:'+file+':'+forbidden);
 }
 for(const rel of s.matchAll(/references\/([a-z0-9-]+\.md)/g)){
  if(!fs.existsSync(path.join(skill,'references',rel[1])))
   throw Error('BROKEN_SKILL_REFERENCE:'+rel[1]);
 }
}
const fields=text['references/fields.md'];
const expectedList=[
 'afterNameIcons','anonymous','areaDistrict','atsDirectPost','beforeNameIcons',
 'bossAvatar','bossCert','bossName','bossOnline','bossTitle','brandIndustry',
 'brandLogo','brandName','brandScaleName','brandStageName','businessDistrict',
 'city','cityName','contact','daysPerWeekDesc','encryptBossId','encryptBrandId',
 'encryptJobId','expectId','goldHunter','gps','iconFlagList','iconWord',
 'industry','isShield','itemId','jobDegree','jobExperience','jobLabels','jobName',
 'jobType','jobValidStatus','leastMonthDesc','lid','optimal','outland','proxyJob',
 'proxyType','salaryDesc','securityId','showTopPosition','skills','welfareList'];
if(expectedList.length!==48)throw Error('EXPECTED_LIST_FIELD_COUNT_INVALID');
const inventory=fields.slice(fields.indexOf('## 1. List JSON'),fields.indexOf('## 2. Detail JSON'));
for(const field of expectedList)
 if(!inventory.includes(field))throw Error('LIST_FIELD_MISSING_FROM_SKILL:'+field);
for(const key of ['jobInfo','bossInfo','brandComInfo','relationInfo','oneKeyResumeInfo',
 'atsOnlineApplyInfo','appendixInfo','certMaterials','handicappedInfo',
 'lid','securityId','pageType','selfAccess','sessionId']){
 if(!fields.includes(key))throw Error('DETAIL_FIELD_MISSING_FROM_SKILL:'+key);
}
for(const item of ['goldHunter=1','contact','proxyType','今日回复','发布时间',
 '沟通人数','已确认','强候选','推测','未知','greasyfork.org','yingdao.com']){
 if(!fields.includes(item))throw Error('FIELD_EVIDENCE_INCOMPLETE:'+item);
}
const actions=text['references/actions.md'];
for(const p of ['actions/reload/reload.html','actions/refresh/refresh.html',
 'actions/scroll/scroll.html','actions/detail/dom.html','actions/greet/greet.html',
 'actions/detail/diagnose.html','diagnostics/greet-status.html']){
 if(!actions.includes(p)||!fs.existsSync(path.join(root,p)))
  throw Error('INVALID_PUBLIC_ACTION:'+p);
}
const results=text['references/results.md'];
for(const sub of ['list/','detail/','greet/','diagnostics/'])
 if(!results.includes(sub))throw Error('OUTPUT_SKILL_DRIFT:'+sub);
const human=fs.readFileSync(path.join(root,'README.md'),'utf8');
for(const forbidden of [/\/wapi\//,/chrome\.storage/i,/97994/,
 /Service\s*Worker/i,/\.js\b/,/docs\/(ARCHITECTURE|EXPERIMENTS|NATIVE-DETAIL)/i])
 if(forbidden.test(human))throw Error('README_INTERNAL_DISCLOSURE:'+forbidden);
if(fs.existsSync(path.join(root,'contracts/actions.json')))
 throw Error('DUPLICATE_ACTION_CONTRACT_NOT_RETIRED');
console.log('PUBLIC_SKILL_PASS files='+files.length+' actionPages=7 noInternalImplementation');
