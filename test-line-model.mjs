import assert from 'node:assert/strict';
import {outputCountAt, summarizeLine} from './line-model.mjs';

const example = [
  {id: 'a', name: 'Station 1', cycleSeconds: 40},
  {id: 'b', name: 'Station 2', cycleSeconds: 60},
  {id: 'c', name: 'Station 3', cycleSeconds: 45},
];

const summary = summarizeLine(example);
assert.equal(summary.stationCount, 3);
assert.equal(summary.totalWorkSeconds, 145);
assert.equal(summary.bottleneckSeconds, 60);
assert.deepEqual(summary.bottleneckStations, ['Station 2']);
assert.equal(summary.unitsPerHour, 60);
assert.equal(summary.balanceEfficiency, 145 / 180);

assert.equal(outputCountAt(144.999, example), 0, 'no unit before empty-start lead time');
assert.equal(outputCountAt(145, example), 1, 'one unit at first completion');
assert.equal(outputCountAt(204.999, example), 1, 'next unit waits for the bottleneck interval');
assert.equal(outputCountAt(205, example), 2, 'one more unit at first completion plus bottleneck');

const tied = summarizeLine([
  {id: 'a', name: 'A', cycleSeconds: 60},
  {id: 'b', name: 'B', cycleSeconds: 60},
]);
assert.deepEqual(tied.bottleneckStations, ['A', 'B']);
assert.equal(tied.unitsPerHour, 60);

for (const invalid of [[], [{id:'a',name:'A',cycleSeconds:0}], [{id:'a',name:'A',cycleSeconds:-1}], [{id:'a',name:'A',cycleSeconds:NaN}], Array.from({length:13},(_,i)=>({id:String(i),name:`S${i}`,cycleSeconds:1}))]) {
  assert.throws(() => summarizeLine(invalid));
}

assert.equal(outputCountAt(-1, example), 0);
assert.deepEqual(example.map(station=>station.cycleSeconds), [40, 60, 45], 'calculation does not mutate the input');

console.log('PASS: line validation, bottleneck, throughput, balance, target count boundaries, and immutability.');
