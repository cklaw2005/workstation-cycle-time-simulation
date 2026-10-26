import { summarizeLine } from './line-model.mjs';

// FIFO stations with unlimited waiting buffers; handover is included in each station's CT.
export function getUnitSchedule(stations, unitIndex) {
  if (!Number.isInteger(unitIndex) || unitIndex < 0) throw new RangeError('Unit index must be a non-negative integer.');
  summarizeLine(stations);
  let cumulativeSeconds = 0;
  let cumulativeBottleneck = 0;
  return stations.map((station, index) => {
    const cycleSeconds = Number(station.cycleSeconds);
    cumulativeSeconds += cycleSeconds;
    cumulativeBottleneck = Math.max(cumulativeBottleneck, cycleSeconds);
    const finishSeconds = cumulativeSeconds + unitIndex * cumulativeBottleneck;
    return {
      stationIndex: index,
      unitIndex,
      startSeconds: finishSeconds - cycleSeconds,
      finishSeconds,
      cycleSeconds,
    };
  });
}
