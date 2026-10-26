import assert from 'node:assert/strict';
import { calculateTaktPlan, balanceWorkAcrossOperators } from './takt-model.mjs';

const sixOperators = Array.from({length: 6}, (_, index) => ({name:`Operator ${index + 1}`, cycleSeconds:120}));
const threeOperators = Array.from({length: 3}, (_, index) => ({name:`Operator ${index + 1}`, cycleSeconds:240}));

const normalDemand = calculateTaktPlan({availableTimeSeconds:450*60, customerDemand:110, stations:threeOperators});
assert.equal(normalDemand.workContentSeconds,720);
assert.ok(Math.abs(normalDemand.taktSeconds - 27000/110) < 1e-9);
assert.equal(normalDemand.minimumOperators,3);
assert.equal(normalDemand.meetsDemand,true);
assert.equal(normalDemand.modeledShiftOutput,110);
assert.equal(calculateTaktPlan({availableTimeSeconds:27000,customerDemand:110,stations:sixOperators}).minimumOperators,3);
assert.equal(sixOperators.reduce((s,x)=>s+x.cycleSeconds,0),threeOperators.reduce((s,x)=>s+x.cycleSeconds,0));

const higherDemand = calculateTaktPlan({availableTimeSeconds:27000, customerDemand:140, stations:threeOperators});
assert.equal(higherDemand.minimumOperators,4);
assert.equal(higherDemand.meetsDemand,false);
assert.ok(higherDemand.bottleneckSeconds > higherDemand.taktSeconds);

const boundary = calculateTaktPlan({availableTimeSeconds:720, customerDemand:1, stations:[{name:'One',cycleSeconds:720}]});
assert.equal(boundary.meetsDemand,true);
assert.equal(calculateTaktPlan({availableTimeSeconds:719,customerDemand:1,stations:[{name:'One',cycleSeconds:720}]}).meetsDemand,false);

const balanced = balanceWorkAcrossOperators(720,4);
assert.equal(balanced.length,4);
assert.ok(balanced.every(item=>item.cycleSeconds===180));
assert.equal(balanced.reduce((s,x)=>s+x.cycleSeconds,0),720);
assert.throws(()=>calculateTaktPlan({availableTimeSeconds:0,customerDemand:1,stations:sixOperators}),RangeError);
assert.throws(()=>calculateTaktPlan({availableTimeSeconds:1,customerDemand:0,stations:sixOperators}),RangeError);
assert.throws(()=>calculateTaktPlan({availableTimeSeconds:27000,customerDemand:1.5,stations:sixOperators}),RangeError);
assert.throws(()=>balanceWorkAcrossOperators(720,13),RangeError);

console.log('PASS: takt, bottleneck status, staffing estimate, example conservation, and validation.');
