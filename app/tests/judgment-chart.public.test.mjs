import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJudgmentPieOptions} from '../web/judgment-pie-options.mjs';

test('ECharts judgment chart uses true counts and horizontal bottom legend',()=>{
 const options=makeJudgmentPieOptions([
  {label:'值得投',value:28},{label:'待评估',value:540},{label:'PASS',value:13}
 ]);
 assert.equal(options.series[0].type,'pie');
 assert.equal(options.series[0].center[1],'40%');
 assert.deepEqual(options.series[0].data.map(d=>d.value),[28,540,13]);
 assert.equal(options.series[0].data.reduce((sum,d)=>sum+d.value,0),581);
 assert.equal(options.legend.orient,'horizontal');
 assert.equal(options.legend.left,'center');
 assert.equal(options.legend.bottom,7);
 assert.equal(options.legend.selectedMode,false);
 assert.equal(options.legend.formatter('值得投'),'值得投 28 (5%)');
 assert.equal(options.legend.formatter('待评估'),'待评估 540 (93%)');
 assert.equal(options.legend.formatter('PASS'),'PASS 13 (2%)');
 assert.match(options.tooltip.formatter({name:'待评估',value:540,percent:93}),/540 条/);
});
test('zero-count status stays explicit instead of creating a fourth category',()=>{
 const o=makeJudgmentPieOptions([
  {label:'值得投',value:0},{label:'待评估',value:5},{label:'PASS',value:0}
 ]);
 assert.deepEqual(o.series[0].data.map(x=>x.name),['值得投','待评估','PASS']);
 assert.equal(o.legend.formatter('PASS'),'PASS 0 (0%)');
});

import {makeDailyAppearanceOptions,makeDailyCollectedAndGreetOptions} from '../web/dashboard-options.mjs';
test('daily difference line preserves null when no previous baseline, while valid zero is zero',()=>{
 const dates=[{date:'2026-10-22',label:'10/22',newComparedYesterday:null,coverage:'historical-partial'},
  {date:'2026-10-23',label:'10/23',newComparedYesterday:3,coverage:'observed'},
  {date:'2026-10-24',label:'10/24',newComparedYesterday:0,coverage:'observed'}];
 const o=makeDailyAppearanceOptions(dates);
 assert.deepEqual(o.series.map(s=>s.type),['line']);
 assert.deepEqual(o.series[0].data,[null,3,0]);
 assert.equal(o.series[0].connectNulls,false);
});
test('daily collected and greet bars are grouped, never stacked, and missing collection stays null',()=>{
 const dates=[{date:'2026-10-22',label:'10/22',collected:30,communicated:8,coverage:'historical-partial'},
  {date:'2026-10-23',label:'10/23',collected:null,communicated:0,coverage:'missing'}];
 const o=makeDailyCollectedAndGreetOptions(dates);
 assert.deepEqual(o.series.map(s=>s.type),['bar','bar']);
 assert.ok(o.series.every(s=>!Object.hasOwn(s,'stack')));
 assert.deepEqual(o.series.map(s=>s.data),[[30,null],[8,0]]);
 assert.match(o.tooltip.formatter([{dataIndex:0}]),/历史归档不完整/);
 assert.match(o.tooltip.formatter([{dataIndex:1}]),/无采集记录/);
});
test('education pie legend remains unchanged',()=>{
 const o=makeJudgmentPieOptions([{label:'不限',value:23},{label:'大专',value:56},{label:'本科',value:386},{label:'其他/未提供',value:11}],'岗位学历分布');
 assert.equal(o.legend.orient,'horizontal');
 assert.equal(o.legend.itemGap,5);
 assert.equal(o.legend.formatter('其他/未提供'),'其他 11 (2%)');
 assert.equal(o.series[0].data[3].name,'其他/未提供');
});
