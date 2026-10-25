import test from 'node:test';
import assert from 'node:assert/strict';
import {bossRecruitmentBadges} from '../web/boss-recruitment-badges.mjs';

const icon=filename=>'https://img.bosszhipin.com/static/file/2022/'+filename;
test('BOSS native images distinguish hunter, dispatch, delegated recruitment, and urgent hiring',()=>{
 const cases=[
  ['hunter','cy4fi6cada1655206055291.png'],
  ['dispatch','6zb0e7e8qm1655206107975.png'],
  ['delegated','pvmr2v0l8i1655206532429.png'],
  ['urgent','4or9x2qcfv1699943576247.png']
 ];
 for(const [kind,filename] of cases){
  const actual=bossRecruitmentBadges({beforeNameIcons:[icon(filename)]});
  for(const key of ['hunter','dispatch','delegated','urgent','proxyUnverified']){
   assert.equal(actual[key],key===kind,kind+': '+key);
  }
 }
});
test('goldHunter and native urgency text remain valid independent signals',()=>{
 assert.equal(bossRecruitmentBadges({goldHunter:1}).hunter,true);
 assert.equal(bossRecruitmentBadges({iconWord:'急聘'}).urgent,true);
 assert.equal(bossRecruitmentBadges({beforeNameIcons:[icon('4or9x2qcfv1699943576247.png'),icon('6zb0e7e8qm1655206107975.png')]}).dispatch,true);
 assert.equal(bossRecruitmentBadges({beforeNameIcons:[icon('4or9x2qcfv1699943576247.png'),icon('6zb0e7e8qm1655206107975.png')]}).urgent,true);
});
test('proxyType must not be mistaken for a confirmed native delegated or dispatch badge',()=>{
 for(const proxyType of [1,3,4]){
  const state=bossRecruitmentBadges({proxyJob:1,proxyType,beforeNameIcons:[]});
  assert.equal(state.proxyUnverified,true);
  assert.equal(state.delegated,false);
  assert.equal(state.dispatch,false);
  assert.equal(state.hunter,false);
 }
 const realNativeDelegated=bossRecruitmentBadges({proxyJob:1,proxyType:1,beforeNameIcons:[icon('pvmr2v0l8i1655206532429.png')]});
 assert.equal(realNativeDelegated.delegated,true);
 assert.equal(realNativeDelegated.hunter,false);
 assert.equal(realNativeDelegated.proxyUnverified,false);
});
test('empty or non-URL image values do not invent tags',()=>{
 assert.deepEqual(bossRecruitmentBadges({}),{hunter:false,dispatch:false,delegated:false,urgent:false,proxyUnverified:false});
 assert.deepEqual(bossRecruitmentBadges({beforeNameIcons:[null,{},42],proxyJob:0}),{hunter:false,dispatch:false,delegated:false,urgent:false,proxyUnverified:false});
});
