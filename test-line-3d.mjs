import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { outputCountAt } from './dist/line-model.mjs';
import { buildUStationLayout } from './dist/u-layout.mjs';
import { getUnitSchedule } from './dist/line-schedule.mjs';

for (const count of [1, 8, 12]) {
  const layout = buildUStationLayout(count);
  assert.equal(layout.length, count);
  assert.deepEqual(layout.map(item => item.order), Array.from({length: count}, (_, index) => index + 1));
  assert.equal(new Set(layout.map(item => `${item.x.toFixed(5)},${item.z.toFixed(5)}`)).size, count);
  for (const point of layout) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z) && Number.isFinite(point.rotationY));
  }
}
assert.throws(() => buildUStationLayout(0), RangeError);
assert.throws(() => buildUStationLayout(13), RangeError);

const example = [40, 60, 45].map((cycleSeconds, index) => ({name: `S${index + 1}`, cycleSeconds}));
const first = getUnitSchedule(example, 0);
assert.deepEqual(first.map(job => [job.startSeconds, job.finishSeconds]), [[0, 40], [40, 100], [100, 145]]);
const second = getUnitSchedule(example, 1);
assert.deepEqual(second.map(job => [job.startSeconds, job.finishSeconds]), [[40, 80], [100, 160], [160, 205]]);
assert.deepEqual([145, 204.99, 205, 264.99, 265].map(t => outputCountAt(t, example)), [1, 1, 2, 2, 3]);
assert.throws(() => getUnitSchedule(example, -1), RangeError);
assert.throws(() => getUnitSchedule([], 0), RangeError);

const html = await readFile(new URL('./dist/line-3d.html', import.meta.url), 'utf8');
assert.match(html, /id="available-minutes"/);
assert.match(html, /id="customer-demand"/);
assert.match(html, /bottleneck cycle time must be less than or equal to takt time/i);
assert.match(html, /id="capacity-status"/);
assert.match(html, /TAKT TIME · customer pace/);
assert.match(html, /BOTTLENECK · line limiter/);
assert.match(html, /UPH · units per hour/);
assert.match(html, /30-second takt vs 35-second bottleneck/);
assert.match(html, /value="rate-check"/);
assert.match(html, /id="load-rate-example"/);
assert.match(html, /Before improvement · 6 operators/);
assert.match(html, /After improvement · 3 operators/);

console.log('PASS: U-layout generation, FIFO workstation schedule, and shared output boundaries.');
