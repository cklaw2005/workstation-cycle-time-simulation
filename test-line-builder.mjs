import assert from 'node:assert/strict';
import {
  addStation,
  createSampleLine,
  deleteScenario,
  moveStation,
  parseSavedScenarios,
  removeStation,
  saveScenario,
  serializeSavedScenarios,
  updateStation,
} from './line-builder-state.mjs';

const starter = createSampleLine();
assert.deepEqual(starter.map(station => station.cycleSeconds), [40, 60, 45]);
assert.deepEqual(starter.map(station => station.name), ['Station 1', 'Station 2', 'Station 3']);

const added = addStation(starter, 'fourth');
assert.equal(added.length, 4);
assert.equal(added[3].cycleSeconds, 60);
assert.equal(starter.length, 3, 'adding does not mutate the previous state');
assert.throws(() => addStation(Array.from({length:12},(_,i)=>({id:String(i),name:`S${i}`,cycleSeconds:1})), 'overflow'));
assert.throws(() => addStation(starter, 'station-1'), /unique/i);

assert.throws(() => removeStation([{id:'only',name:'Only',cycleSeconds:1}], 'only'), /at least one/i);
assert.equal(removeStation(added, 'fourth').length, 3);
assert.throws(() => removeStation(starter, 'missing'), /not found/i);

const moved = moveStation(starter, 'station-3', -1);
assert.deepEqual(moved.map(station=>station.id), ['station-1','station-3','station-2']);
assert.deepEqual(moveStation(starter, 'station-1', -1).map(station=>station.id), ['station-1','station-2','station-3']);
assert.throws(() => moveStation(starter, 'station-1', 2));

const edited = updateStation(starter, 'station-2', {name:'Inspection',cycleSeconds:'72.5'});
assert.deepEqual(edited[1], {id:'station-2',name:'Inspection',cycleSeconds:'72.5'});
assert.equal(starter[1].name, 'Station 2', 'editing does not mutate the previous state');
assert.throws(() => updateStation(starter, 'station-1', {unexpected:'no'}));

let saved = saveScenario([], {id:'case-1',name:'Trial',stations:starter});
saved = saveScenario(saved, {id:'case-1',name:'Trial v2',stations:edited});
assert.equal(saved.length, 1, 'saving an existing id updates instead of duplicating it');
assert.equal(saved[0].name, 'Trial v2');
assert.equal(saved[0].stations[1].cycleSeconds, 72.5, 'saved cycle times are numeric');
assert.equal(parseSavedScenarios(serializeSavedScenarios(saved)).rejectedCount, 0);
assert.equal(parseSavedScenarios(serializeSavedScenarios(saved)).scenarios.length, 1);
assert.equal(deleteScenario(saved, 'case-1').length, 0);

const mixed = parseSavedScenarios(JSON.stringify({version:1,scenarios:[
  saved[0],
  {id:'bad',name:'Bad',stations:[{id:'x',name:'X',cycleSeconds:0}]},
]}));
assert.equal(mixed.scenarios.length, 1);
assert.equal(mixed.rejectedCount, 1, 'invalid records are skipped and surfaced for a warning');
assert.equal(parseSavedScenarios('{broken').rejectedCount, 1);
assert.equal(parseSavedScenarios(JSON.stringify({version:9,scenarios:saved})).scenarios.length, 0);

console.log('PASS: line editing, limits, scenario persistence normalization, and invalid saved-record handling.');
