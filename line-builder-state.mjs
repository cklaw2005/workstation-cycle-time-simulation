import { MAX_STATIONS, summarizeLine } from './line-model.mjs';

export function createSampleLine() {
  return [40, 60, 45].map((cycleSeconds, index) => ({
    id: `station-${index + 1}`,
    name: `Station ${index + 1}`,
    cycleSeconds,
  }));
}

function cloneStations(stations) {
  if (!Array.isArray(stations)) throw new TypeError('Workstations must be a list.');
  const ids = new Set();
  for (const station of stations) {
    if (!station || typeof station.id !== 'string' || !station.id.trim() || ids.has(station.id)) {
      throw new TypeError('Every workstation must have a unique id.');
    }
    ids.add(station.id);
  }
  return stations.map(station => ({ ...station }));
}

export function addStation(stations, id) {
  const next = cloneStations(stations);
  if (next.length >= MAX_STATIONS) throw new RangeError(`A line can have at most ${MAX_STATIONS} workstations.`);
  if (typeof id !== 'string' || !id.trim() || next.some(station => station.id === id)) {
    throw new TypeError('The new workstation id must be unique and non-empty.');
  }
  next.push({ id, name: `Station ${next.length + 1}`, cycleSeconds: 60 });
  return next;
}

export function removeStation(stations, id) {
  const next = cloneStations(stations);
  if (next.length <= 1) throw new RangeError('A line must have at least one workstation.');
  const index = next.findIndex(station => station.id === id);
  if (index < 0) throw new Error(`Workstation ${id} was not found.`);
  next.splice(index, 1);
  return next;
}

export function moveStation(stations, id, delta) {
  const next = cloneStations(stations);
  if (delta !== -1 && delta !== 1) throw new RangeError('Move direction must be -1 or 1.');
  const index = next.findIndex(station => station.id === id);
  if (index < 0) throw new Error(`Workstation ${id} was not found.`);
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function updateStation(stations, id, patch) {
  const next = cloneStations(stations);
  const index = next.findIndex(station => station.id === id);
  if (index < 0) throw new Error(`Workstation ${id} was not found.`);
  if (!patch || typeof patch !== 'object' || Object.keys(patch).some(key => !['name', 'cycleSeconds'].includes(key))) {
    throw new TypeError('Only workstation name and cycle time can be edited.');
  }
  next[index] = { ...next[index], ...patch };
  return next;
}

function normalizeScenario(scenario) {
  if (!scenario || typeof scenario !== 'object' || typeof scenario.id !== 'string' || !scenario.id.trim()) {
    throw new TypeError('A scenario needs a non-empty id.');
  }
  const name = typeof scenario.name === 'string' ? scenario.name.trim() : '';
  if (!name) throw new TypeError('A scenario needs a name.');
  const stations = cloneStations(scenario.stations);
  summarizeLine(stations);
  return {
    id: scenario.id,
    name,
    stations: stations.map(station => ({
      id: station.id,
      name: station.name.trim(),
      cycleSeconds: Number(station.cycleSeconds),
    })),
  };
}

export function saveScenario(scenarios, scenario) {
  if (!Array.isArray(scenarios)) throw new TypeError('Saved scenarios must be a list.');
  const normalized = normalizeScenario(scenario);
  const result = scenarios.filter(item => item.id !== normalized.id).map(normalizeScenario);
  result.push(normalized);
  return result;
}

export function deleteScenario(scenarios, id) {
  if (!Array.isArray(scenarios)) throw new TypeError('Saved scenarios must be a list.');
  return scenarios.filter(item => item.id !== id).map(normalizeScenario);
}

export function serializeSavedScenarios(scenarios) {
  return JSON.stringify({ version: 1, scenarios: scenarios.map(normalizeScenario) });
}

export function parseSavedScenarios(raw) {
  if (!raw) return { scenarios: [], rejectedCount: 0 };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { scenarios: [], rejectedCount: 1 }; }
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.scenarios)) {
    return { scenarios: [], rejectedCount: 1 };
  }
  const scenarios = [];
  const ids = new Set();
  let rejectedCount = 0;
  for (const record of parsed.scenarios) {
    try {
      const normalized = normalizeScenario(record);
      if (ids.has(normalized.id)) throw new Error('duplicate scenario id');
      ids.add(normalized.id);
      scenarios.push(normalized);
    } catch {
      rejectedCount += 1;
    }
  }
  return { scenarios, rejectedCount };
}
