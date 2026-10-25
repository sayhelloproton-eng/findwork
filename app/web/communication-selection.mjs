export async function resolveSelectedCandidateJobs(ids,read){
 if(!Array.isArray(ids)||!ids.length||ids.length>150||new Set(ids).size!==ids.length)throw Error('INVALID_SELECTED_JOBS');
 const first=await read('/api/communications/candidates?limit=100&offset=0');
 if(!Number.isInteger(first.total)||first.total<0)throw Error('INVALID_CANDIDATE_RESPONSE');
 const pages=[first];
 for(let offset=100;offset<first.total;offset+=100)pages.push(await read('/api/communications/candidates?limit=100&offset='+offset));
 if(pages.some(x=>x.total!==first.total))throw Error('CANDIDATE_SET_CHANGED');
 const all=pages.flatMap(x=>x.items||[]);
 if(new Set(all.map(x=>x.job_id)).size!==all.length)throw Error('CANDIDATE_PAGE_DUPLICATE');
 const map=new Map(all.map(x=>[x.job_id,x]));
 const selected=ids.map(x=>map.get(x));
 if(selected.some(x=>!x||x.eligible!==true))throw Error('SELECTION_STALE');
 return selected;
}
