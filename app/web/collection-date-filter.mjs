// Date range in Asia/Shanghai, consistent with BOSS/Findwork collection display.
export const todayInShanghai=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'
}).format(now);
const previousDate=(date,n)=>new Date(Date.parse(date+'T00:00:00.000Z')-n*86400000).toISOString().slice(0,10);
export function collectionDateRange(mode='day',pickedDate=todayInShanghai(),now=new Date()){
 const today=todayInShanghai(now);
 if(mode==='day')return{collectedFrom:pickedDate,collectedTo:pickedDate};
 if(mode==='last1')return{collectedFrom:today,collectedTo:today};
 if(mode==='last3')return{collectedFrom:previousDate(today,2),collectedTo:today};
 throw Error('INVALID_DATE_MODE');
}
