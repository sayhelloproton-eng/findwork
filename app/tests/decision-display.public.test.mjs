import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {describeDecision} from '../web/decision-display.mjs';
test('PENDING without a decision is unassessed even if JD digest exists',()=>{
 const out=describeDecision({screening_status:'PENDING',decision_source:null,screening_reason:null,has_detail:true,ai_summary_status:'READY'});
 assert.equal(out.kind,'unassessed');assert.equal(out.text,'尚未进行岗位评估');
});
test('source-backed inconclusive PENDING is still PENDING, but shows assessed uncertainty',()=>{
 const out=describeDecision({screening_status:'PENDING',decision_source:'SKILL',screening_reason:'核心资历证据不足，需要核实'});
 assert.equal(out.kind,'uncertain');assert.match(out.text,/^已评估，仍有疑问：/);
 assert.match(out.tooltip,/需要核实/);
});
test('legacy source with missing reason cannot be presented as completed',()=>{
 const out=describeDecision({screening_status:'PENDING',decision_source:'SKILL',screening_reason:null});
 assert.equal(out.kind,'incomplete-record');assert.match(out.text,/缺少理由/);
});
test('missing JD stays in existing PENDING family',()=>{
 const out=describeDecision({screening_status:'NEED_DETAIL',decision_source:null,screening_reason:null,has_detail:false});
 assert.equal(out.kind,'unassessed');assert.match(out.text,/待补详情/);
});
test('WORTH and PASS preserve original reasons',()=>{
 for(const status of ['WORTH','PASS'])assert.equal(describeDecision({screening_status:status,screening_reason:'充分匹配事实'}).text,'充分匹配事实');
});
test('four dashboard cards are compact 230px and chart surface is 170px',()=>{
 const css=readFileSync(new URL('../web/styles.css',import.meta.url),'utf8');
 assert.match(css,/\.dashboard-panel\{[^}]*height:230px/);
 assert.match(css,/\.dashboard-echart-wrap\{[^}]*height:170px/);
});
