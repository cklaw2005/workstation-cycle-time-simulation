import { MAX_STATIONS, summarizeLine, outputCountAt } from './line-model.mjs';

function positiveFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new RangeError(`${label} must be a positive number.`);
  return number;
}

/** Calculate demand pace and illustrative staffing from divisible manual work content. */
export function calculateTaktPlan({availableTimeSeconds, customerDemand, stations}) {
  const available = positiveFinite(availableTimeSeconds, 'Available production time');
  const demand = positiveFinite(customerDemand, 'Customer demand');
  if (!Number.isInteger(demand)) throw new RangeError('Customer demand must be a whole number of units.');
  const summary = summarizeLine(stations);
  const taktSeconds = available / demand;
  const minimumOperators = Math.max(1, Math.ceil(summary.totalWorkSeconds / taktSeconds - 1e-10));
  return {
    availableTimeSeconds: available,
    customerDemand: demand,
    taktSeconds,
    workContentSeconds: summary.totalWorkSeconds,
    minimumOperators,
    bottleneckSeconds: summary.bottleneckSeconds,
    meetsDemand: summary.bottleneckSeconds <= taktSeconds + 1e-9,
    modeledShiftOutput: outputCountAt(available, stations),
    theoreticalUnitsPerShift: available / summary.bottleneckSeconds,
  };
}

/** Create an explicitly theoretical, evenly balanced operator workload scenario. */
export function balanceWorkAcrossOperators(totalWorkSeconds, operatorCount) {
  const work = positiveFinite(totalWorkSeconds, 'Total work content');
  if (!Number.isInteger(operatorCount) || operatorCount < 1 || operatorCount > MAX_STATIONS) {
    throw new RangeError(`Operator count must be an integer from 1 to ${MAX_STATIONS}.`);
  }
  const cycleSeconds = work / operatorCount;
  return Array.from({length: operatorCount}, (_, index) => ({
    id: `balanced-${index + 1}`,
    name: `Operator ${index + 1}`,
    cycleSeconds,
  }));
}
