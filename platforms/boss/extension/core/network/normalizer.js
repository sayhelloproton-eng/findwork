/* Shared, allowlisted evidence boundary. No raw URL/body/text/header persistence. */
var BossCaptureCore = (() => {
  'use strict';
  const VERSION = '1.1.18';
  const target = raw => { try { const u = new URL(raw); return u.origin === 'https://www.zhipin.com' && u.pathname === '/web/geek/jobs'; } catch { return false; } };
  const num = v => Number.isFinite(v) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, v)) : null;
  const key = v => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_.-]{0,47}$/.test(v) ? v : 'redacted';
  const array = v => Array.isArray(v) ? v : [];
  const keys = v => v && typeof v === 'object' ? Object.keys(v).slice(0,30).map(key) : [];
  const id = v => /^(?!1[3-9]\d{9}$)[a-zA-Z0-9_-]{1,120}$/.test(String(v ?? '')) ? String(v) : null;
  const ids = v => [...new Set((Array.isArray(v) ? v : []).slice(0,300).map(id).filter(Boolean))];
  function parameters(value) {
    let entries = [];
    if (typeof value === 'string' && value.length < 16000) {
      try { entries = value.trim().startsWith('{') ? Object.entries(JSON.parse(value)) : [...new URLSearchParams(value)]; } catch {}
    } else if (value instanceof URLSearchParams) entries = [...value];
    else if (value && Object.getPrototypeOf(value) === Object.prototype) entries = Object.entries(value);
    const paging = {}, structure = [];
    for (const [k,v] of entries.slice(0,40)) {
      structure.push({key:key(k), type:typeof v});
      if (/^(page|pageNo|pageNum|pageSize|limit|offset|start|size)$/i.test(k) && /^\d{1,6}$/.test(String(v))) paging[k] = Number(v);
    }
    return {structure,paging};
  }
  function urlInfo(raw) {
    try {
      const u = new URL(String(raw), 'https://www.zhipin.com');
      if (u.origin !== 'https://www.zhipin.com') return null;
      return {path:u.pathname.split('/').map((s,i,parts) => /token|auth|session|credential|cookie/i.test(parts[i-1]||'') || /\d/.test(s) || !/^[a-zA-Z_.-]{0,32}$/.test(s) ? '[redacted]' : s).join('/').slice(0,200), ...parameters(u.searchParams)};
    } catch { return null; }
  }
  function shape(data) {
    const lists = [], paging = {}, seen = new Set(); let visits = 0;
    function walk(v, path, depth) {
      if (!v || typeof v !== 'object' || depth > 5 || visits++ > 250 || seen.has(v)) return;
      seen.add(v);
      if (Array.isArray(v)) {
        const jobIds = ids(v.slice(0,300).map(x => x?.encryptJobId ?? x?.jobId ?? x?.job_id));
        if (jobIds.length) lists.push({path, count:v.length, jobIds, itemKeys:keys(v[0])});
        for (const item of v.slice(0,3)) walk(item, path+'[]', depth+1);
      } else for (const [k,x] of Object.entries(v).slice(0,40)) {
        const p = path+'.'+key(k);
        if (/^(hasMore|hasNext|nextPage|page|pageNo|pageNum|pageSize|total|totalCount)$/i.test(k) && (typeof x === 'boolean' || /^\d{1,7}$/.test(String(x)))) paging[p] = x;
        walk(x,p,depth+1);
      }
    }
    walk(data,'$',0);
    return {apiCode:/^-?\d{1,8}$/.test(String(data?.code)) ? String(data.code) : null,
      responseKeys:keys(data), dataKeys:keys(data?.zpData ?? data?.data), lists, paging};
  }
  function network(raw) {
    if (!['request','response','failure'].includes(raw?.kind)) return null;
    const info = urlInfo(raw.url ?? raw.path); if (info && !raw.url) { info.structure=array(raw.query?.structure).slice(0,40).map(x=>({key:key(x.key),type:['string','number','boolean','object'].includes(x.type)?x.type:'unknown'})); info.paging=cleanPaging(raw.query?.paging); } if (!info || !id(raw.docId) || !Number.isInteger(raw.requestId)) return null;
    const out = {kind:raw.kind, ms:num(raw.ms) ?? Date.now(), docId:id(raw.docId), requestId:raw.requestId,
      path:info.path, method:/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(raw.method) ? raw.method : 'OTHER',
      query:info, body:{structure:array(raw.body?.structure).slice(0,40).map(x=>({key:key(x.key),type:['string','number','boolean','object'].includes(x.type)?x.type:'unknown'})), paging:cleanPaging(raw.body?.paging)},
      httpStatus:num(raw.httpStatus), apiCode:/^-?\d{1,8}$/.test(String(raw.apiCode)) ? String(raw.apiCode) : null,
      responseKeys:array(raw.responseKeys).slice(0,30).map(key), dataKeys:array(raw.dataKeys).slice(0,30).map(key),
      lists:array(raw.lists).slice(0,12).map(x=>({path:typeof x.path==='string' && /^[$\w.\[\]-]{1,200}$/.test(x.path)?x.path:'redacted',count:num(x.count),jobIds:ids(x.jobIds),itemKeys:array(x.itemKeys).slice(0,30).map(key)})),
      paging:cleanPaging(raw.paging), durationMs:num(raw.durationMs),
      inspection:['json','non-json','too-large','unreadable','network-error'].includes(raw.inspection)?raw.inspection:null,
      responseBody:raw.kind==='response'&&raw.inspection==='json'&&raw.responseBody!==null&&typeof raw.responseBody==='object'?raw.responseBody:null};
    return out;
  }
  function cleanPaging(v) { return Object.fromEntries(Object.entries(v||{}).slice(0,30).filter(([k,x])=>/^(?:\$\.)?(?:[\w.-]+\.)?(?:hasMore|hasNext|nextPage|page|pageNo|pageNum|pageSize|limit|offset|start|size|total|totalCount)$/i.test(k) && (typeof x==='boolean'||/^\d{1,7}$/.test(String(x))))); }
  return {VERSION,target,parameters,shape,network};
})();
