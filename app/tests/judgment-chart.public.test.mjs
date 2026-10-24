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

import {makeCumulativeOptions,makeDailyStackedOptions} from '../web/dashboard-options.mjs';
test('weekly ECharts lines show collected and communicated cumulative totals',()=>{
 const o=makeCumulativeOptions([{label:'10/19',receivedTotal:12,communicatedTotal:3}]);
 assert.deepEqual(o.series.map(s=>s.type),['line','line']);
 assert.deepEqual(o.series.map(s=>s.data),[[12],[3]]);
 assert.equal(o.legend.orient,'horizontal');
});
test('daily ECharts is a single stacked column for two events per day',()=>{
 const o=makeDailyStackedOptions([{label:'10/23',received:30,communicated:8}]);
 assert.deepEqual(o.series.map(s=>s.type),['bar','bar']);
 assert.equal(o.series[0].stack,o.series[1].stack);
 assert.deepEqual(o.series.map(s=>s.data),[[30],[8]]);
 assert.deepEqual(o.xAxis.data,['10/23']);
});

test('four education categories retain native names but compact the legend into one horizontal line',()=>{
 const o=makeJudgmentPieOptions([{label:'不限',value:23},{label:'大专',value:56},{label:'本科',value:386},{label:'其他/未提供',value:11}],'岗位学历分布');
 assert.equal(o.legend.orient,'horizontal');
 assert.equal(o.legend.itemGap,5);
 assert.equal(o.legend.formatter('其他/未提供'),'其他 11 (2%)');
 assert.equal(o.series[0].data[3].name,'其他/未提供');
 assert.ok(o.aria.description.includes('岗位学历分布'));
});
