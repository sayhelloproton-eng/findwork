import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const R=path.resolve(import.meta.dirname,'..');
const read=x=>fs.readFileSync(path.join(R,x),'utf8');
test('passive Detail capture retains original body and does not POST',()=>{
 const s=read('actions/detail/dom-native-store.js');
 assert.match(s,/rawResponse:m.responseBody/);
 assert.match(s,/status:'COMPLETE'/);
 assert.match(s,/DOWNLOAD_FILE_NOT_CONFIRMED/);
 assert.doesNotMatch(s,/fetch\s*\(/);
 assert.match(read('core/capture/page-observer.js'),/BOSS_RAW_DETAIL_RESPONSE/);
});
test('DOM checks encrypted job ID, waits one-second render polls and download COMPLETE',()=>{
 const s=read('actions/detail/dom.js');
 assert.match(s,/pathname==='\/job_detail\/'\+jobId/);
 assert.match(s,/hit\[0\]\.click\(\)/);
 assert.match(s,/async function waitForCard\(jobId\)/);
 assert.match(s,/i<=2/);
 assert.match(s,/await pause\(1000\)/);
 assert.match(s,/CARD_MATCH_COUNT_0/);
 assert.match(s,/BOSS_NATIVE_DETAIL_LOOKUP/);
 assert.match(s,/download:'COMPLETE'/);
 assert.match(s,/downloaded\.status!=='COMPLETE'/);
 assert.match(s,/downloaded\.downloadPath/);
 assert.doesNotMatch(s,/fetch\s*\(/);
 assert.doesNotMatch(s,/DB_ACK|DB_CONFIRMED/);
});
test('extension actions autonomously chain Refresh, first natural Detail, remaining cards, then Scroll',()=>{
 const s=read('actions/detail/dom.js');
 assert.match(s,/params\.get\('auto'\)==='1'/);
 assert.match(s,/chrome\.tabs\.create\(/);
 assert.match(s,/actions\/refresh\/refresh\.html\?expect=/);
 assert.match(s,/actions\/scroll\/scroll\.html/);
 assert.match(s,/gate\.selectedKey/);
 assert.match(s,/gate\.runId!==before\?\.runId/);
 assert.match(s,/row\?\.status==='COMPLETE'/);
 assert.match(s,/chrome\.storage\.onChanged\.addListener\(changed\)/);
 assert.match(s,/firstNatural&&index===0/);
 assert.match(s,/batch\.completed\.length!==batch\.requested/);
 assert.match(s,/session\.failed/);
 assert.doesNotMatch(s,/BOSS_SCROLL_EVENT/);
 assert.match(read('actions/refresh/refresh.js'),/REFRESH_SUCCESS/);
 assert.match(read('actions/scroll/scroll.js'),/SCROLL_WINDOW_END/);
});
test('resume existing failed page without Refresh or repeating completed pages',()=>{
 const s=read('actions/detail/dom.js');
 const capture=read('core/capture/auto-download.js');
 assert.match(s,/params\.get\('resume'\)==='1'/);
 assert.match(s,/failedAfterList/);
 assert.match(s,/failedFirstDetail/);
 assert.match(s,/previous\.failed\.page===pastBatches\.length/);
 assert.match(s,/last\?\.completed\?\.length===0/);
 assert.match(s,/previous\?\.completed===\(failedFirstDetail\?/);
 assert.match(s,/x\.filename===resumeSource&&x\.status==='COMPLETE'/);
 assert.match(s,/const startPage=resume\?session\.batches\.length:0/);
 assert.match(s,/resume&&page===startPage\?/);
 assert.match(capture,/value\.records\.push\(\{key,filename,jobIds,status:'HELD'/);
});
test('reload recovery re-owns MAIN and reattaches ISOLATED without business actions',()=>{
 const s=read('actions/detail/dom.js');
 assert.match(s,/async function ensureObserverBridge\(\)/);
 assert.match(s,/type:'BOSS_OBSERVER_READ'/);
 assert.match(s,/BOSS_HOOK_RECOVER/);
 const owner=read('core/capture/hook-recovery.js');
 assert.match(owner,/world:'MAIN'/);
 assert.match(owner,/world:'ISOLATED'/);
 assert.match(owner,/BOSS_OBSERVER_PROBE_HOOK/);
 assert.doesNotMatch(owner,/fetch\s*\(/);
 assert.match(s,/ISOLATED_BRIDGE_REATTACH_UNVERIFIED/);
 assert.match(s,/if\(params\.get\('bridgeOnly'\)==='1'\)return/);
});
test('two-page run has an explicit 30-download limit, manual stop and terminal receipt',()=>{
 const s=read('actions/detail/dom.js');
 const page=read('actions/detail/dom.html');
 assert.match(s,/targetDownloads=auto\?maxPages\*15:null/);
 assert.match(s,/ids\.length!==15/);
 assert.match(s,/DUPLICATE_BETWEEN_PAGES/);
 assert.match(s,/session\.completed>=targetDownloads/);
 assert.match(s,/session\.batches\.length!==maxPages\|\|session\.completed!==targetDownloads/);
 assert.match(s,/stopButton\?\.addEventListener\('click'/);
 assert.match(s,/if\(stopRequested\)break/);
 assert.match(s,/session\.status=session\.failed\?'FAILED':stopRequested\?'STOPPED':'COMPLETED'/);
 assert.match(s,/boss-dom-detail-sequence-v1/);
 assert.match(page,/id="stop"/);
});
test('natural encrypted IDs including tilde are accepted by List, DOM and Detail capture',()=>{
 const id='aaaa~bbbbccccdddd2026';
 const rule=/^[a-zA-Z0-9_~-]{10,120}$/;
 assert.equal(rule.test(id),true);
 assert.equal(rule.test('aaaa/bbbbccccdddd2026'),false);
 assert.equal(rule.test('aaaa bbbbccccdddd2026'),false);
 for(const part of ['core/capture/auto-download.js',
  'actions/detail/dom-native-store.js','actions/detail/dom.js']){
  assert.match(read(part),/\[a-zA-Z0-9_~-\]/);
  assert.doesNotMatch(read(part),/\[a-zA-Z0-9_-\]/);
 }
});
test('legacy direct detail dispatcher is disabled, List generation untouched',()=>{
 assert.doesNotMatch(read('auto-entry.js'),/^BossDetailQueue\.install\(\);/m);
 assert.match(read('auto-entry.js'),/BossNaturalDetail\.install\(\);/);
 assert.match(read('core/capture/auto-download.js'),/boss-native-list-latest-v1/);
});

test('durable timeline covers refresh List, natural Detail, click, Scroll and failure',()=>{
 const refresh=read('actions/refresh/refresh.js'),dom=read('actions/detail/dom.js');
 const diag=read('actions/detail/diagnose.js');
 for(const event of ['INITIAL_GATE_OPEN','INITIAL_LIST_OBSERVED','EXPECT_ALREADY_SELECTED',
 'TARGET_LIST_OBSERVED','LIST_DOWNLOAD_COMPLETE'])assert.ok(refresh.includes(event),event);
 for(const event of ['ACTION_STARTED','LIST_DOWNLOAD_COMPLETE','DETAIL_LOOKUP',
 'DOM_CARD_CLICK','DETAIL_DOWNLOAD_COMPLETE','DETAIL_FAILED','SESSION_TERMINAL'])
  assert.ok(dom.includes(event),event);
 assert.match(diag,/captureTimeline/);
 assert.match(diag,/boss-refresh-stage-log-v1/);
 assert.match(diag,/boss-dom-stage-log-v1/);
 assert.doesNotMatch(refresh,/\bfetch\s*\(/);
});

test('explicit fresh run archives and isolates historical Detail receipts before Refresh',()=>{
 const s=read('actions/detail/dom.js');
 assert.match(s,/params\.get\('fresh'\)==='1'/);
 assert.match(s,/if\(fresh&&\(!auto\|\|resume\)\)/);
 assert.match(s,/PREVIOUS_COLLECTION_STILL_RUNNING/);
 assert.match(s,/PREVIOUS_DETAIL_DOWNLOAD_UNSETTLED/);
 assert.match(s,/boss-dom-fresh-last-v1/);
 assert.match(s,/previousRunId:previous\?\.runId/);
 assert.match(s,/'boss-natural-detail-v1':\{contract:'boss-natural-detail.v1',records:\{\}\}/);
 assert.match(s,/FRESH_DETAIL_STORE_READY/);
 assert.match(s,/FRESH_STORE_READBACK_FAILED/);
 assert.match(s,/NATIVE_DETAIL_SAME_RUN/);
 assert.match(s,/await persist\(\); \/\/ Run ID must exist before Refresh/);
 assert.match(s,/runId:fresh\?session.runId:null/);
 const owner=read('actions/detail/dom-native-store.js');
 assert.match(owner,/jobId:id,runId,status:'CAPTURED'/);
 assert.match(owner,/wrongRun\?'STALE_RUN'/);
 assert.ok(s.indexOf('FRESH_DETAIL_STORE_READY')<s.indexOf('async function runAction'));
 assert.doesNotMatch(s,/chrome\.downloads\.erase/);
});
