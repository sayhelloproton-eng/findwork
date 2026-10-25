import React,{useEffect,useState} from 'react';
import {Alert,Button,Card,Empty,Pagination,Space,Table,Tabs,Tag,Tooltip,Typography} from 'antd';
import {bossRecruitmentBadges} from './boss-recruitment-badges.mjs';
import {makeCommunicationAiPrompt} from './communication-ai-prompt.mjs';
import {resolveSelectedCandidateJobs} from './communication-selection.mjs';
const {Text,Title}=Typography;
const format=v=>v?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(v)):'—';
async function read(url,opts){const response=await fetch(url,opts);const d=await response.json();if(!response.ok)throw Error(d.error||'服务请求失败');return d;}
function Flags({job}){
 const flags=bossRecruitmentBadges(job.list),f=job.facts||{};
 return <Space size={[3,3]} wrap>
  {flags.hunter&&<Tag className="source-signal">猎头</Tag>}
  {flags.dispatch&&<Tag className="dispatch-signal">派遣</Tag>}
  {flags.delegated&&<Tag className="dispatch-signal">代招</Tag>}
  {flags.urgent&&<Tag className="urgent-signal">急聘</Tag>}
  {flags.proxyUnverified&&<Tag className="source-signal">代理</Tag>}
  {f.closed&&<Tag color="error">已关闭</Tag>}
 </Space>;
}
const primary=(_,job)=><div className="stack"><Text strong>{job.facts?.job_name||job.job_name}</Text>
 <Text type="secondary" className="job-company">{job.facts?.brand_name||job.brand_name||'匿名公司'}</Text>
 <Flags job={job}/></div>;
const conditions=(_,j)=><div className="stack"><Text>{j.facts?.salary||'薪资未知'} · {j.facts?.city||'地点未知'}</Text>
 <Text type="secondary">{j.facts?.experience||'经验未知'} · {j.facts?.education||'学历未知'}</Text></div>;
const recruiter=(_,j)=><div className="stack"><Text>{j.facts?.boss_name||'招聘者未知'}</Text>
 <Text type="secondary">{j.facts?.boss_active_desc?'采集时-'+j.facts.boss_active_desc:j.facts?.boss_online===true?'采集时在线':'活跃未知'}</Text></div>;
export default function Communications(){
 const [candidates,setCandidates]=useState({items:[],total:0}),[today,setToday]=useState({items:[],total:0});
 const [candidatePage,setCandidatePage]=useState(1),[todayPage,setTodayPage]=useState(1);
 const [selected,setSelected]=useState([]),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [activeTab,setActiveTab]=useState('candidates');
 const refresh=()=>{
  Promise.all([
   read('/api/communications/candidates?limit=20&offset='+((candidatePage-1)*20)),
   read('/api/communications/today?limit=20&offset='+((todayPage-1)*20))
  ]).then(([c,t])=>{setCandidates(c);setToday(t);})
   .catch(e=>setError(e.message));
 };
 useEffect(()=>{refresh();},[candidatePage,todayPage]);
 useEffect(()=>{const interval=setInterval(()=>{if(!document.hidden)refresh();},12000);return()=>clearInterval(interval);},[candidatePage,todayPage]);
 const copyAiInstruction=async()=>{
  setError('');setMessage('');
  try{
   const latest=await resolveSelectedCandidateJobs(selected,read);
   const prompt=makeCommunicationAiPrompt(latest,selected);
   if(!navigator.clipboard?.writeText)throw Error('CLIPBOARD_UNAVAILABLE');
   await navigator.clipboard.writeText(prompt);
   setMessage('已复制 '+selected.length+' 条岗位的 AI 执行提示词。请粘贴到 ChatGPT 对话中；复制本身不会触发沟通。');
  }catch(e){setError('复制失败：'+(e?.message||'CLIPBOARD_FAILED')+'。请确认岗位选择后重试。');}
 };
 const nameColumn={title:'职位 / 公司',key:'job',width:265,render:primary};
 const condColumn={title:'岗位条件',key:'conditions',width:165,render:conditions};
 return <main className="communication-worktable">
  <header className="worktable-header"><Title level={3} style={{margin:0}}>沟通工作台</Title></header>
  <Card size="small" className="communication-card">
   <Tabs className="communication-tabs" activeKey={activeTab} onChange={setActiveTab}
    tabBarExtraContent={activeTab==='candidates'?<Space wrap size="small">
     <Text type="secondary" className="communication-bridge-state">可跨页勾选；复制前核验最新候选，本页面不会发送消息</Text>
     <Button type="primary" disabled={!selected.length} onClick={copyAiInstruction}>复制 AI 执行提示词（{selected.length}）</Button>
    </Space>:null}
    items={[
     {key:'candidates',label:'值得投递 · 未沟通（'+candidates.total+'）',children:<>
      {error&&<Alert type="error" showIcon message={error} style={{margin:'8px 0'}}/>}
      {message&&<Alert type="info" showIcon message={message} style={{margin:'8px 0'}}/>}
      <Table rowKey="job_id" size="small" tableLayout="fixed" scroll={{x:1100}} pagination={false} dataSource={candidates.items}
       rowSelection={{selectedRowKeys:selected,onChange:setSelected,preserveSelectedRowKeys:true}}
       columns={[nameColumn,condColumn,
        {title:'技能 / JD 要点',key:'skills',width:265,render:(_,j)=><div className="stack"><Text>{(j.facts?.skills||[]).slice(0,5).join(' / ')||'技能未提供'}</Text><Tooltip title={j.ai_summary?.headline||j.facts?.jd_text||'无可用 JD'}><Text type="secondary" ellipsis>{j.ai_summary?.headline||j.facts?.jd_text||'JD 未提供'}</Text></Tooltip></div>},
        {title:'招聘者 / 活跃',key:'boss',width:155,render:recruiter},
        {title:'采集时间',key:'capture',width:155,render:(_,j)=><Text type="secondary">{format(j.detail_fetched_at||j.last_seen_at)}</Text>}]}
       locale={{emptyText:<Empty description="当前没有可沟通的 WORTH 岗位"/>}}/>
      <div className="communication-footer"><Pagination size="small" current={candidatePage} pageSize={20} total={candidates.total} onChange={setCandidatePage}/></div>
     </>},
     {key:'today',label:'今日已沟通（'+today.total+'）',children:<>
      <Table rowKey="job_id" size="small" tableLayout="fixed" scroll={{x:950}} pagination={false} dataSource={today.items}
       columns={[nameColumn,{title:'薪资 / 地点',key:'conditions',width:175,render:(_,j)=><Text>{j.facts?.salary||'—'} · {j.facts?.city||'—'}</Text>},
        {title:'招聘者',key:'boss',width:155,render:(_,j)=><Text>{j.facts?.boss_name||'—'}</Text>},
        {title:'沟通时间',key:'communicated',width:185,render:(_,j)=><Text>{format(j.communicated_at)}</Text>}]}
       locale={{emptyText:<Empty description="今日尚无确认成功的沟通"/>}}/>
      <div className="communication-footer"><Pagination size="small" current={todayPage} pageSize={20} total={today.total} onChange={setTodayPage}/></div>
     </>}
    ]}/>
  </Card>
 </main>;
}
