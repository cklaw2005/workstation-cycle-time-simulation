import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { outputCountAt, summarizeLine } from './line-model.mjs';
import { parseSavedScenarios } from './line-builder-state.mjs';
import { getUnitSchedule } from './line-schedule.mjs';
import { buildUStationLayout } from './u-layout.mjs';
import { calculateTaktPlan, balanceWorkAcrossOperators } from './takt-model.mjs';

const STORAGE_KEY = 'workstation-cycle-time-scenarios-v1';
const DEMO_LINE = [40, 60, 45, 48, 50, 52, 55, 50].map((cycleSeconds, index) => ({
  id: `demo-${index + 1}`, name: `Station ${index + 1}`, cycleSeconds,
}));
// Generic teaching scenarios preserve 720 seconds of assumed manual work content.
const BEFORE_LINE = Array.from({length: 6}, (_, index) => ({
  id: `before-${index + 1}`, name: `Operator ${index + 1}`, cycleSeconds: 120,
}));
const AFTER_LINE = Array.from({length: 3}, (_, index) => ({
  id: `after-${index + 1}`, name: `Operator ${index + 1}`, cycleSeconds: 240,
}));
const $ = selector => document.querySelector(selector);
const sceneHost = $('#scene-wrap');
const warning = $('#error');
let line = AFTER_LINE.map(station => ({...station}));
let scenarios = [];
let activeScenario = '';
let balancedLine = null;
let elapsed = 0;
let running = false;
let lastFrame = 0;
let raf = 0;
let scene, camera, renderer, controls;
let stationMeshes = [];
let partMeshes = [];
let tags = [];
let bottleneckIndex = 0;
let resizeObserver;
const materials = {};

function material(name, color, roughness = 0.78) {
  materials[name] ??= new THREE.MeshStandardMaterial({color, roughness});
  return materials[name];
}

function formatTime(seconds) {
  const whole = Math.floor(Math.max(0, seconds));
  const hours = Math.floor(whole / 3600), mins = Math.floor(whole % 3600 / 60), secs = whole % 60;
  return hours ? `${String(hours).padStart(2,'0')}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}` : `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

function updateSummary() {
  const summary = summarizeLine(line);
  bottleneckIndex = line.findIndex(station => Number(station.cycleSeconds) === summary.bottleneckSeconds);
  $('#station-count').textContent = String(line.length);
  $('#scenario-name').textContent = activeScenario || 'Illustrative after-improvement values';
  $('#bottleneck').textContent = summary.bottleneckStations.join(', ');
  $('#bottleneck-time').textContent = `${summary.bottleneckSeconds.toLocaleString(undefined,{maximumFractionDigits:2})} sec / unit`;
  $('#throughput').textContent = summary.unitsPerHour.toLocaleString(undefined,{maximumFractionDigits:2});
  $('#line-title').textContent = `${line.length} operator workstations · U-shaped schematic view`;
  updateTaktLesson();
  updateClock();
}

function updateTaktLesson() {
  const availableMinutes = Number($('#available-minutes').value);
  const demand = Number($('#customer-demand').value);
  const applyButton = $('#apply-staffing');
  if (!Number.isFinite(availableMinutes) || availableMinutes <= 0 || !Number.isInteger(demand) || demand <= 0) {
    $('#takt-value').textContent = 'Enter valid values';
    $('#work-content').textContent = '—'; $('#bottleneck-ct').textContent = '—';
    $('#minimum-operators').textContent = '—'; $('#modeled-output').textContent = '—';
    $('#capacity-status').dataset.state = 'short';
    $('#capacity-title').textContent = 'Enter positive available time and whole-unit demand';
    $('#capacity-detail').textContent = 'Demand must be a whole number of units; available minutes must be greater than zero.';
    $('#balance-chart').replaceChildren(); applyButton.disabled = true;
    return;
  }
  const plan = calculateTaktPlan({availableTimeSeconds: availableMinutes * 60, customerDemand: demand, stations: line});
  const seconds = Math.round(plan.taktSeconds);
  $('#takt-value').textContent = `${formatTime(plan.taktSeconds)} / unit`;
  $('#work-content').textContent = `${plan.workContentSeconds.toLocaleString(undefined,{maximumFractionDigits:2})} sec`;
  $('#bottleneck-ct').textContent = `${plan.bottleneckSeconds.toLocaleString(undefined,{maximumFractionDigits:2})} sec`;
  const bottlenecks = summarizeLine(line).bottleneckStations.join(', ');
  $('#bottleneck-label').textContent = `${bottlenecks} · slowest workload`;
  $('#minimum-operators').textContent = plan.minimumOperators > 12 ? '12+' : String(plan.minimumOperators);
  $('#staffing-detail').textContent = `theoretical floor · current line has ${line.length}`;
  $('#modeled-output').textContent = String(plan.modeledShiftOutput);
  $('#output-detail').textContent = `units · demand is ${demand} / shift`;
  const status = $('#capacity-status');
  status.dataset.state = plan.meetsDemand ? 'ok' : 'short';
  $('#capacity-title').textContent = !plan.meetsDemand
    ? 'Capacity shortfall · bottleneck is slower than takt'
    : plan.modeledShiftShortfall > 0
      ? `Steady rate meets takt · empty-line shift is ${plan.modeledShiftShortfall} unit${plan.modeledShiftShortfall===1?'':'s'} short`
      : 'Steady-state rate meets customer demand';
  const requiredUph = plan.requiredUnitsPerHour.toFixed(1);
  const capacityUph = plan.theoreticalUnitsPerHour.toFixed(1);
  const capacityGap = plan.hourlyCapacityShortfall.toFixed(1);
  $('#capacity-detail').textContent = `Bottleneck ${plan.bottleneckSeconds.toFixed(0)} sec ${plan.meetsDemand ? '≤' : '>'} takt ${seconds} sec. Customer demand requires ${requiredUph} UPH; the bottleneck supports ${capacityUph} theoretical UPH.${plan.meetsDemand ? ' The line can keep pace at steady state.' : ` The shortfall is ${capacityGap} UPH; rebalance work or add capacity.`} From an empty line, this model completes ${plan.modeledShiftOutput} units in ${availableMinutes} net minutes because first-unit work must finish before the bottleneck rhythm begins.${plan.modeledShiftShortfall > 0 ? ` That leaves the empty-start shift ${plan.modeledShiftShortfall} unit${plan.modeledShiftShortfall===1?'':'s'} below demand; starting WIP or pre-shift production can change this result.` : ''}`;
  $('#apply-note').textContent = plan.minimumOperators > 12
    ? 'The estimate exceeds the 12-operator demo limit; reduce work content or revise the planning inputs.'
    : `Evenly divide ${plan.workContentSeconds.toFixed(0)} sec of assumed manual work across ${plan.minimumOperators} operators. Task sequence and feasibility still need review.`;
  applyButton.textContent = plan.minimumOperators > 12 ? 'Staffing estimate exceeds demo limit' : `Balance work across ${plan.minimumOperators} operator${plan.minimumOperators===1?'':'s'}`;
  applyButton.disabled = plan.minimumOperators > 12;
  document.querySelectorAll('.compare-card').forEach(card=>card.classList.remove('active'));
  if (line.length===6 && Math.abs(plan.workContentSeconds-720)<1e-6) $('#before-card').classList.add('active');
  if (line.length===3 && Math.abs(plan.workContentSeconds-720)<1e-6) $('#after-card').classList.add('active');
  renderBalanceChart(plan.taktSeconds);
}

function renderBalanceChart(taktSeconds) {
  const chart = $('#balance-chart');
  chart.replaceChildren();
  $('#chart-title').textContent = `Current operator work content · ${line.length} people`;
  const max = Math.max(taktSeconds, ...line.map(station=>Number(station.cycleSeconds))) * 1.08;
  const taktPercent = Math.min(100, taktSeconds / max * 100);
  const scale = document.createElement('div'); scale.className='chart-scale'; scale.style.setProperty('--takt-pct',`${taktPercent}%`);
  const mark=document.createElement('span'); mark.textContent=`TAKT ${formatTime(taktSeconds)}`; scale.append(mark); chart.append(scale);
  line.forEach((station,index)=>{
    const row=document.createElement('div'); row.className='chart-row';
    const label=document.createElement('span'); label.className='op-label'; label.textContent=station.name;
    const track=document.createElement('div'); track.className='bar-track'; track.style.setProperty('--takt-pct',`${taktPercent}%`);
    const fill=document.createElement('div'); fill.className=`bar-fill${Number(station.cycleSeconds)>taktSeconds?' over':''}`; fill.style.width=`${Math.min(100,Number(station.cycleSeconds)/max*100)}%`;
    const lineMark=document.createElement('i'); lineMark.className='takt-marker'; track.append(fill,lineMark);
    const value=document.createElement('span'); value.className='bar-value'; value.textContent=`${Number(station.cycleSeconds).toFixed(0)} sec`;
    row.append(label,track,value); chart.append(row);
  });
}

function updateClock() {
  const summary = summarizeLine(line);
  const completed = outputCountAt(elapsed, line);
  const remaining = completed === 0 ? summary.totalWorkSeconds - elapsed : summary.totalWorkSeconds + completed * summary.bottleneckSeconds - elapsed;
  $('#clock').textContent = formatTime(elapsed);
  $('#output').textContent = String(completed);
  $('#target').textContent = completed === 0 ? `First unit target in ${formatTime(remaining)}` : `Next unit target in ${formatTime(remaining)}`;
}

function addBox(parent, size, position, color, name, radius = 0.08) {
  const geometry = new THREE.BoxGeometry(...size);
  const mesh = new THREE.Mesh(geometry, material(name, color));
  mesh.position.set(...position);
  mesh.castShadow = false; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, radiusTop, radiusBottom, height, position, color, name, sides = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides), material(name, color));
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function addOperator(parent, x, z) {
  const person = new THREE.Group();
  person.position.set(x, 0, z);
  parent.add(person);
  addCylinder(person, .2, .24, .62, [0,.66,0], 0xd18431, 'operator-shirt', 8);
  addCylinder(person, .075, .095, .38, [0,.28,0], 0x263846, 'operator-trousers', 8);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.16,10,8), material('operator-head',0xe8b994));
  head.position.set(0,1.08,.01); person.add(head);
  addBox(person,[.12,.34,.12],[-.12,.65,.21],0xe0a777,'operator-arm');
  addBox(person,[.12,.34,.12],[.13,.65,.21],0xe0a777,'operator-arm');
}

function clearStationScene() {
  for (const tag of tags) tag.remove();
  tags = [];
  for (const object of [...stationMeshes, ...partMeshes]) {
    scene.remove(object);
    object.traverse(child => { if (child.geometry) child.geometry.dispose(); });
  }
  stationMeshes = []; partMeshes = [];
}

function makeStation(station, index, point) {
  const group = new THREE.Group();
  group.position.set(point.x,0,point.z);
  group.rotation.y = point.rotationY;
  scene.add(group); stationMeshes.push(group);
  const table = addBox(group,[1.5,.85,1.05],[0,.62,0],0x387d79,'machine-body');
  addBox(group,[1.57,.12,1.1],[0,1.1,0],0xaac1bb,'machine-top');
  addBox(group,[.67,.52,.08],[0,1.43,-.31],0x203541,'machine-screen');
  addBox(group,[.56,.39,.035],[0,1.44,-.26],0x83bdad,'machine-screen-glass');
  addBox(group,[.34,.18,.24],[.35,1.26,.1],0xe4b85f,'fixture');
  addCylinder(group,.045,.045,.08,[.42,1.39,.1],0x293e48,'fixture-post',8);
  addBox(group,[.57,.38,.58],[-.52,.22,.48],0x788c84,'input-bin');
  addOperator(group,.78,.77);
  const label = document.createElement('div');
  label.className = `station-tag${index === bottleneckIndex ? ' bottleneck' : ''}`;
  const title = document.createElement('strong'); title.textContent = `${index + 1} · ${station.name}`;
  const cycle = document.createElement('span'); cycle.textContent = `${Number(station.cycleSeconds).toLocaleString(undefined,{maximumFractionDigits:2})} sec / unit`;
  label.append(title,cycle); sceneHost.append(label); tags.push(label);
  return {group, table, point};
}

function buildRoute(layout) {
  const points = layout.map(point => new THREE.Vector3(point.x,.035,point.z));
  if (points.length > 1) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const route = new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(32,points.length*8),.025,5,false),material('route',0x789b9b));
    scene.add(route); stationMeshes.push(route);
  }
  layout.forEach((point,index) => {
    if (index === layout.length - 1) return;
    const next = layout[index+1];
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(.11,.3,6),material('route-arrow',0x527e80));
    arrow.position.set((point.x+next.x)/2,.08,(point.z+next.z)/2);
    arrow.rotation.x = Math.PI/2;
    arrow.rotation.y = -Math.atan2(next.x-point.x,next.z-point.z);
    scene.add(arrow); stationMeshes.push(arrow);
  });
}

function buildScene() {
  clearStationScene();
  const layout = buildUStationLayout(line.length);
  buildRoute(layout);
  line.forEach((station,index) => makeStation(station,index,layout[index]));
  const floor = addBox(scene,[12.2,.08,8.2],[0,-.14,0],0xf8fbfc,'floor');
  stationMeshes.push(floor);
  const grid = new THREE.GridHelper(11.7,24,0x9db6bd,0xcbd7db);
  grid.position.y=-.08; scene.add(grid); stationMeshes.push(grid);
  for (let index=0; index<24; index++) {
    const part = new THREE.Group();
    const body = addBox(part,[.26,.16,.26],[0,.18,0],0xe6a63c,'workpiece');
    addBox(part,[.12,.04,.12],[0,.28,0],0xf4d78d,'part-top');
    part.visible = false; scene.add(part); partMeshes.push(part);
  }
  positionTags();
}

function positionTags() {
  if (!camera || !renderer) return;
  const rect = renderer.domElement.getBoundingClientRect();
  line.forEach((station,index) => {
    const group = stationMeshes.filter(object => object.isGroup)[index];
    if (!group) return;
    const projected = new THREE.Vector3(group.position.x,1.92,group.position.z).project(camera);
    const visible = projected.z > -1 && projected.z < 1;
    tags[index].style.display = visible ? 'block':'none';
    tags[index].style.left = `${(projected.x*.5+.5)*rect.width}px`;
    tags[index].style.top = `${(-projected.y*.5+.5)*rect.height}px`;
  });
}

function initThree() {
  try {
    scene = new THREE.Scene(); scene.background = new THREE.Color(0xeaf0f2);
    camera = new THREE.PerspectiveCamera(40,1,.1,100);
    camera.position.set(12,11,14);
    renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'low-power'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    sceneHost.append(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff,0x9bacad,2.1));
    const keyLight = new THREE.DirectionalLight(0xffffff,2.2); keyLight.position.set(-4,10,7); scene.add(keyLight);
    controls = new OrbitControls(camera,renderer.domElement); controls.target.set(0,.3,0); controls.enableDamping=true; controls.maxPolarAngle=Math.PI*.48; controls.minDistance=9; controls.maxDistance=28;
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(sceneHost); resize();
    buildScene();
    renderer.setAnimationLoop(renderFrame);
  } catch (error) {
    warning.textContent = `3D view could not start in this browser. Your line summary and cycle-time simulation still work. ${error.message}`;
    warning.classList.add('visible');
  }
}

function resize() {
  if (!renderer || !camera) return;
  const {width,height}=sceneHost.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width,height,false); camera.aspect=width/height; camera.updateProjectionMatrix(); positionTags();
}

function drawParts() {
  if (!partMeshes.length) return;
  const firstCT = Number(line[0].cycleSeconds);
  const latestStarted = Math.floor(elapsed/firstCT);
  const firstVisible = Math.max(0,latestStarted-partMeshes.length+1);
  const layout = buildUStationLayout(line.length);
  let meshIndex=0;
  for (let unit=firstVisible;unit<=latestStarted && meshIndex<partMeshes.length;unit++) {
    const schedule=getUnitSchedule(line,unit);
    const finish=schedule.at(-1).finishSeconds;
    if (elapsed >= finish) continue;
    const mesh=partMeshes[meshIndex++]; mesh.visible=true;
    let stationIndex=schedule.findIndex(job=>elapsed<job.finishSeconds);
    if (stationIndex<0) { mesh.visible=false; continue; }
    const job=schedule[stationIndex];
    const point=layout[stationIndex];
    const progress=Math.max(0,Math.min(1,(elapsed-job.startSeconds)/job.cycleSeconds));
    const previous=stationIndex ? layout[stationIndex-1] : {x:point.x-1.25*Math.sin(point.rotationY),z:point.z+1.25*Math.cos(point.rotationY)};
    const transferShare=.16;
    const moveProgress=Math.min(1,progress/transferShare);
    mesh.position.set(previous.x+(point.x-previous.x)*moveProgress,.02,previous.z+(point.z-previous.z)*moveProgress);
  }
  while(meshIndex<partMeshes.length) partMeshes[meshIndex++].visible=false;
}

function renderFrame(timestamp) {
  if (running && lastFrame) {
    elapsed += (timestamp-lastFrame)/1000*Number($('#speed').value);
    updateClock(); drawParts();
  }
  if (running) lastFrame=timestamp;
  controls?.update(); renderer?.render(scene,camera); positionTags();
}

function reset() { running=false; lastFrame=0; $('#play').textContent='Start'; elapsed=0; updateClock(); drawParts(); }
function readScenarios() {
  const select=$('#scenario');
  const previousValue=select.value;
  select.querySelectorAll('option[data-saved-scenario="true"]').forEach(option=>option.remove());
  try {
    const parsed=parseSavedScenarios(localStorage.getItem(STORAGE_KEY));
    scenarios=parsed.scenarios;
    for (const scenario of scenarios) { const option=document.createElement('option'); option.dataset.savedScenario='true'; option.value=`saved:${scenario.id}`; option.textContent=`Your line · ${scenario.name}`; select.append(option); }
    if ([...select.options].some(option=>option.value===previousValue)) select.value=previousValue;
    else if (previousValue.startsWith('saved:')) {
      select.value='after';
      select.dispatchEvent(new Event('change'));
    }
    if (parsed.rejectedCount) { warning.textContent=`${parsed.rejectedCount} invalid saved scenario(s) were skipped.`; warning.classList.add('visible'); }
  } catch { scenarios=[]; warning.textContent='Browser storage is unavailable; the example line is ready to simulate.'; warning.classList.add('visible'); }
}

window.addEventListener('storage',event=>{
  if (event.key===STORAGE_KEY || event.key===null) readScenarios();
});

$('#play').addEventListener('click',()=>{running=!running;lastFrame=0;$('#play').textContent=running?'Pause':'Start';});
$('#reset').addEventListener('click',reset);
$('#speed').addEventListener('change',()=>{lastFrame=0;});
$('#scenario').addEventListener('change',event=>{
  const value=event.target.value;
  const selected=scenarios.find(item=>`saved:${item.id}`===value);
  if (value==='after') {
    line=AFTER_LINE.map(station=>({...station}));
    activeScenario='Illustrative after-improvement values';
  } else if (value==='custom') {
    line=DEMO_LINE.map(station=>({...station}));
    activeScenario='Illustrative eight-station line';
  } else if (value==='balanced') {
    line=balancedLine ? balancedLine.map(station=>({...station})) : balanceWorkAcrossOperators(720,3);
    activeScenario='Illustrative balanced staffing plan';
  } else if (value==='before') {
    line=BEFORE_LINE.map(station=>({...station}));
    activeScenario='Illustrative before-improvement values';
  } else if (value==='rate-check') {
    $('#available-minutes').value='60';
    $('#customer-demand').value='120';
    line=[
      {id:'rate-check-1',name:'Operator 1',cycleSeconds:35},
      {id:'rate-check-2',name:'Operator 2',cycleSeconds:25},
    ];
    activeScenario='Worked check · 30 s takt / 35 s bottleneck';
  } else if (selected) {
    line=selected.stations.map(item=>({...item}));
    activeScenario=`Your saved line · ${selected.name}`;
  }
  reset(); updateSummary(); buildScene();
});
$('#available-minutes').addEventListener('input',updateTaktLesson);
$('#customer-demand').addEventListener('input',updateTaktLesson);
$('#reset-planning').addEventListener('click',()=>{
  $('#available-minutes').value='450'; $('#customer-demand').value='110'; updateTaktLesson();
});
$('#load-rate-example').addEventListener('click',()=>{
  $('#scenario').value='rate-check';
  $('#scenario').dispatchEvent(new Event('change'));
  $('#balance-chart').scrollIntoView({behavior:'smooth',block:'center'});
});
$('#apply-staffing').addEventListener('click',()=>{
  const plan=calculateTaktPlan({availableTimeSeconds:Number($('#available-minutes').value)*60,customerDemand:Number($('#customer-demand').value),stations:line});
  line=balanceWorkAcrossOperators(plan.workContentSeconds,plan.minimumOperators);
  balancedLine=line.map(station=>({...station}));
  activeScenario=`Illustrative balanced staffing · ${line.length} operators`;
  $('#scenario').value='balanced';
  reset(); updateSummary(); buildScene();
});
$('#top').addEventListener('click',()=>{
  const topDown=camera.position.y<15;
  camera.position.set(0,topDown ? 20 : 11,topDown ? .01 : 14);
  camera.up.set(0,topDown?0:1,topDown?-1:0); camera.lookAt(0,0,0); controls.target.set(0,0,0); controls.update(); positionTags();
  $('#top').textContent=topDown?'Perspective view':'Top view';
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){running=false;lastFrame=0;$('#play').textContent='Start';}});
window.addEventListener('beforeunload',()=>{resizeObserver?.disconnect();renderer?.dispose();});

readScenarios(); updateSummary(); initThree();
