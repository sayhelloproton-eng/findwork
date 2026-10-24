import { readFileSync } from 'node:fs';
import { importList,importDetail,decideJob,importGreet,queryJobs } from '../db/ingestion/job-store.ts';

export function syntheticFixtureBundle(){
 const names=['Agent 应用工程师','AI 全栈工程师','平台前端工程师','开发工具工程师','前端工程师','云平台工程师','AI 应用工程师','全栈开发工程师','研发效能工程师','前端平台工程师','技术开发工程师','Agent 产品工程师','Web 开发工程师','TypeScript 工程师','业务应用工程师'];
 const jobs=names.map((jobName,i)=>({encryptJobId:`demo-${String(i+1).padStart(2,'0')}`,jobName,brandName:`示例公司 ${i+1}`,cityName:i%4===0?'杭州':'上海',areaDistrict:i%4===0?'余杭区':i%2?'徐汇区':'浦东新区',businessDistrict:'示例商圈',salaryDesc:i%3?'25-40K·14薪':'面议',jobExperience:'3-5年',jobDegree:'本科',
  brandIndustry:'计算机软件',brandScaleName:i%2?'100-499人':'20-99人',brandStageName:'A轮',bossName:'示例招聘者',bossTitle:i%2?'技术负责人':'招聘经理',bossOnline:i%3!==0,contact:false,
  skills:i%2?['TypeScript','React','Node.js','开发工具','RAG','MCP']:['TypeScript','Vue','平台工程'],jobLabels:['3-5年','本科','工程化'],welfareList:['五险一金','带薪年假','弹性工作'],
  goldHunter:i%3===0?1:0,proxyJob:i%3===0?1:0,proxyType:i%3===0?1:0,jobType:0,jobValidStatus:1,daysPerWeekDesc:'',leastMonthDesc:'',atsDirectPost:false,
  beforeNameIcons:[{label:'示例图标',url:'https://example.invalid/icon.png'}],iconFlagList:[],iconWord:'',afterNameIcons:[]}));
 const details=jobs.slice(0,11).map((j,i)=>({contract:'boss-native-detail-queue.v3',jobId:j.encryptJobId,capturedAt:'2026-10-22T02:00:00Z',rawResponse:{code:0,zpData:{
  jobInfo:{encryptId:j.encryptJobId,jobName:j.jobName,postDescription:`【岗位职责】\n1. 参与企业应用与开发工具建设，围绕真实业务问题完成需求分析、设计和交付。\n2. 使用 TypeScript、React / Vue 与 Node.js 开发可靠的前后端模块。\n3. 建设测试、监控和持续交付流程，持续改善研发效率。\n\n【任职要求】\n1. 具备扎实的 Web 基础和工程实践，能够解释技术方案的取舍。\n2. 熟悉组件设计、接口协作和线上问题排查，有完整项目交付经验。\n3. 能根据业务需求使用 Agent、RAG 或 MCP 等技术，并验证效果。\n\n【加分项】\n具备云平台、开发工具或可观测性实践，重视文档与团队协作。\n\n本段为公开合成 JD，仅用于界面与流程测试。`,salaryDesc:j.salaryDesc,experienceName:'3-5年',degreeName:'本科',showSkills:j.skills,invalidStatus:i>=9,jobStatusDesc:i>=9?'职位已关闭':'招聘中',address:`${j.cityName}${j.areaDistrict}示例办公园区`,positionName:'软件研发',jobType:0,proxyJob:j.proxyJob,proxyType:j.proxyType},
  bossInfo:{name:j.bossName,title:j.bossTitle,bossOnline:j.bossOnline,activeTimeDesc:i%2?'今日活跃':'刚刚活跃'},
  brandComInfo:{brandName:j.brandName,industryName:j.brandIndustry,scaleName:j.brandScaleName,stageName:j.brandStageName,introduce:'这是一家用于合成测试的示例公司，致力于企业软件、开发工具与 AI 应用。\n团队重视工程质量、用户反馈和持续交付。',labels:['企业服务','开发工具']},
  relationInfo:{beFriend:i>=2&&i<=6,interestJob:false},oneKeyResumeInfo:{alreadySend:false,canSendResume:true},atsOnlineApplyInfo:{alreadyApply:false}
 }}}));
 return{kind:'synthetic',list:{code:0,zpData:{jobList:jobs}},details};
}
export function seedFixtureBundle(db:any,bundle:any){
 if(!bundle||!Array.isArray(bundle.details))throw Error('INVALID_FIXTURE_BUNDLE');
 importList(db,bundle.list);for(const detail of bundle.details)importDetail(db,detail);
 const jobs=queryJobs(db,{sort:"updated",limit:500}).items; // synthetic seeding must not depend on UI default sort
 for(const [i,j] of jobs.entries()){
  const status=j.facts.closed?'PASS':!j.has_detail?(i%2?'NEED_DETAIL':'PENDING'):i%3===0?'PASS':i%3===1?'WORTH':'PENDING';
  decideJob(db,{jobId:j.job_id,status,reason:status==='PASS'?'验收模拟：此岗位不纳入本次投递范围。':status==='WORTH'?'验收模拟：岗位职责与目标方向相关，保留为候选。':null,source:'DEMO'});
 }
 const available=jobs.filter((j:any)=>!j.facts.closed&&!j.history_blocked);
 for(const j of available.slice(0,3))decideJob(db,{jobId:j.job_id,status:'WORTH',reason:'验收模拟：用于验证值得投且未沟通的候选。',source:'DEMO'});
 const receipt=(jobId:string,unknown=false)=>({contract:'boss-greet-result.v1',jobId,endpoint:'/wapi/zpgeek/friend/add.json',method:'POST',startedAt:'2026-10-22T03:00:00Z',finishedAt:'2026-10-22T03:00:01Z',result:unknown?'FAILED':'SUCCESS',httpStatus:unknown?null:200,response:unknown?null:{code:0},...(unknown?{sideEffectState:'UNKNOWN'}:{})});
 if(available[1])importGreet(db,receipt(available[1].job_id));if(available[2])importGreet(db,receipt(available[2].job_id,true));
}
export function seedDatabase(db:any){seedFixtureBundle(db,syntheticFixtureBundle());}
export function seedLocalFixtures(db:any,path:string){let data:any;try{data=JSON.parse(readFileSync(path,'utf8'));}catch{throw Error('LOCAL_FIXTURES_UNAVAILABLE');}seedFixtureBundle(db,data);}
