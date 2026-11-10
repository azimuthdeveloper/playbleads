import * as THREE from 'three';
import { buildRoom, TV_SCREEN } from './room.js';
import { buildToddler, buildParent, TODDLER_LOOKS, PARENT_LOOKS } from './characters.js';
import { buildLibrary } from './library.js';
import { buildPark } from './park.js';
import { buildTrain } from './train.js';
import { createTVShow } from './tvshow.js';
import { SCENES, applyCamera } from './scenes.js';
import { startRecording } from './recorder.js';

// Output formats. Shots are framed for 16:9; taller frames widen the view to keep the action in.
export const FORMATS = {
  landscape: { label: '16:9 · 1920×1080', w: 1920, h: 1080 },
  reel: { label: 'Instagram Reel · 9:16', w: 1080, h: 1920, ig: true },
  feed: { label: 'Instagram post · 4:5', w: 1080, h: 1350, ig: true },
  square: { label: 'Instagram square · 1:1', w: 1080, h: 1080, ig: true },
};
const params = new URLSearchParams(location.search);
let format = FORMATS[params.get('format')] ? params.get('format') : 'landscape';
let WIDTH = FORMATS[format].w, HEIGHT = FORMATS[format].h;

// each world loops over the length of the scenes shot in it (they must agree)
const loopOf = (world) => {
  const ds = [...new Set(SCENES.filter((s) => (s.world || 'home') === world).map((s) => s.duration))];
  if (ds.length > 1) console.warn(`scenes in "${world}" have different lengths (${ds}); loops won't be seamless`);
  return ds[0] || 0;
};
const HOME_LOOP = loopOf('home'), LIBRARY_LOOP = loopOf('library');

// ---------- renderer ----------
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101019);
scene.fog = new THREE.Fog(0x101019, 90, 190);

const camera = new THREE.PerspectiveCamera(45, WIDTH / HEIGHT, 0.5, 400);

function setFormat(key) {
  format = key;
  ({ w: WIDTH, h: HEIGHT } = FORMATS[key]);
  renderer.setSize(WIDTH, HEIGHT, false);
  canvas.style.aspectRatio = `${WIDTH} / ${HEIGHT}`;
  camera.aspect = WIDTH / HEIGHT;
  camera.userData.zoomOut = Math.sqrt(Math.max(1, (16 / 9) / camera.aspect));
  train?.setAspect(camera.aspect); // the words re-flow for tall frames
}
let train = null;
setFormat(format);

// ---------- world ----------
const { screen } = buildRoom(scene);
const show = createTVShow({ loop: HOME_LOOP });
screen.material.map = show.texture;
screen.material.needsUpdate = true;

let toddler, parent;
let kidLook, parentLook;
function setToddler(look) {
  kidLook = look;
  if (toddler) { scene.remove(toddler.root); library.setKid(look); park?.setKid(look); train?.setKid(look); } // same kid in every world
  toddler = buildToddler(look, { loop: HOME_LOOP });
  toddler.root.position.set(2, 0, -6);
  scene.add(toddler.root);
}
function setParent(look) {
  parentLook = look;
  if (parent) { scene.remove(parent.root); library.setParent(look); train?.setParent(look); }
  parent = buildParent(look, 'couch', { loop: HOME_LOOP });
  parent.root.position.set(0, 11, 13);
  scene.add(parent.root);
}
const startParent = PARENT_LOOKS[params.get('parent')] ? params.get('parent') : 'tired';
const startKid = TODDLER_LOOKS[params.get('kid')] ? params.get('kid') : 'girl';
const library = buildLibrary({ kidLook: startKid, parentLook: startParent, loop: LIBRARY_LOOP });
// the park has its own grown-up (a dad by default; ?walker=mum etc.), built on first use
let park = null;
let walkerLook = PARENT_LOOKS[params.get('walker')] ? params.get('walker') : 'dad';
const getPark = () => (park ??= buildPark({ kidLook, parentLook: walkerLook }));
const getTrain = () => (train ??= buildTrain({ kidLook, parentLook, aspect: camera.aspect }));
setToddler(startKid);
setParent(startParent);

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0x8a9cc8, 0x2a1c14, 1.1));

const moon = new THREE.DirectionalLight(0x8fa8ff, 1.4);
moon.position.set(-90, 45, -4);
moon.target.position.set(0, 0, 0);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 10, far: 200 });
moon.shadow.bias = -0.0005;
scene.add(moon, moon.target);

const lampLight = new THREE.PointLight(0xffb36b, 260, 70, 1.6);
lampLight.position.set(30, 28, 22);
scene.add(lampLight);

const tvLight = new THREE.SpotLight(0xffffff, 900, 90, 1.15, 0.7, 1.4);
tvLight.position.set(TV_SCREEN.x, TV_SCREEN.y, TV_SCREEN.z + 1.5);
tvLight.target.position.set(0, 8, 16);
tvLight.castShadow = true;
tvLight.shadow.mapSize.set(2048, 2048);
tvLight.shadow.bias = -0.0008;
tvLight.shadow.camera.near = 1;
scene.add(tvLight, tvLight.target);

const tvFill = new THREE.PointLight(0xffffff, 120, 40, 1.5); // soft spill on the wall/stand
tvFill.position.set(0, 18, -21);
scene.add(tvFill);

const tvTint = new THREE.Color();
function updateTVLight() {
  // push the average screen colour towards saturated so the flicker reads
  const hsl = {};
  show.color.getHSL(hsl);
  tvTint.setHSL(hsl.h, Math.min(1, hsl.s * 1.4 + 0.15), 0.55);
  tvLight.color.lerp(tvTint, 0.35);
  tvFill.color.copy(tvLight.color);
  const k = 0.75 + hsl.l * 0.6;
  tvLight.intensity = 900 * k;
  tvFill.intensity = 120 * k;
}

// ---------- worlds: each scene in SCENES names the one it's shot in ----------
const worlds = {
  home: {
    scene, exposure: 1.35,
    update(t) {
      toddler.update(t);
      parent.update(t);
      show.update(t);
      updateTVLight();
    },
  },
  library,
  get park() { return getPark(); },
  get train() { return getTrain(); },
};
const inPark = () => SCENES[sceneIdx].world === 'park';

// ---------- playback state ----------
let sceneIdx = Math.min(SCENES.length - 1, Math.max(0, (parseInt(params.get('scene'), 10) || 1) - 1));
let t = parseFloat(params.get('t')) || 0;
let playing = !params.has('t');
let last = performance.now();
let recording = null;

const ui = {
  buttons: [...document.querySelectorAll('[data-scene]')],
  play: document.getElementById('play'),
  record: document.getElementById('record'),
  recordAll: document.getElementById('recordAll'),
  scrub: document.getElementById('scrub'),
  time: document.getElementById('time'),
  status: document.getElementById('status'),
  parentPick: document.getElementById('parentPick'),
  kidPick: document.getElementById('kidPick'),
  formatPick: document.getElementById('formatPick'),
};

function fillPicker(sel, looks, current, onPick) {
  for (const [k, v] of Object.entries(looks)) sel.add(new Option(v.label, k, false, k === current));
  sel.addEventListener('change', () => onPick(sel.value));
}
fillPicker(ui.parentPick, PARENT_LOOKS, startParent, (look) => {
  if (inPark()) { walkerLook = look; park?.setParent(look); } else setParent(look);
});
fillPicker(ui.kidPick, TODDLER_LOOKS, startKid, setToddler);
fillPicker(ui.formatPick, FORMATS, format, setFormat);

function setScene(i) {
  sceneIdx = i;
  t = 0;
  ui.scrub.max = SCENES[i].duration;
  ui.buttons.forEach((b, j) => b.classList.toggle('active', j === i));
  ui.parentPick.value = inPark() ? walkerLook : parentLook; // the park keeps its own grown-up
}

ui.buttons.forEach((b, i) => b.addEventListener('click', () => !recording && setScene(i)));
ui.play.addEventListener('click', () => { playing = !playing; ui.play.textContent = playing ? 'Pause' : 'Play'; });
ui.scrub.addEventListener('input', () => { t = parseFloat(ui.scrub.value); playing = false; ui.play.textContent = 'Play'; });

async function recordScene(i) {
  setScene(i);
  renderFrame(); // make sure the first frame is ready
  playing = true;
  ui.play.textContent = 'Pause';
  ui.status.textContent = `● Recording scene ${i + 1}…`;
  document.body.classList.add('recording');
  const slug = SCENES[i].name.toLowerCase().replace(/[^a-z]+/g, '-');
  const F = FORMATS[format];
  // Instagram only takes MP4 (H.264), so prefer it for those formats
  recording = startRecording(canvas, `scene-${i + 1}-${slug}${format === 'landscape' ? '' : `-${format}`}`, { preferMp4: F.ig });
  t = 0;
  last = performance.now();
  await new Promise((resolve) => (recording.onEnd = resolve));
  recording.stop();
  await recording.done;
  recording = null;
  document.body.classList.remove('recording');
  ui.status.textContent = `Saved scene ${i + 1}.`;
}

ui.record.addEventListener('click', () => !recording && recordScene(sceneIdx));
ui.recordAll.addEventListener('click', async () => {
  if (recording) return;
  for (let i = 0; i < SCENES.length; i++) await recordScene(i);
  ui.status.textContent = `Saved all ${SCENES.length} scenes.`;
});

// ---------- loop ----------
function renderFrame() {
  const world = worlds[SCENES[sceneIdx].world || 'home'];
  applyCamera(camera, sceneIdx, t);
  world.update(t);
  renderer.toneMappingExposure = world.exposure;
  renderer.render(world.scene, camera);
  // fades to/from black (drawn into the canvas, so they're in the recording too)
  const fd = SCENES[sceneIdx].fade, D = SCENES[sceneIdx].duration;
  const black = fd ? Math.max(1 - t / fd.in, (t - (D - fd.out)) / fd.out, 0) : 0;
  if (black > 0) {
    fadeMat.opacity = Math.min(1, black);
    renderer.autoClear = false;
    renderer.render(fadeScene, fadeCam);
    renderer.autoClear = true;
  }
}
const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, depthTest: false, depthWrite: false });
const fadeScene = new THREE.Scene();
fadeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat).translateZ(-0.5));
const fadeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

function loop(now) {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  const dur = SCENES[sceneIdx].duration;
  if (playing) t += dt;
  if (recording?.ended) { requestAnimationFrame(loop); return; } // hold while the file is written
  if (recording && t >= dur) {
    // stop on the last frame before the loop point: frame `dur` is frame 0 again, and a
    // repeated frame would show as a hitch when the video loops
    recording.ended = true;
    recording.onEnd?.();
    requestAnimationFrame(loop);
    return;
  } else if (!recording && t > dur) {
    t = 0; // loop previews
  }
  ui.scrub.value = t;
  ui.time.textContent = `${t.toFixed(1)}s / ${dur}s`;
  renderFrame();
  requestAnimationFrame(loop);
}

setScene(sceneIdx);
t = parseFloat(params.get('t')) || 0;
if (!playing) ui.play.textContent = 'Play';
requestAnimationFrame(loop);

// debugging hook
window.__voxel = { setScene, setFormat, setParent, setToddler, setTime: (v) => { t = v; playing = false; }, renderAt: (v) => { t = v; playing = false; renderFrame(); }, renderer, scene, camera, library, get park() { return getPark(); }, get train() { return getTrain(); } };

// ?sheet: render every scene x 4 moments into one image (cheap visual check)
if (params.has('sheet')) {
  const cols = 4, h = 270, w = Math.round((h * WIDTH) / HEIGHT);
  const sheet = document.createElement('canvas');
  sheet.width = cols * w; sheet.height = SCENES.length * h;
  const g = sheet.getContext('2d');
  const times = [0.04, 0.375, 0.71, 0.99]; // fractions of each scene
  SCENES.forEach((s, i) => times.forEach((f, j) => {
    sceneIdx = i; t = f * s.duration; renderFrame();
    g.drawImage(canvas, j * w, i * h, w, h);
  }));
  playing = false;
  Object.assign(sheet.style, { position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', zIndex: 9 });
  document.body.appendChild(sheet);
}
