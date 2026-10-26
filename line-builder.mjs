import { outputCountAt, summarizeLine } from './line-model.mjs';
import {
  addStation, createSampleLine, deleteScenario, moveStation, parseSavedScenarios,
  removeStation, saveScenario, serializeSavedScenarios, updateStation,
} from './line-builder-state.mjs';

const STORAGE_KEY = 'workstation-cycle-time-scenarios-v1';
const $ = selector => document.querySelector(selector);
let stations = createSampleLine();
let scenarios = [];
let stationSequence = 4;
let elapsed = 0;
let running = false;
let lastFrame = 0;
let animationFrame = 0;

function escapeText(value) { return String(value); }

function renderStations() {
  const host = $('#stations');
  host.replaceChildren();
  stations.forEach((station, index) => {
    const row = document.createElement('div');
    row.className = 'station';
    const nameField = document.createElement('label');
    nameField.className = 'field';
    nameField.textContent = `Station ${index + 1} name`;
    const name = document.createElement('input');
    name.type = 'text'; name.maxLength = 40; name.value = escapeText(station.name);
    name.setAttribute('aria-label', `Workstation ${index + 1} name`);
    nameField.append(name);

    const timeField = document.createElement('label');
    timeField.className = 'field';
    timeField.textContent = 'Cycle time';
    const wrap = document.createElement('span'); wrap.className = 'cycle-wrap';
    const time = document.createElement('input');
    time.type = 'number'; time.min = '0.01'; time.step = 'any'; time.value = escapeText(station.cycleSeconds);
    time.setAttribute('aria-label', `Workstation ${index + 1} cycle time in seconds per unit`);
    wrap.append(time);
    const unit = document.createElement('span'); unit.className = 'unit'; unit.textContent = 'sec'; wrap.append(unit);
    timeField.append(wrap);

    const actions = document.createElement('div'); actions.className = 'actions';
    const up = document.createElement('button'); up.type = 'button'; up.textContent = '↑'; up.title = 'Move up'; up.setAttribute('aria-label', `Move ${station.name} up`); up.disabled = index === 0;
    const down = document.createElement('button'); down.type = 'button'; down.textContent = '↓'; down.title = 'Move down'; down.setAttribute('aria-label', `Move ${station.name} down`); down.disabled = index === stations.length - 1;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remove'; remove.className = 'danger'; remove.setAttribute('aria-label', `Remove ${station.name}`); remove.disabled = stations.length === 1;
    up.addEventListener('click', () => structuralChange(() => { stations = moveStation(stations, station.id, -1); }));
    down.addEventListener('click', () => structuralChange(() => { stations = moveStation(stations, station.id, 1); }));
    remove.addEventListener('click', () => structuralChange(() => { stations = removeStation(stations, station.id); }));
    name.addEventListener('input', () => editStation(station.id, {name: name.value}));
    time.addEventListener('input', () => editStation(station.id, {cycleSeconds: time.value}));
    actions.append(up, down, remove);
    row.append(nameField, timeField, actions);
    host.append(row);
  });
  $('#station-count').textContent = `${stations.length} of 12 workstations`;
  $('#add-station').disabled = stations.length >= 12;
}

function structuralChange(change) {
  try { change(); $('#validation').textContent = ''; }
  catch (error) { $('#validation').textContent = error.message; return; }
  resetClock(); renderStations(); renderSummary();
}

function editStation(id, patch) {
  try {
    stations = updateStation(stations, id, patch);
    $('#validation').textContent = '';
  } catch (error) { $('#validation').textContent = error.message; }
  resetClock(false);
  renderSummary();
}

function formatTime(seconds) {
  const whole = Math.floor(Math.max(0, seconds));
  const h = Math.floor(whole / 3600), m = Math.floor((whole % 3600) / 60), s = whole % 60;
  return h ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderSummary() {
  const error = $('#validation');
  let summary;
  try { summary = summarizeLine(stations); }
  catch (exception) {
    error.textContent = exception.message;
    for (const id of ['bottleneck','bottleneck-time','throughput','balance','first-unit','total-work']) $(`#${id}`).textContent = '—';
    $('#flow').replaceChildren(); $('#output').textContent = 'Correct the highlighted workstation values to calculate output.';
    return;
  }
  $('#validation').textContent = '';
  $('#bottleneck').textContent = summary.bottleneckStations.join(', ');
  $('#bottleneck-time').textContent = `${summary.bottleneckSeconds.toLocaleString(undefined,{maximumFractionDigits:2})} sec / unit`;
  $('#throughput').textContent = summary.unitsPerHour.toLocaleString(undefined,{maximumFractionDigits:2});
  $('#balance').textContent = `${(summary.balanceEfficiency * 100).toFixed(2)}%`;
  $('#first-unit').textContent = formatTime(summary.totalWorkSeconds);
  $('#total-work').textContent = `${summary.totalWorkSeconds.toLocaleString(undefined,{maximumFractionDigits:2})} sec total work`;
  renderFlow(summary.bottleneckSeconds);
  renderOutput(summary);
}

function renderFlow(bottleneckSeconds) {
  const flow = $('#flow'); flow.replaceChildren();
  stations.forEach((station, index) => {
    if (index) { const arrow = document.createElement('span'); arrow.className = 'arrow'; arrow.textContent = '→'; arrow.setAttribute('aria-hidden','true'); flow.append(arrow); }
    const card = document.createElement('div');
    card.className = `flow-card${Number(station.cycleSeconds) === bottleneckSeconds ? ' bottleneck' : ''}`;
    const title = document.createElement('strong'); title.textContent = station.name.trim() || `Station ${index + 1}`;
    const time = document.createElement('span'); time.textContent = `${Number(station.cycleSeconds).toLocaleString(undefined,{maximumFractionDigits:2})} sec / unit`;
    const step = document.createElement('span'); step.textContent = `Process step ${index + 1}`;
    card.append(title, time, step); flow.append(card);
  });
}

function renderOutput(summary) {
  const completed = outputCountAt(elapsed, stations);
  const untilFirst = Math.max(0, summary.totalWorkSeconds - elapsed);
  const nextTarget = completed === 0 ? `First unit target in ${formatTime(untilFirst)}.` : `Next target in ${formatTime(Math.max(0, summary.totalWorkSeconds + completed * summary.bottleneckSeconds - elapsed))}.`;
  $('#output').textContent = `${completed} ${completed === 1 ? 'completed unit' : 'completed units'} · ${nextTarget}`;
  $('#clock').textContent = formatTime(elapsed);
}

function tick(timestamp) {
  if (!running) return;
  if (lastFrame) elapsed += (timestamp - lastFrame) / 1000 * Number($('#speed').value);
  lastFrame = timestamp;
  try { renderOutput(summarizeLine(stations)); }
  catch { pauseClock(); }
  animationFrame = requestAnimationFrame(tick);
}

function pauseClock() {
  running = false; lastFrame = 0;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0; $('#play').textContent = 'Start';
}

function resetClock(resetDisplay = true) {
  pauseClock(); elapsed = 0;
  if (resetDisplay && stations.every(item => Number(item.cycleSeconds) > 0 && String(item.name).trim())) {
    try { renderOutput(summarizeLine(stations)); } catch { $('#clock').textContent = '00:00'; }
  } else if (!running) $('#clock').textContent = '00:00';
}

function readScenarios() {
  try {
    const parsed = parseSavedScenarios(localStorage.getItem(STORAGE_KEY));
    scenarios = parsed.scenarios;
    if (parsed.rejectedCount) $('#storage-message').textContent = `${parsed.rejectedCount} invalid or outdated saved scenario(s) were skipped. Valid scenarios are still available.`;
    renderScenarioSelect();
  } catch {
    scenarios = [];
    $('#storage-message').textContent = 'Browser storage is unavailable. Editing and simulation still work, but scenarios cannot be saved here.';
    renderScenarioSelect();
  }
}

function renderScenarioSelect() {
  const select = $('#saved-scenarios'); select.replaceChildren();
  const empty = document.createElement('option'); empty.value = ''; empty.textContent = scenarios.length ? 'Choose a saved scenario' : 'No saved scenarios'; select.append(empty);
  scenarios.forEach(scenario => { const option = document.createElement('option'); option.value = scenario.id; option.textContent = scenario.name; select.append(option); });
  $('#load-scenario').disabled = scenarios.length === 0;
  $('#delete-scenario').disabled = scenarios.length === 0;
}

function persistScenarios() {
  localStorage.setItem(STORAGE_KEY, serializeSavedScenarios(scenarios));
  $('#storage-message').textContent = 'Saved scenarios stay in this browser\'s local storage; they are not uploaded or shared.';
  renderScenarioSelect();
}

$('#add-station').addEventListener('click', () => {
  structuralChange(() => { stations = addStation(stations, `station-${Date.now()}-${stationSequence++}`); });
});
$('#play').addEventListener('click', () => {
  if (running) { pauseClock(); return; }
  try { summarizeLine(stations); } catch (error) { $('#validation').textContent = error.message; return; }
  running = true; $('#play').textContent = 'Pause'; lastFrame = 0; animationFrame = requestAnimationFrame(tick);
});
$('#reset').addEventListener('click', () => resetClock());
$('#speed').addEventListener('change', () => { lastFrame = 0; });
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseClock(); });
$('#save-scenario').addEventListener('click', () => {
  const name = $('#scenario-name').value.trim();
  if (!name) { $('#storage-message').textContent = 'Enter a name for this scenario before saving.'; $('#scenario-name').focus(); return; }
  try {
    summarizeLine(stations);
    const existing = scenarios.find(item => item.name.toLowerCase() === name.toLowerCase());
    scenarios = saveScenario(scenarios, {id: existing?.id ?? `scenario-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,name,stations});
    persistScenarios(); $('#saved-scenarios').value = scenarios.at(-1).id;
  } catch (error) { $('#storage-message').textContent = error.message; }
});
$('#load-scenario').addEventListener('click', () => {
  const selected = scenarios.find(item => item.id === $('#saved-scenarios').value);
  if (!selected) return;
  stations = selected.stations.map(item => ({...item}));
  $('#scenario-name').value = selected.name; stationSequence = stations.length + 1;
  resetClock(); renderStations(); renderSummary();
});
$('#delete-scenario').addEventListener('click', () => {
  const id = $('#saved-scenarios').value;
  if (!id) return;
  scenarios = deleteScenario(scenarios, id);
  try { persistScenarios(); } catch { $('#storage-message').textContent = 'Could not update browser storage. Your current workstation editor is unchanged.'; }
});

$('#scenario-name').addEventListener('keydown', event => { if (event.key === 'Enter') $('#save-scenario').click(); });
$('#clock').textContent = '00:00';
renderStations(); renderSummary(); readScenarios();
