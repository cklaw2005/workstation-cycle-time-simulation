import { MAX_STATIONS, MIN_STATIONS } from './line-model.mjs';

const PATH = [
  {x: -4.4, z: 2.7, rotationY: Math.PI / 2},
  {x: -4.4, z: -2.7, rotationY: 0},
  {x: 4.4, z: -2.7, rotationY: -Math.PI / 2},
  {x: 4.4, z: 2.7, rotationY: -Math.PI / 2},
];

export function buildUStationLayout(count) {
  if (!Number.isInteger(count) || count < MIN_STATIONS || count > MAX_STATIONS) {
    throw new RangeError(`A U line must have between ${MIN_STATIONS} and ${MAX_STATIONS} workstations.`);
  }
  const segments = PATH.slice(1).map((point, index) => {
    const from = PATH[index];
    return {...point, from, length: Math.hypot(point.x - from.x, point.z - from.z)};
  });
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  return Array.from({length: count}, (_, index) => {
    const distance = count === 1 ? totalLength / 2 : totalLength * index / (count - 1);
    let walked = 0;
    let segment = segments.at(-1);
    for (const candidate of segments) {
      if (distance <= walked + candidate.length) { segment = candidate; break; }
      walked += candidate.length;
    }
    const ratio = Math.max(0, Math.min(1, (distance - walked) / segment.length));
    return {
      order: index + 1,
      x: segment.from.x + (segment.x - segment.from.x) * ratio,
      z: segment.from.z + (segment.z - segment.from.z) * ratio,
      rotationY: segment.rotationY,
    };
  });
}
