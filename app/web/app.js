import {renderJobRow,renderDetail,escapeHtml} from './job-view.js';
const form=document.querySelector('#filters'),rows=document.querySelector('#rows'),error=document.querySelector('#error'),notice=document.querySelector('#notice'),pageSize=document.querySelector('#page-size');
let offset=0,request=0,detailRequest=0,candidates=false,expandedId=null,total=0;
async function api(path,options){
 const res=await fetch(path,options),value=await res.json();
 if(!res.ok)throw Error(({DECISION_REASON_REQUIRED:'请填写判断理由',DETAIL_ALREADY_AVAILABLE:'已有完整详情',DECISION_CONFLICT:'判断已被更新，请重新展开'}[value.error])||value.error||'读取失败');
 return value;
}
async function expand(jobId){
 const row=[...rows.querySelectorAll('tr.job-row')].find(r=>r.dataset.id===jobId);
 if(!row)return;
 if(expandedId===jobId&&rows.querySelector('.expanded-row')){rows.querySelector('.expanded-row').remove();row.classList.remove('is-expanded');row.querySelector('.detail').setAttribute('aria-expanded','false');expandedId=null;return;}
 const key=++detailRequest;
 rows.querySelector('.expanded-row')?.remove();rows.querySelectorAll('.is-expanded').forEach(r=>{r.classList.remove('is-expanded');r.querySelector('.detail').setAttribute('aria-expanded','false');});
 expandedId=jobId;row.classList.add('is-expanded');row.querySelector('.detail').setAttribute('aria-expanded','true');
 const panel=document.createElement('tr');panel.className='expanded-row';panel.dataset.id=jobId;
 const cell=document.createElement('td');cell.colSpan=8;cell.innerHTML='<div class="detail-loading">正在读取完整 JD…</div>';panel.append(cell);row.after(panel);
 try{const value=await api('/api/jobs/'+encodeURIComponent(jobId));if(key===detailRequest&&panel.isConnected&&expandedId===jobId)cell.innerHTML=renderDetail(value);}
 catch(e){if(key===detailRequest&&panel.isConnected)cell.textContent='读取详情失败：'+e.message;}
}
async function load(){
 const seq=++request;error.textContent='';
 const params=new URLSearchParams([...new FormData(form)].filter(([,v])=>v));
 params.set('limit',pageSize.value);params.set('offset',String(offset));if(candidates)params.set('candidates','true');
 try{
 const data=await api('/api/jobs?'+params);if(seq!==request)return;total=data.total;
 const limit=Number(pageSize.value);if(total&&offset>=total){offset=Math.floor((total-1)/limit)*limit;return load();}
 const ids=data.items.map(j=>j.job_id);
 rows.innerHTML=data.items.map(j=>renderJobRow(j).replace('<tr>','<tr class="job-row" data-id="'+escapeHtml(j.job_id)+'">')).join('')||'<tr><td colspan="8" class="empty">没有符合条件的岗位。</td></tr>';
 rows.querySelectorAll('.detail').forEach(b=>{b.textContent='展开 ▾';b.setAttribute('aria-expanded','false');});
 const s=data.summary;for(const [id,n] of Object.entries({'total':s.total,'n-worth':s.worth,'n-pending':s.pending,'n-missing':s.need_detail,'n-pass':s.pass,'n-contacted':s.communicated}))document.getElementById(id).textContent=String(n);
 document.querySelector('#summary').textContent='当前 '+data.total+' 条 · 可联系 '+s.eligible+' 条';
 const pages=Math.ceil(total/limit);document.querySelector('#page').textContent=(total?offset+1:0)+'–'+Math.min(offset+limit,total)+' / '+total+' · 第 '+(pages?Math.floor(offset/limit)+1:0)+' / '+pages+' 页';
 document.querySelector('#previous').disabled=offset===0;document.querySelector('#next').disabled=offset+limit>=total;
 document.querySelector('#jump-page').max=String(Math.max(1,pages));
 document.querySelector('#locations').replaceChildren(...data.locations.map(city=>{const option=document.createElement('option');option.value=city;return option;}));
 document.querySelector('#candidate-note').hidden=!candidates;document.querySelector('#candidates').setAttribute('aria-pressed',String(candidates));
 const banner=document.querySelector('#demo-banner');banner.hidden=!data.demo;banner.textContent=data.demo?'演示数据 · 判断和沟通均为模拟':'';
 const selected=ids.includes(expandedId)?expandedId:ids[0];++detailRequest;expandedId=null;if(selected)void expand(selected);
 }catch(e){if(seq===request)error.textContent=e.message;}
}
const refresh=()=>{offset=0;notice.textContent='';load();};
form.addEventListener('submit',e=>{e.preventDefault();candidates=false;refresh();});
form.addEventListener('reset',()=>{candidates=false;offset=0;setTimeout(load,0);});
document.querySelector('#candidates').addEventListener('click',()=>{form.reset();form.elements.status.value='WORTH';form.elements.communicated.value='false';candidates=true;refresh();});
document.addEventListener('click',event=>{if(event.target.closest('#all-jobs')){form.reset();candidates=false;refresh();}});
document.querySelectorAll('[data-quick]').forEach(b=>b.addEventListener('click',()=>{form.reset();candidates=false;if(b.dataset.quick==='contacted')form.elements.communicated.value='true';else form.elements.status.value=b.dataset.quick;refresh();}));
pageSize.addEventListener('change',refresh);
document.querySelector('#previous').addEventListener('click',()=>{offset=Math.max(0,offset-Number(pageSize.value));load();});
document.querySelector('#next').addEventListener('click',()=>{if(offset+Number(pageSize.value)<total){offset+=Number(pageSize.value);load();}});
document.querySelector('#go-page').addEventListener('click',()=>{const value=Number(document.querySelector('#jump-page').value),pages=Math.ceil(total/Number(pageSize.value));if(!Number.isInteger(value)||value<1||value>pages){notice.textContent='页码超出范围';return;}offset=(value-1)*Number(pageSize.value);load();});
rows.addEventListener('click',event=>{if(event.target.closest('.expanded-row'))return;const row=event.target.closest('tr.job-row');if(row)void expand(row.dataset.id);});
rows.addEventListener('submit',async event=>{
 if(event.target.id!=='decision-form')return;event.preventDefault();const editor=event.target,button=editor.querySelector('button[type=submit]'),message=editor.querySelector('#save-message');
 button.disabled=true;message.textContent='正在保存…';
 try{const updated=await api('/api/jobs/'+encodeURIComponent(editor.dataset.id)+'/decision',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:editor.elements.status.value,reason:editor.elements.reason.value,expectedRevision:Number(editor.dataset.revision)})});expandedId=updated.job_id;await load();notice.textContent='判断已保存';}
 catch(e){message.textContent=e.message;}finally{button.disabled=false;}
});
load();
