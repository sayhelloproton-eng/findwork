import test from 'node:test';
import assert from 'node:assert/strict';
import {todayInShanghai,collectionDateRange} from '../web/collection-date-filter.mjs';

const shanghaiMidnight=new Date('2026-10-23T17:25:00Z'); // 2026-10-24 01:25 Asia/Shanghai
test('last one calendar day is the default, based on Shanghai local date',()=>{
 assert.equal(todayInShanghai(shanghaiMidnight),'2026-10-24');
 assert.deepEqual(collectionDateRange(undefined,undefined,shanghaiMidnight),{collectedFrom:'2026-10-24',collectedTo:'2026-10-24'});
 assert.deepEqual(collectionDateRange('last1',['2026-01-01','2026-01-02'],shanghaiMidnight),{collectedFrom:'2026-10-24',collectedTo:'2026-10-24'});
});
test('one, three, seven calendar-day presets are inclusive and ignore saved custom range',()=>{
 const expected={
  last1:{collectedFrom:'2026-10-24',collectedTo:'2026-10-24'},
  last3:{collectedFrom:'2026-10-22',collectedTo:'2026-10-24'},
  last7:{collectedFrom:'2026-10-18',collectedTo:'2026-10-24'}
 };
 for(const [mode,range] of Object.entries(expected))
  assert.deepEqual(collectionDateRange(mode,['2026-06-01','2026-06-10'],shanghaiMidnight),range);
});
test('inclusive seven days cross month and year without shifting timezone',()=>{
 const yearBoundary=new Date('2027-01-01T00:25:00+08:00');
 assert.deepEqual(collectionDateRange('last7',null,yearBoundary),{collectedFrom:'2026-12-26',collectedTo:'2027-01-01'});
 const beforeMidnight=new Date('2026-10-23T15:59:59Z');
 assert.equal(todayInShanghai(beforeMidnight),'2026-10-23');
});
test('custom dates accept an inclusive interval including one day and leap day',()=>{
 for(const dates of [['2026-10-11','2026-10-24'],['2026-10-24','2026-10-24'],['2024-02-29','2024-03-01']]){
  assert.deepEqual(collectionDateRange('custom',dates,shanghaiMidnight),{collectedFrom:dates[0],collectedTo:dates[1]});
 }
});
test('custom date range refuses incomplete, invalid, inverted, or unknown mode',()=>{
 for(const invalid of [null,[],['2026-10-24'],['2026-10-24',null],['2026-10-25','2026-10-24'],['2026-02-30','2026-03-01'],['bad','2026-10-24']])
  assert.throws(()=>collectionDateRange('custom',invalid,shanghaiMidnight),/INVALID_COLLECTION_DATE_RANGE/);
 assert.throws(()=>collectionDateRange('day',['2026-10-24','2026-10-24'],shanghaiMidnight),/INVALID_DATE_MODE/);
});
