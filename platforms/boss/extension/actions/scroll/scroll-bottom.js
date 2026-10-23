/* Page capability: scroll the BOSS job-list owner without network requests. */
async function bossScrollToBottom(){
 const page=document.scrollingElement||document.documentElement;
 const list=document.querySelector?.('.rec-job-list')||
  document.querySelector?.('.job-list-container')||null;
 let owner=page;
 for(let el=list;el&&el!==document.body;el=el.parentElement){
  const overflow=typeof getComputedStyle==='function'?
   getComputedStyle(el).overflowY:'';
  if(el.scrollHeight-el.clientHeight>30&&el.clientHeight>80&&
   /^(auto|scroll|overlay)$/.test(overflow)){owner=el;break;}
 }
 const before=owner.scrollTop;
 const bottom=Math.max(0,owner.scrollHeight-owner.clientHeight);
 if(bottom<2)return{reached:false,before,after:before,bottom,
  reason:'NO_SCROLLABLE_JOB_LIST'};
 const move=top=>{
  owner.scrollTop=top;
  if(owner===page)window.scrollTo({top,behavior:'instant'});
 };
 if(before>=bottom-2){
  const distance=Math.min(bottom,Math.max(200,Math.min(700,owner.clientHeight*.7)));
  move(Math.max(0,bottom-distance));
 }
 move(bottom);
 const after=owner.scrollTop;
 return{reached:after>=Math.max(0,owner.scrollHeight-owner.clientHeight)-2,
  before,after,bottom:Math.max(0,owner.scrollHeight-owner.clientHeight),
  owner:owner===page?'DOCUMENT':'JOB_LIST_ANCESTOR'};
}
