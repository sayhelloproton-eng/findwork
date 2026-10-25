// BOSS native PC job-card badges, grounded in observed icon images and original fields.
// Do not guess a "派遣" or "代招" badge from proxyType=1/3/4 alone.
// The BOSS List original images are URL strings in beforeNameIcons.
const iconFiles={
 hunter:'cy4fi6cada1655206055291.png',
 dispatch:'6zb0e7e8qm1655206107975.png',
 delegated:'pvmr2v0l8i1655206532429.png',
 urgent:'4or9x2qcfv1699943576247.png'
};

export function bossRecruitmentBadges(list={}){
 const icons=Array.isArray(list?.beforeNameIcons)?list.beforeNameIcons.filter(x=>typeof x==='string'):[];
 const has=name=>icons.some(url=>url.includes('/'+iconFiles[name]));
 const hunter=has('hunter')||list?.goldHunter===1;
 const dispatch=has('dispatch');
 const delegated=has('delegated');
 const urgent=has('urgent')||list?.iconWord==='急聘';
 const proxyUnverified=list?.proxyJob===1&&!hunter&&!dispatch&&!delegated;
 return {hunter,dispatch,delegated,urgent,proxyUnverified};
}
