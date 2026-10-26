// Read back server-owned state after an uncertain reservation. Never retry here.
export async function readReservationOutcome(jobIds,read){
 const rows=await Promise.all(jobIds.map(async jobId=>{
  try{const value=await read('/api/jobs/'+encodeURIComponent(jobId));
   const state=value.job?.communication_state;
   return{jobId,state:state==='IN_FLIGHT'?'claimed':['SUCCEEDED','FAILED','UNKNOWN'].includes(state)?'recorded':'unconfirmed'};
  }catch{return{jobId,state:'unconfirmed'};}
 }));
 return{claimed:rows.filter(r=>r.state==='claimed').length,recorded:rows.filter(r=>r.state==='recorded').length,unconfirmed:rows.filter(r=>r.state==='unconfirmed').length};
}
export function reservationFailureMessage(outcome){
 return '领取请求已发出，不能视为未领取：'+outcome.claimed+' 条已领取待核对入队，'+outcome.recorded+' 条已有动作记录，'+outcome.unconfirmed+' 条结果待确认。已停止自动操作，请由 AI 根据岗位 ID 核对，不要直接重领。';
}
