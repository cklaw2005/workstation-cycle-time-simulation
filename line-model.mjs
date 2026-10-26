export const MIN_STATIONS = 1;
export const MAX_STATIONS = 12;

export function summarizeLine(stations) {
  if (!Array.isArray(stations) || stations.length < MIN_STATIONS || stations.length > MAX_STATIONS) {
    throw new RangeError(`A line must have between ${MIN_STATIONS} and ${MAX_STATIONS} workstations.`);
  }

  const normalized = stations.map((station, index) => {
    if (!station || typeof station !== 'object') throw new TypeError(`Workstation ${index + 1} is invalid.`);
    const name = typeof station.name === 'string' ? station.name.trim() : '';
    const cycleSeconds = Number(station.cycleSeconds);
    if (!name) throw new TypeError(`Workstation ${index + 1} needs a name.`);
    if (!Number.isFinite(cycleSeconds) || cycleSeconds <= 0) {
      throw new RangeError(`Cycle time for ${name} must be a positive number of seconds per unit.`);
    }
    return {name, cycleSeconds};
  });

  const bottleneckSeconds = Math.max(...normalized.map(station => station.cycleSeconds));
  const totalWorkSeconds = normalized.reduce((sum, station) => sum + station.cycleSeconds, 0);
  return {
    stationCount: normalized.length,
    totalWorkSeconds,
    bottleneckSeconds,
    bottleneckStations: normalized.filter(station => station.cycleSeconds === bottleneckSeconds).map(station => station.name),
    unitsPerHour: 3600 / bottleneckSeconds,
    balanceEfficiency: totalWorkSeconds / (normalized.length * bottleneckSeconds),
  };
}

export function outputCountAt(secondsElapsed, stations) {
  const summary = summarizeLine(stations);
  if (!Number.isFinite(secondsElapsed)) throw new TypeError('Elapsed simulation time must be finite.');
  if (secondsElapsed < 0) return 0;

  const firstUnitSeconds = summary.totalWorkSeconds;
  if (secondsElapsed < firstUnitSeconds - 1e-9) return 0;
  return 1 + Math.floor((secondsElapsed - firstUnitSeconds + 1e-9) / summary.bottleneckSeconds);
}
