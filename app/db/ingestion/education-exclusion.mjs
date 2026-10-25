// Hard education exclusion confirmed by the user on 2026-10-25.
// Structured BOSS degrees are authoritative; parse JD only for unequivocal
// mandatory postgraduate requirements, not alternatives or preferences.
const advanced=/(?:硕士|博士|研究生)/;
const explicit=/((?:硕士(?:研究生)?|研究生|博士)(?:(?:[（(]含[）)])?以上|及以上|学历及以上|学位及以上))/g;
const optional=/^(?:.*(?:本科|大专).{0,16}(?:或|\/|、|及|和).{0,12})$/;
function nonempty(value){return typeof value==='string'?value.trim():'';}
export function advancedDegreeExclusion(listDegree,detailDegree,jdText){
 for(const value of [detailDegree,listDegree]){
  const degree=nonempty(value).replace(/\s+/g,'');
  if(!advanced.test(degree))continue;
  if(/(?:本科|大专).{0,8}(?:或|\/|、|和).{0,16}(?:硕士|博士|研究生)/.test(degree))continue;
  if(/(?:硕士|博士|研究生)(?:优先|加分)/.test(degree))continue;
  return{excluded:true,source:'STRUCTURED_DEGREE',evidence:degree.slice(0,100)};
 }
 const jd=nonempty(jdText);
 for(const match of jd.matchAll(explicit)){
  const fragment=jd.slice(Math.max(0,match.index-50),Math.min(jd.length,match.index+match[0].length+30));
  const context=jd.slice(Math.max(0,match.index-32),match.index).replace(/\s+/g,'');
  const following=jd.slice(match.index+match[0].length,match.index+match[0].length+8);
  // Bachelor's eligibility remains valid when explicitly offered as an alternative.
  if(/(?:本科|大专).{0,12}(?:或|\/|、|和).{0,12}$/.test(context)||/优先|加分/.test(following))continue;
  return{excluded:true,source:'EXPLICIT_JD_MANDATORY',evidence:fragment.replace(/\s+/g,' ').slice(0,130)};
 }
 return{excluded:false,source:null,evidence:null};
}
