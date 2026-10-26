import test from 'node:test';import assert from 'node:assert/strict';import {describeCommunication} from '../web/communication-status.mjs';
test('unconfirmed and failed actions never present as fresh uncontacted jobs',()=>{
 assert.equal(describeCommunication({communication_state:'NONE'}).label,'未沟通');
 for(const [state,label] of [['FAILED','沟通失败'],['IN_FLIGHT','待结算'],['UNKNOWN','结果未知'],['SUCCEEDED','已沟通']])assert.equal(describeCommunication({communication_state:state,communicated:false}).label,label);
});
