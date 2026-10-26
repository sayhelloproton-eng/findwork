// Failed or unresolved actions are not a fresh, uncontacted candidate.
export function describeCommunication(job){
 return({SUCCEEDED:{label:'已沟通',color:'success'},FAILED:{label:'沟通失败',color:'error'},IN_FLIGHT:{label:'待结算',color:'processing'},UNKNOWN:{label:'结果未知',color:'warning'},NONE:{label:'未沟通',color:'default'}})[job.communication_state]||{label:'状态未知',color:'warning'};
}
