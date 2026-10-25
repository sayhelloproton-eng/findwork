import test from 'node:test';
import assert from 'node:assert/strict';
import {advancedDegreeExclusion} from '../db/ingestion/education-exclusion.mjs';
test('actual Masters/PhD degrees and JD mandatory postgraduate threshold are excluded',()=>{
 for(const degree of ['硕士','博士','硕士及以上','研究生']){
  assert.equal(advancedDegreeExclusion(degree,undefined,'').excluded,true,degree);
 }
 assert.equal(advancedDegreeExclusion('本科','硕士','').excluded,true);
 assert.equal(advancedDegreeExclusion('本科','本科','任职要求：1. 硕士及以上学历，计算机相关专业').excluded,true);
 assert.equal(advancedDegreeExclusion('硕士',undefined,'').source,'STRUCTURED_DEGREE');
 assert.equal(advancedDegreeExclusion('本科',undefined,'要求硕士（含）以上').source,'EXPLICIT_JD_MANDATORY');
});
test('bachelors acceptable in alternatives / masters merely preferred stays eligible',()=>{
 for(const jd of ['任职要求：大学专科5年；或者大学本科4年；或者硕士研究生2年','任职要求：全日制本科或全日制研究生','任职要求：本科学历，硕士优先','任职要求：本科及以上学历（硕士优先）','学历背景：985本科/硕士']){
  assert.equal(advancedDegreeExclusion('本科','本科',jd).excluded,false,jd);
 }
 assert.equal(advancedDegreeExclusion('本科或硕士',null,'').excluded,false);
 assert.equal(advancedDegreeExclusion('学历不限',null,null).excluded,false);
});
