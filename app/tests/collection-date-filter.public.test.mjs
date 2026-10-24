import test from 'node:test';
import assert from 'node:assert/strict';
import {todayInShanghai,collectionDateRange} from '../web/collection-date-filter.mjs';
const date=new Date('2026-10-23T17:25:00Z');
test('default date is Shanghai local today and picked date is exact calendar day',()=>{
 assert.equal(todayInShanghai(date),'2026-10-24');
 assert.deepEqual(collectionDateRange('day','2026-10-21',date),{collectedFrom:'2026-10-21',collectedTo:'2026-10-21'});
});
test('last one and three calendar days use current Shanghai date',()=>{
 assert.deepEqual(collectionDateRange('last1','2026-10-21',date),{collectedFrom:'2026-10-24',collectedTo:'2026-10-24'});
 assert.deepEqual(collectionDateRange('last3','2026-10-21',date),{collectedFrom:'2026-10-22',collectedTo:'2026-10-24'});
 assert.throws(()=>collectionDateRange('none','2026-10-21',date),/INVALID_DATE_MODE/);
});
