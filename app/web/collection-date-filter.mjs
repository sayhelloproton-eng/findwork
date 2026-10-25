// Calendar-day windows in Asia/Shanghai; backend filters inclusive collection dates.
export const todayInShanghai=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'
}).format(now);
const previousDate=(date,n)=>new Date(Date.parse(date+'T00:00:00.000Z')-n*86400000).toISOString().slice(0,10);
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
 Number.isFinite(Date.parse(value+'T00:00:00.000Z'))&&new Date(value+'T00:00:00.000Z').toISOString().slice(0,10)===value;
export function collectionDateRange(mode='last3',customRange=null,now=new Date()){
 const today=todayInShanghai(now);
 if(mode==='last1')return{collectedFrom:today,collectedTo:today};
 if(mode==='last3')return{collectedFrom:previousDate(today,2),collectedTo:today};
 if(mode==='last7')return{collectedFrom:previousDate(today,6),collectedTo:today};
 if(mode==='custom'){
  if(!Array.isArray(customRange)||customRange.length!==2||!customRange.every(validDate)||customRange[0]>customRange[1])
   throw Error('INVALID_COLLECTION_DATE_RANGE');
  return{collectedFrom:customRange[0],collectedTo:customRange[1]};
 }
 throw Error('INVALID_DATE_MODE');
}
