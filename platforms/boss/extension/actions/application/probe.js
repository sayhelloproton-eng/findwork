(()=>{
 'use strict';
 const KEY='boss-direct-apply-probe-v1';
 const state=document.getElementById('state'),results=document.getElementById('results');
 const render=async()=>{
  const value=(await chrome.storage.local.get(KEY))[KEY]||{};
  state.textContent=value.until>Date.now()?'观察已开启（仅记录请求元数据）':'未开启 / 已到期';
  const records=Array.isArray(value.records)?value.records:[];
  results.textContent=records.length?records.map(x=>
   new Date(x.observedAt).toLocaleString()+'  '+x.method+' '+x.path+'  HTTP '+x.httpStatus).join('\n'):'无记录';
 };
 document.getElementById('start').addEventListener('click',async()=>{
  await chrome.storage.local.set({[KEY]:{until:Date.now()+3*60*1000,records:[]}});await render();
 });
 document.getElementById('clear').addEventListener('click',async()=>{
  await chrome.storage.local.remove(KEY);await render();
 });
 chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[KEY])void render();});
 void render();
})();
