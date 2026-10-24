// UI-only wording for persisted decision evidence. The database status is unchanged.
export function describeDecision(job){
 const reason=typeof job?.screening_reason==='string'?job.screening_reason.trim():'';
 const pending=job?.screening_status==='PENDING'||job?.screening_status==='NEED_DETAIL';
 if(!pending)return{kind:'decided',text:reason||'判断原因未记录',tooltip:reason||'判断原因未记录'};
 if(reason){
  const assessed=!!job?.decision_source;
  return{kind:'uncertain',text:(assessed?'已评估，仍有疑问：':'已有待核实事项：')+reason,
   tooltip:(assessed?'已完成本轮 AI/人工审阅，但仍无法确定是否值得投递。\n':'已记录疑问，仍待确认。\n')+reason};
 }
 if(job?.decision_source){
  return{kind:'incomplete-record',text:'评估记录缺少理由，需复核',
   tooltip:'已有评估来源，但没有可靠判断理由；该岗位仍处于待评估，不视为已完成评估。'};
 }
 return job?.has_detail===false
  ?{kind:'unassessed',text:'尚未评估（待补详情）',tooltip:'尚无有效 JD，尚未进行正式岗位评估。'}
  :{kind:'unassessed',text:'尚未进行岗位评估',tooltip:'已有 JD 或原文摘录，不等于已经完成 AI 岗位判断。'};
}
