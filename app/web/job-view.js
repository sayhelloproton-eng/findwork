export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e=escapeHtml;
export const statusLabels={PENDING:'待评估',NEED_DETAIL:'缺详情',WORTH:'值得投',PASS:'PASS'};
export const communicationLabel=job=>job.communicated?'已沟通':'未沟通';
const tags=(items,cls='')=>items?.length?`<div class="tags ${cls}">${items.map(t=>`<span>${e(t)}</span>`).join('')}</div>`:'<span class="muted">未提供</span>';
const line=(v,fallback='未提供')=>e(v||fallback);
export function renderJobRow(j){
 const f=j.facts,online=f.boss_online===true?'采集时在线':f.boss_online===false?'采集时未在线':'在线状态未提供';
 return `<tr><td data-label="岗位 / 公司"><strong class="job-title">${e(f.job_name)}</strong>${f.closed?'<b class="closed-label">职位已关闭</b>':''}<span class="company">${line(f.brand_name)}</span><small>${e([f.brand_industry,f.brand_scale].filter(Boolean).join(' · ')||'行业 / 规模未提供')}</small></td>
<td data-label="薪资 / 地点"><strong class="salary">${line(f.salary)}</strong><span>${e([f.city,f.district].filter(Boolean).join(' · ')||'地点未提供')}</span>${f.business_district?`<small>${e(f.business_district)}</small>`:''}</td>
<td data-label="经验 / 学历">${line(f.experience)}<span>${line(f.education)}</span></td>
<td data-label="技能">${tags(f.skills.slice(0,5),'compact')}${f.skills.length>5?`<small>另有 ${f.skills.length-5} 项 · 详情查看</small>`:''}</td>
<td data-label="招聘者">${line(f.boss_name)}<small>${e(f.boss_title||'')}</small><span class="${f.boss_online?'online':'muted'}">${online}</span>${f.boss_active_desc?`<small>${e(f.boss_active_desc)}</small>`:''}</td>
<td data-label="是否值得投递"><b class="state ${e(j.screening_status)}">${e(statusLabels[j.screening_status])}</b><p class="reason" title="${e(j.screening_reason||'')}">${e(j.screening_reason||'尚未作出投递判断')}</p></td>
<td data-label="是否已沟通"><span class="communication ${j.communicated?'contacted':''}">${communicationLabel(j)}</span>${j.block_reason&&!j.communicated?'<small>联系前请查看记录</small>':''}</td>
<td data-label="详情"><button class="detail" data-id="${e(j.job_id)}">查看 / 评估</button><small>${j.has_detail?'详情完整':'尚无详情'}</small></td></tr>`;
}
const field=(name,value)=>`<div><dt>${e(name)}</dt><dd>${line(value)}</dd></div>`;
export function renderDetail({job:j,detail:d}){
 const f=j.facts;
 const stateNote=j.communication_state==='SUCCEEDED'?'本地结果已确认沟通成功。':j.communication_state==='FAILED'?'已有未成功的联系记录，不会自动再次联系。':j.communication_state!=='NONE'?'已有联系动作，结果尚需核实；不会重复联系。':'暂无已确认的沟通结果。';
 const relationships=j.history_signals.map(s=>({LIST_CONTACT:'列表存在联系标记',DETAIL_BE_FRIEND:'详情存在已建立关系标记',DETAIL_ALREADY_SEND:'详情存在简历已发送标记',DETAIL_ALREADY_APPLY:'详情存在在线申请标记'}[s]||'存在需要核验的关系记录'));
 return `<article class="detail-panel"><div class="detail-title"><p class="eyebrow">${e(f.brand_name||'公司未提供')}</p><h2>${e(f.job_name)}</h2><p class="detail-subtitle">${e([f.salary,f.city,f.district].filter(Boolean).join(' · '))}</p>${f.closed?'<b class="closed-label">职位已关闭</b>':''}</div>
<section class="decision-editor"><h3>我的投递判断</h3><form id="decision-form" data-id="${e(j.job_id)}" data-revision="${j.revision}"><label>是否值得投递<select name="status">${Object.entries(statusLabels).map(([value,label])=>`<option value="${value}"${value===j.screening_status?' selected':''}${value==='NEED_DETAIL'&&j.has_detail?' disabled':''}>${label}</option>`).join('')}</select></label><label>判断理由<textarea name="reason" rows="3" maxlength="4000" placeholder="为什么值得投，或为什么 PASS？">${e(j.screening_reason||'')}</textarea></label><div class="save-row"><button type="submit" class="primary">保存判断</button><span id="save-message" role="status"></span></div></form></section>
<section><h3>职位信息 <span class="section-note">来自 BOSS 列表与详情</span></h3><dl class="facts-grid">${field('经验',f.experience)}${field('学历',f.education)}${field('工作地址',f.address||[f.city,f.district,f.business_district].filter(Boolean).join(' · '))}${field('招聘状态',f.job_status_desc)}${field('招聘者',`${f.boss_name||'未提供'} ${f.boss_title||''}`)}${field('招聘者活跃',f.boss_active_desc||(f.boss_online===true?'采集时在线':'未提供活跃描述'))}</dl><h4>技能要求</h4>${tags(f.skills)}${f.labels.length?`<h4>岗位标签</h4>${tags(f.labels)}`:''}${f.welfare.length?`<h4>福利</h4>${tags(f.welfare)}`:''}</section>
<section><h3>完整职位描述</h3>${f.jd_text?`<div class="jd-text">${e(f.jd_text)}</div>`:'<p class="missing-detail">尚未获取详情。补齐后可在这里查看完整 JD。</p>'}</section>
<section><h3>公司信息</h3><dl class="facts-grid">${field('公司名称',f.brand_name)}${field('行业',f.brand_industry)}${field('规模',f.brand_scale)}${field('发展阶段',f.brand_stage)}${f.customer_company?field('客户公司',f.customer_company):''}</dl>${f.company_introduction?`<div class="company-introduction">${e(f.company_introduction)}</div>`:''}${f.company_labels.length?tags(f.company_labels):''}</section>
<section><h3>招聘与用工线索</h3><dl class="facts-grid">${field('猎头标记',f.gold_hunter==null?'未提供':String(f.gold_hunter))}${field('代理招聘标记',f.proxy_job==null?'未提供':String(f.proxy_job))}${field('代理类型原值',f.proxy_type==null?'未提供':String(f.proxy_type))}${field('岗位类型原值',f.job_type==null?'未提供':String(f.job_type))}${f.least_month_desc?field('任期描述',f.least_month_desc):''}${f.days_per_week_desc?field('出勤描述',f.days_per_week_desc):''}</dl><p class="section-note">保留平台标记原值，不能仅据这些编码断定外包或派遣。</p></section>
<section><h3>沟通记录 <span class="communication ${j.communicated?'contacted':''}">${communicationLabel(j)}</span></h3><p>${e(stateNote)}</p>${j.block_reason?`<p class="record-note">${e(j.block_reason)}</p>`:''}${relationships.length?`<p>${e(relationships.join('；'))}。这些信号不等同于本次发送成功。</p>`:''}${j.greet_started_at?`<p class="section-note">动作时间：${e(j.greet_started_at)}${j.greet_confirmed_at?` · 确认时间：${e(j.greet_confirmed_at)}`:''}</p>`:''}</section>
<div class="provenance"><span>首次收录 ${e(j.first_seen_at)}</span>${d?`<span>详情获取 ${e(d.fetched_at)}</span>`:''}<span>判断来源：${e({MANUAL:'人工',SKILL:'Skill',DEMO:'验收模拟'}[j.decision_source]||'尚未判断')}</span></div></article>`;
}
