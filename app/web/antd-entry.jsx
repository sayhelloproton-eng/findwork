import './echarts-entry.mjs';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {makeJudgmentPieOptions} from './judgment-pie-options.mjs';
import {describeDecision} from './decision-display.mjs';
import {bossRecruitmentBadges} from './boss-recruitment-badges.mjs';
import Communications from './communications.jsx';
import {Layout,Menu} from 'antd';
import {makeDailyAppearanceOptions,makeDailyCollectedAndGreetOptions} from './dashboard-options.mjs';
import {createRoot} from 'react-dom/client';
import {Alert,Button,Card,Col,ConfigProvider,DatePicker,Empty,Form,Pagination,Radio,Row,Select,Space,Spin,Table,Tag,Tooltip,Popover,Typography} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import {collectionDateRange,todayInShanghai} from './collection-date-filter.mjs';
const {Title,Text}=Typography;
const labels={WORTH:'值得投',PENDING:'待评估',NEED_DETAIL:'待评估',PASS:'PASS'};
const colors={WORTH:'success',PENDING:'default',NEED_DETAIL:'default',PASS:'error'};
const statusOptions=[{label:'全部',value:''},{label:'值得投',value:'WORTH'},{label:'待评估',value:'PENDING'},{label:'PASS',value:'PASS'}];
const commOptions=[{label:'全部',value:''},{label:'已沟通',value:'true'},{label:'未沟通',value:'false'}];
const educationOptions=[{label:'全部',value:''},{label:'不限',value:'不限'},{label:'大专',value:'大专'},{label:'本科',value:'本科'},{label:'其他',value:'其他'}];
const sortOptions=[{label:'采集时间',value:'collected'},{label:'更新时间',value:'updated'}];
const dateModes=[{label:'最近一天',value:'last1'},{label:'最近三天',value:'last3'},{label:'最近七天',value:'last7'},{label:'自定义日期范围',value:'custom'}];
const defaultFilters={status:'',communicated:'',education:'',brandId:'',location:'',sort:'collected',dateMode:'last3',customRange:[dayjs(todayInShanghai()),dayjs(todayInShanghai())]};
const display=v=>v==null||v===''?'未提供':String(v);
const joined=(...items)=>items.filter(Boolean).join(' · ');
async function api(url,options){
 const response=await fetch(url,options);
 let value;
 try{value=await response.json()}catch{throw Error('服务响应异常');}
 if(!response.ok)throw Error(({DECISION_REASON_REQUIRED:'请填写判断理由',DETAIL_ALREADY_AVAILABLE:'岗位已有完整 JD',DECISION_CONFLICT:'岗位已有新版本，请重新打开'}[value.error])||value.error||'读取失败');
 return value;
}
const groupedTags=values=>Array.isArray(values)&&values.length?
 <Space size={[4,4]} wrap>{values.map((x,i)=><Tag key={String(x)+'-'+i} className="fact-tag">{String(x)}</Tag>)}</Space>:
 <Text type="secondary">未提供</Text>;
const formatCaptureTime=value=>{
 if(!value)return null;
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return null;
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
};
function ConditionTags({facts:f}){
 const conditions=[
  {name:'薪资',value:f.salary||'未提供',className:'salary-condition'},
  {name:'地点',value:joined(f.city,f.district,f.business_district)||f.address||'未提供'},
  {name:'经验',value:f.experience||'未提供'},
  {name:'学历',value:f.education||'未提供'}
 ];
 return <div className="conditions-cell">
  <Space size={[4,4]} wrap>{conditions.map(c=><Tag key={c.name} className={'fact-tag condition-tag '+(c.className||'')}>{c.value}</Tag>)}</Space>
  {f.address&&<Tooltip title={'详细地址：'+f.address}><Text className="address-preview">⌖ {f.address}</Text></Tooltip>}
 </div>;
}
function JdPreview({job:j}){
 const s=j.ai_summary;
 if(j.ai_summary_status!=='READY'||!s)return <span className="ai-jd-pending">{j.ai_summary_status==='NO_DETAIL'?'—':'待 AI 提炼'}</span>;
 const extracted=s.headline.startsWith('原文摘录｜');
 const groups=[['核心职责',s.responsibilities],['硬性要求',s.requirements],['加分项',s.bonus],['特别注意',s.notices]];
 return <Popover trigger="hover" placement="bottomLeft" overlayClassName="ai-jd-popover" mouseEnterDelay={0.12}
  title={extracted?'JD 原文结构化摘录 · 非 AI 评估':'AI 岗位提炼 · 来源：已采集 JD'} content={<div className="ai-jd-popover-body">
   {groups.filter(([,items])=>items?.length).map(([title,items])=><section className="ai-jd-group" key={title}>
    <div className="ai-jd-group-title">{title}</div>
    {items.map((item,i)=><div key={i} className="ai-jd-point"><span>•</span><span>{item}</span></div>)}
   </section>)}
   <div className="ai-jd-source">{extracted?'仅原文分段摘录，未由模型评估；点击岗位查看完整 JD':'AI 提炼仅供筛选；点击岗位行查看原始完整 JD'}</div>
  </div>}>
  <div className="ai-jd-trigger" tabIndex={0} aria-label={(extracted?'岗位原文摘录：':'AI 岗位概述：')+s.headline}>
   <span className="ai-jd-caption">{extracted?'原文摘录':'AI 提炼'}</span>
   <span className="ai-jd-headline">{s.headline}</span>
   <span className="ai-jd-hint">悬浮查看结构化提炼</span>
  </div>
 </Popover>;
}
function SkillsAndBenefits({job:j}){
 const f=j.facts||{},skills=f.skills||[],known=new Set([f.experience,f.education,...skills].map(x=>String(x||'').trim().toLowerCase()));
 const extra=[...new Set((f.labels||[]).filter(x=>!known.has(String(x).trim().toLowerCase())))];
 const welfare=[...new Set((f.welfare||[]).filter(x=>typeof x==='string'&&x.trim()))];
 const shown=welfare.slice(0,5),remaining=welfare.slice(5);
 return <div className="skills-benefits">
  <div className="skills-cell">{groupedTags(skills)}</div>
  {extra.length>0&&<div className="extra-job-tags"><Space size={[3,3]} wrap>{extra.map(x=><Tag className="fact-tag" key={x}>{x}</Tag>)}</Space></div>}
  {welfare.length>0&&<div className="welfare-line"><Text className="micro-label">福利</Text><Space size={[3,3]} wrap>
   {shown.map(x=><Tag className="benefit-tag" key={x}>{x}</Tag>)}
   {remaining.length>0&&<Popover trigger="click" placement="bottomLeft" overlayClassName="welfare-more-popover" title="更多福利" content={
    <div className="welfare-more-content" data-testid="more-welfare-content"><Space size={[4,5]} wrap>{remaining.map((x,i)=><Tag className="benefit-tag" key={x+'-'+i}>{x}</Tag>)}</Space></div>
   }><Button type="text" size="small" className="welfare-more" title="点击查看更多福利" aria-label={'查看其余 '+remaining.length+' 项福利'} onClick={e=>e.stopPropagation()}>··· 更多</Button></Popover>}
  </Space></div>}
 </div>;
}
function JobFlags({job:j}){
 const f=j.facts||{},list=j.list||{},badges=bossRecruitmentBadges(list);
 return <div className="job-flags">
  {f.closed&&<Tag className="closed-signal" color="error" bordered={false}>已关闭</Tag>}
  {badges.hunter&&<Tooltip title="BOSS 原生猎头图标或 goldHunter=1"><Tag className="source-signal">猎头</Tag></Tooltip>}
  {badges.dispatch&&<Tooltip title="BOSS 原生职位卡片图标明确标注派遣"><Tag className="dispatch-signal">派遣</Tag></Tooltip>}
  {badges.delegated&&<Tooltip title="BOSS 原生职位卡片图标明确标注代招；不能仅凭 proxyType 猜测"><Tag className="dispatch-signal">代招</Tag></Tooltip>}
  {badges.proxyUnverified&&<Tooltip title={'原生 proxyJob=1，proxyType='+String(list.proxyType)+'；尚不能直接确认为猎头、派遣或代招'}><Tag className="source-signal">{list.proxyType===4?'代理·类型4':'代理'}</Tag></Tooltip>}
  {badges.urgent&&<Tag className="urgent-signal">急聘</Tag>}
  {Number.isInteger(list.anonymous)&&list.anonymous!==0&&<Tooltip title={'原生 anonymous='+list.anonymous+'，具体编码含义待核实'}><Tag className="source-signal">匿名码{list.anonymous}</Tag></Tooltip>}
  {list.atsDirectPost===true&&<Tag className="source-signal">支持ATS直投</Tag>}
  {typeof list.optimal==='number'&&list.optimal!==0&&<Tag className="source-signal">优选码{list.optimal}</Tag>}
  {f.least_month_desc&&<Tag className="source-signal">{f.least_month_desc}</Tag>}
  {f.days_per_week_desc&&<Tag className="source-signal">{f.days_per_week_desc}</Tag>}
  {list.jobValidStatus!=null&&list.jobValidStatus!==1&&!f.closed&&<Tag className="source-signal">状态码{String(list.jobValidStatus)}</Tag>}
 </div>;
}
function RecruiterInfo({job:j}){
 const f=j.facts||{},capture=formatCaptureTime(j.detail_fetched_at);
 const name=display(f.boss_name);
 const recruiterRole=typeof f.boss_title==='string'?f.boss_title.trim():'';
 return <div className="stack recruiter-cell">
  <Text className="recruiter-name">{name}</Text>
  {recruiterRole&&recruiterRole!=='招聘者'&&<Text type="secondary" className="recruiter-role">{recruiterRole}</Text>}
  {f.boss_active_desc?<Tooltip title={capture?'该活跃描述来自 '+capture+'（北京时间）采集的 BOSS 详情，非当前实时状态':'历史详情活跃描述，非当前实时状态'}>
   <Tag className="recruiter-active" color="processing">采集时-{f.boss_active_desc}</Tag>
  </Tooltip>:<Tag className="recruiter-active" color="processing">{f.boss_online===true?'采集时-在线':f.boss_online===false?'采集时-未在线':'活跃信息未知'}</Tag>}
  {capture?<Tooltip title={'BOSS 详情回执 capturedAt（北京时间）：'+capture}>
   <Text className="capture-time">{capture}</Text>
  </Tooltip>:<Text className="capture-time">采集时间未记录</Text>}
 </div>;
}
function EChartCanvas({options,dataKey,ariaLabel,className='trend-echart',centerTotal=null}){
 const chartEl=useRef(null);
 useEffect(()=>{
  const node=chartEl.current;
  if(!node||!window.findworkEcharts)return;
  const instance=window.findworkEcharts.init(node,null,{renderer:'canvas'});
  instance.setOption(options);
  const resize=()=>instance.resize();
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;
  observer?.observe(node);
  window.addEventListener('resize',resize);
  return()=>{observer?.disconnect();window.removeEventListener('resize',resize);instance.dispose();};
 },[dataKey]);
 return <div className="dashboard-echart-wrap">
  <div ref={chartEl} className={className} role="img" aria-label={ariaLabel}/>
  {centerTotal!==null&&<div className="judgment-echart-center"><strong>{centerTotal}</strong><span>岗位</span></div>}
 </div>;
}
function TrendChart({data,mode}){
 const rows=data.days||[];
 const options=mode==='new-appearances'?makeDailyAppearanceOptions(rows):makeDailyCollectedAndGreetOptions(rows);
 return <EChartCanvas options={options} dataKey={mode+'|'+JSON.stringify(rows)}
  ariaLabel={mode==='new-appearances'?'最近十四天较前一天新出现岗位趋势，缺失基线不补零':'最近十四天每日收录与沟通分组柱状图'}/>;
}
function DonutCard({title,subtitle,entries,help}){
 const total=entries.reduce((n,e)=>n+Math.max(0,Number(e.value)||0),0);
 return <div className="dashboard-panel donut-card">
  <div className="dashboard-panel-title-row">
   <div className="dashboard-panel-title">{title}</div>
   {help&&<Tooltip title={help} placement="topLeft" mouseEnterDelay={0.1}>
    <button type="button" className="judgment-help-trigger" aria-label="查看岗位判断状态说明">?</button>
   </Tooltip>}
  </div>
  <div className="dashboard-subtitle">{subtitle}</div>
  <EChartCanvas options={makeJudgmentPieOptions(entries,title)}
   dataKey={title+'|'+entries.map(e=>e.label+':'+e.value).join('|')}
   ariaLabel={title+'：'+entries.map(e=>e.label+e.value+'条').join('，')}
   className="judgment-echart" centerTotal={total}/>
 </div>;
}
const judgmentHelp=<div className="judgment-help-content">
 <div><strong>值得投：</strong>AI 根据已确认的个人画像、求职偏好、排除条件和岗位证据，认为值得争取；不代表已沟通或正式投递。</div>
 <div><strong>待评估：</strong>尚未评估、缺详情，或 AI 分析后仍有疑问及其他异常。已分析的岗位会保存判断依据、疑点和建议，供人工查看。</div>
 <div><strong>PASS：</strong>明确不符合已确认的排除条件或关键要求，有证据和原因，不再优先推荐复核。</div>
</div>;
function JobDashboard({data}){
 if(!data)return <div className="dashboard-loading"><Spin size="small"/> 正在载入真实岗位趋势…</div>;
 const degree=data.education||{},decisions=data.judgment||{};
 return <section className="dashboard-row" aria-label="岗位分析大盘">
  <div className="dashboard-panel trend-panel">
   <div className="dashboard-panel-title">每日新出现岗位趋势</div>
   <div className="dashboard-subtitle">{(data.days||[]).some(d=>d.newComparedYesterday!==null)?
    '最近14天 · 较前一天新出现':'暂无可比前日基线 · 后续连续采集自动生成'}</div>
   <TrendChart data={data} mode="new-appearances"/>
  </div>
  <div className="dashboard-panel trend-panel">
   <div className="dashboard-panel-title">每日收录与沟通</div>
   <div className="dashboard-subtitle">最近14天 · 收录去重 / 成功沟通</div>
   <TrendChart data={data} mode="daily"/>
  </div>
  <DonutCard title="岗位学历分布" subtitle="全部收录岗位 · 学历要求" entries={[
   {label:'不限',value:degree['不限']||0},{label:'大专',value:degree['大专']||0},
   {label:'本科',value:degree['本科']||0},{label:'其他/未提供',value:degree['其他/未提供']||0}
  ]}/>
  <DonutCard title="岗位判断占比" subtitle="当前全部收录岗位" help={judgmentHelp} entries={[
   {label:'值得投',value:decisions.WORTH||0},{label:'待评估',value:decisions.PENDING||0},
   {label:'PASS',value:decisions.PASS||0}
  ]}/>
 </section>;
}
function DetailPane({job,detail}){
 const f=job.facts||{},signalNames={LIST_CONTACT:'平台列表存在联系标记',DETAIL_BE_FRIEND:'平台记录已建立联系关系',DETAIL_ALREADY_SEND:'平台记录已发送简历',DETAIL_ALREADY_APPLY:'平台记录已申请'};
 const histories=(job.history_signals||[]).map(s=>signalNames[s]||'其他历史关系证据');
 const visible=new Set([...(f.labels||[]),...(f.skills||[]),...(f.welfare||[]),f.brand_industry,f.brand_scale,f.brand_stage].map(x=>String(x||'').trim().toLowerCase()));
 const companyLabels=[...new Set((f.company_labels||[]).filter(x=>typeof x==='string'&&!visible.has(x.trim().toLowerCase())))];
 const customer=f.customer_company&&f.customer_company!==f.brand_name?f.customer_company:null;
 const count=detail?.data?.jobInfo?.recruitmentCountDesc;
 const extra=Boolean(customer||companyLabels.length||(typeof count==='string'&&count.trim()));
 const activity=Boolean(histories.length||job.greet_started_at||job.greet_reason);
 const side=extra||activity;
 return <div className="inline-detail detail-unique" data-testid="job-detail">
  <Row gutter={[12,12]} align="top">
   <Col xs={24} lg={side?16:24}>
    <Card title="原始完整 JD" size="small" className="detail-card">
     {f.jd_text?<div className="jd-text">{f.jd_text}</div>:<Alert type="warning" showIcon message="尚未采集到原始 JD"/>}
    </Card>
   </Col>
   {side&&<Col xs={24} lg={8}>
    {extra&&<Card title="列表未展示的补充信息" size="small" className="detail-card">
     {customer&&<div className="detail-extra-field"><Text type="secondary">客户公司</Text><Text>{customer}</Text></div>}
     {typeof count==='string'&&count.trim()&&<div className="detail-extra-field"><Text type="secondary">招聘人数</Text><Text>{count}</Text></div>}
     {companyLabels.length>0&&<div className="detail-extra-field"><Text type="secondary">公司特点</Text>{groupedTags(companyLabels)}</div>}
    </Card>}
    {activity&&<Card title="历史联系证据" size="small" className={'detail-card'+(extra?' section-gap':'')}>
     <Space direction="vertical" size={5} style={{width:'100%'}}>
      {histories.map((v,i)=><Text key={i} type="secondary">• {v}</Text>)}
      {job.greet_started_at&&<Text type="secondary">发起联系：{formatCaptureTime(job.greet_started_at)||job.greet_started_at}</Text>}
      {job.greet_reason&&<Text type="secondary">回执说明：{job.greet_reason}</Text>}
     </Space>
    </Card>}
   </Col>}
  </Row>
 </div>;
}
function Worktable(){
 const [form]=Form.useForm();
 const [filters,setFilters]=useState(defaultFilters);
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(20);
 const [items,setItems]=useState([]),[total,setTotal]=useState(0);
 const [locations,setLocations]=useState([]),[companies,setCompanies]=useState([]);
 const [dashboard,setDashboard]=useState(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 const [expandedId,setExpandedId]=useState(null),[detail,setDetail]=useState(null),[detailLoading,setDetailLoading]=useState(false);
 const [demo,setDemo]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();const params=new URLSearchParams();
  Object.entries(filters).forEach(([k,v])=>{if(k!=='dateMode'&&k!=='customRange'&&v!==''&&v!=null)params.set(k,String(v));});
  const range=collectionDateRange(filters.dateMode,filters.customRange?.map(d=>d?.format('YYYY-MM-DD')));
  params.set('collectedFrom',range.collectedFrom);params.set('collectedTo',range.collectedTo);
  params.set('limit',String(pageSize));params.set('offset',String((page-1)*pageSize));
  setLoading(true);setError('');
  api('/api/jobs?'+params,{signal:controller.signal}).then(data=>{
   if(controller.signal.aborted)return;
   setItems(data.items);setTotal(data.total);setLocations(data.locations);setCompanies(data.companies||[]);setDemo(!!data.demo);
   if(data.total>0&&(page-1)*pageSize>=data.total){setPage(Math.max(1,Math.ceil(data.total/pageSize)));return;}
   setExpandedId(old=>old&&data.items.some(j=>j.job_id===old)?old:null);
  }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[filters,page,pageSize]);
 useEffect(()=>{
  if(!expandedId){setDetail(null);return;}
  const controller=new AbortController();setDetail(null);setDetailLoading(true);
  api('/api/jobs/'+encodeURIComponent(expandedId),{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setDetail(data);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});
  return()=>controller.abort();
 },[expandedId]);
 useEffect(()=>{let live=true;
  const refresh=()=>{if(document.hidden)return;api('/api/dashboard')
   .then(data=>{if(live)setDashboard(data);}).catch(e=>{if(live)setError(e.message);});};
  refresh();const timer=setInterval(refresh,30000);
  document.addEventListener('visibilitychange',refresh);
  return()=>{live=false;clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};
 },[]);
 const applyFilters=values=>{
  setFilters({...defaultFilters,...values});setPage(1);setExpandedId(null);
 };
 const clear=()=>{form.setFieldsValue(defaultFilters);applyFilters(defaultFilters);};
 const columns=[
  {title:'职位 / 公司',key:'name',width:315,render:(_,j)=><div className="job-primary">
   <Text strong className="job-name">{display(j.facts.job_name)}</Text>
   {j.facts.company_introduction?
    <Tooltip title={<div className="company-popover">{j.facts.company_introduction}</div>}><Text type="secondary" className="job-company">{display(j.facts.brand_name)}</Text></Tooltip>:
    <Text type="secondary" className="job-company">{display(j.facts.brand_name)}</Text>}
   <Text type="secondary" className="table-subtle">{joined(j.facts.brand_industry,j.facts.brand_scale,j.facts.brand_stage)||'公司信息未提供'}</Text>
   <JobFlags job={j}/>
  </div>},
  {title:'岗位条件',key:'conditions',className:'conditions-column',width:150,render:(_,j)=><ConditionTags facts={j.facts}/>},
   {title:'技能 / 福利',key:'skills',width:390,render:(_,j)=><SkillsAndBenefits job={j}/>},
  {title:'职责 / 要求',key:'jd_preview',width:350,render:(_,j)=><JdPreview job={j}/>},
  {title:'招聘者/采集时间',key:'boss',width:165,render:(_,j)=><RecruiterInfo job={j}/>},
  {title:'判断 / 原因',key:'decision',width:175,render:(_,j)=>{
   const state=describeDecision(j);
   return <div className="stack">
    <Tag bordered={false} color={colors[j.screening_status]}>{labels[j.screening_status]||'未知'}</Tag>
    <Tooltip title={state.tooltip}><Text className={'two-lines decision-note decision-note-'+state.kind} type="secondary">{state.text}</Text></Tooltip>
   </div>;
  }},
  {title:'沟通 / 时间',key:'communication',width:172,render:(_,j)=><div className="stack communication-dates">
   <Tag color={j.communicated?'success':'default'} bordered={false}>{j.communicated?'已沟通':'未沟通'}</Tag>
   {j.communicated&&j.communicated_at&&<Tooltip title={'确认 Greet 成功时间（北京时间）：'+formatCaptureTime(j.communicated_at)}><Text className="communication-time">沟通 {formatCaptureTime(j.communicated_at)}</Text></Tooltip>}
   <Tooltip title={'本地记录最后修改时间（北京时间）；首次落库：'+(formatCaptureTime(j.first_seen_at)||'未记录')}><Text className="record-updated-time">更新 {formatCaptureTime(j.updated_at)||'未记录'}</Text></Tooltip>
   {!j.communicated&&j.block_reason&&<Tooltip title={j.block_reason}><Text className="historical-signal" type="warning">有历史线索</Text></Tooltip>}
  </div>},
 ];
 return <main className="worktable">
  <header className="worktable-header"><Title level={3} style={{margin:0}}>岗位工作台</Title></header>
  {demo&&<Alert type="warning" showIcon className="top-alert" message="演示数据：筛选及沟通记录均为模拟，不代表真实投递。"/>}
  <JobDashboard data={dashboard}/>
  <Card className="filter-card" size="small">
   <Form form={form} name="job-filters" initialValues={defaultFilters} onValuesChange={(_,values)=>applyFilters(values)} className="filter-form" layout="vertical" size="small">
    <Form.Item name="location" label="地点" className="filter-location">
     <Select options={[{label:'全部地点',value:''},...locations.map(x=>({label:x,value:x}))]}/>
    </Form.Item>
    <Form.Item name="brandId" label="公司" className="filter-company">
     <Select showSearch optionFilterProp="label" options={[{label:'全部公司',value:''},...companies.map(c=>({label:c.name||'匿名',value:c.id}))]}/>
    </Form.Item>
    <Form.Item name="education" label="学历" className="filter-radio"><Radio.Group options={educationOptions} optionType="button" buttonStyle="solid"/></Form.Item>
    <Form.Item name="communicated" label="沟通" className="filter-radio"><Radio.Group options={commOptions} optionType="button" buttonStyle="solid"/></Form.Item>
    <Form.Item name="status" label="投递判断" className="filter-radio"><Radio.Group options={statusOptions} optionType="button" buttonStyle="solid"/></Form.Item>
    <Form.Item name="dateMode" label="采集日期" className="filter-date-mode">
     <Select options={dateModes} aria-label="采集日期"/>
    </Form.Item>
    {filters.dateMode==='custom'&&<Form.Item name="customRange" className="filter-custom-range">
     <DatePicker.RangePicker format="YYYY-MM-DD" allowClear={false} inputReadOnly
      placeholder={['开始日期','结束日期']} aria-label="自定义采集日期范围"/>
    </Form.Item>}
    <Form.Item name="sort" label="排序" className="filter-radio"><Radio.Group options={sortOptions} optionType="button" buttonStyle="solid"/></Form.Item>
    <Form.Item className="filter-buttons"><Button onClick={clear} id="reset-filters">重置</Button></Form.Item>
   </Form>
  </Card>
  {error&&<Alert type="error" showIcon className="top-alert" message={error} role="alert"/>}
  <Table className="job-table" tableLayout="fixed" size="small" bordered={false} rowKey="job_id" columns={columns} dataSource={items} loading={loading} pagination={false} scroll={{x:1717}}
   locale={{emptyText:<Empty description="没有符合条件的岗位，请调整筛选条件。"/>}}
   rowClassName={j=>'job-row'+(expandedId===j.job_id?' row-selected':'')}
   onRow={record=>({onClick:e=>{if(e.target.closest('button,input,textarea,select,a'))return;setExpandedId(id=>id===record.job_id?null:record.job_id);}})}
   expandable={{
    expandedRowKeys:expandedId?[expandedId]:[],
    onExpand:(expanded,record)=>setExpandedId(expanded?record.job_id:null),
    showExpandColumn:false,
    expandedRowRender:record=><div className="detail-wrap">{detailLoading||detail?.job?.job_id!==record.job_id?<div className="detail-spinner"><Spin/> 正在加载岗位详情…</div>:<DetailPane job={detail.job} detail={detail.detail}/>}</div>
   }}/>
  <div className="table-footer">
   <Text type="secondary">当前 {total?((page-1)*pageSize+1):0}–{Math.min(page*pageSize,total)} / {total}</Text>
   <Pagination current={page} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={['20','50','100']} showQuickJumper size="small" onChange={(p,size)=>{setPage(p);setPageSize(size);setExpandedId(null);}}/>
  </div>
 </main>;
}
const nonce=document.querySelector('meta[name="antd-style-nonce"]')?.getAttribute('content');
function FindworkApp(){
 const isCommunication=location.pathname==='/communications';
 return <Layout className="application-layout">
  <Layout.Sider width={188} theme="light" className="application-sider">
   <div className="application-brand">Findwork</div>
   <Menu mode="inline" selectedKeys={[isCommunication?'communications':'jobs']} items={[
    {key:'jobs',label:<a href="/">岗位工作台</a>},
    {key:'communications',label:<a href="/communications">沟通工作台</a>}
   ]}/>
  </Layout.Sider>
  <Layout.Content className="application-main">{isCommunication?<Communications/>:<Worktable/>}</Layout.Content>
 </Layout>;
}
createRoot(document.getElementById('root')).render(
 <ConfigProvider locale={zhCN} componentSize="small" csp={nonce?{nonce}:undefined}
  theme={{token:{colorPrimary:'#2167b5',borderRadius:7,fontSize:13,colorBgLayout:'#f5f7fb',colorText:'#23354b'},components:{Table:{cellPaddingBlockSM:7,cellPaddingInlineSM:9,headerBg:'#f2f5f9'},Card:{bodyPaddingSM:12}}}}>
  <FindworkApp/>
 </ConfigProvider>
);
