import * as THREE from 'three';
import { LOOP } from './park.js';
import { TRAIN_LOOP, trainCamera } from './train.js';

// Camera scripts. Each key: pos, look, fov.
// Every scene loops seamlessly: positions/targets/fov are joined with closed Catmull-Rom
// curves, so after the last key the camera glides back round to the first and the move
// never stops, not even at the loop point. The last key is the way back round to the first.
// Each key's `dur` is the seconds spent getting from it to the next; keys without one share
// what's left of the scene evenly.
export const SCENES = [
  {
    name: 'Wide establishing',
    duration: 12,
    keys: [
      { pos: [6, 40, 64], look: [0, 16, 8], fov: 40 },
      { pos: [22, 40, 46], look: [0, 14, 0], fov: 42 },
      { pos: [34, 30, 22], look: [0, 13, -8], fov: 44 },
      { pos: [28, 20, 4], look: [-2, 12, -14], fov: 46, dur: 2.5 },
      { pos: [20, 50, 50], look: [0, 14, 4], fov: 42, dur: 2 }, // crane up and back to the start
    ],
  },
  {
    name: "Kid's eye view",
    duration: 12,
    keys: [
      { pos: [11, 10, 8], look: [2, 12, -12], fov: 50 },
      { pos: [12, 16, -3], look: [2, 16, -20], fov: 46 },
      { pos: [7, 20, -11], look: [0, 18, -24], fov: 42 },
      { pos: [0, 18, -13], look: [0, 18, -25], fov: 40, dur: 2.5 },
      { pos: [9, 26, -4], look: [2, 12, -16], fov: 46, dur: 2 }, // up and over the kid, back to the start
    ],
  },
  {
    name: 'The exhausted parent',
    duration: 12,
    keys: [
      { pos: [-4, 20, 4], look: [0, 18, -25], fov: 45 },
      { pos: [-20, 28, -2], look: [0, 18, 8], fov: 45 },
      { pos: [-22, 32, -10], look: [0, 21, 10], fov: 44 },
      { pos: [-28, 34, -22], look: [1, 18, 6], fov: 42, dur: 2.5 },
      { pos: [-18, 26, -6], look: [0, 18, -14], fov: 45, dur: 2 }, // swing back round to the TV
    ],
  },
  {
    // the next morning: library playgroup. Wide on the circle, down to kid height
    // for the story, then round to the parent, coffee in hand.
    name: 'Library story time',
    world: 'library',
    duration: 16,
    keys: [
      { pos: [-28, 54, 33], look: [2, 6, -6], fov: 50 },
      { pos: [14, 16, 22], look: [-2, 16, -20], fov: 46 },
      { pos: [1, 34, 3], look: [13, 19, 20], fov: 48 },
      { pos: [5, 32, 2], look: [17, 27, 25], fov: 36, dur: 3 },
      { pos: [-10, 48, 24], look: [0, 10, -4], fov: 46, dur: 2.5 }, // crane back up to the start
    ],
  },
  {
    // the weekend: a tired grown-up power-walking after a kid on a bike, round and round a
    // little planet of a park. A seamless loop: starts behind the parent, sweeps out to the
    // right in a half circle to the front, dwells there, then completes the circle round the
    // left and comes back in behind the parent, exactly where it started.
    name: 'Park chase',
    world: 'park',
    duration: LOOP,
    camera: parkOrbit,
  },
  {
    // outside The Corner, State Library of Queensland's kids' space on Stanley Place: the
    // street view of the sign and canopy from the photos, down to the bubble-and-water play,
    // round past the bin chicken to the parent on the planter wall, up to the sign, and back.
    name: 'The Corner',
    world: 'corner',
    duration: 16,
    keys: [
      { pos: [-42, 24, 104], look: [10, 52, -26], fov: 50 },
      { pos: [-18, 12, 42], look: [2, 7, 2], fov: 46 },
      { pos: [20, 16, 38], look: [-16, 12, -22], fov: 46 },
      { pos: [-26, 38, 50], look: [9, 84, -8], fov: 42, dur: 3 },
      { pos: [-66, 64, 98], look: [10, 32, -28], fov: 48, dur: 2.5 }, // crane back to the street view
    ],
  },
  {
    // the $1 day trip: close on a kid at a train window, pull back to the whole train, then
    // up overhead as it crosses a river bridge past the words. Fades in and out of black.
    name: '$1 day trip',
    world: 'train',
    duration: TRAIN_LOOP,
    camera: trainCamera,
    fade: { in: 1.2, out: 1.4 },
    far: 2600, // it pulls a long way back
  },
];

// when each key is reached (s), plus the scene length at the end for the way back to key 0
function keyStarts({ keys, duration }) {
  const fixed = keys.reduce((a, k) => a + (k.dur ?? 0), 0);
  const free = keys.filter((k) => k.dur == null).length;
  const share = free ? (duration - fixed) / free : 0;
  const starts = [0];
  for (const k of keys) starts.push(starts.at(-1) + (k.dur ?? share));
  if (Math.abs(starts.at(-1) - duration) > 1e-6) console.warn(`camera keys don't add up to ${duration}s`);
  return starts;
}
const closed = (pts) => new THREE.CatmullRomCurve3(pts, true, 'centripetal');
const ARC_PER_KEY = 200;
function posCurve(keys) {
  const c = closed(keys.map((k) => new THREE.Vector3(...k.pos)));
  c.arcLengthDivisions = keys.length * ARC_PER_KEY;
  return c;
}
const curves = SCENES.map((s) => s.keys && ((pos) => ({
  starts: keyStarts(s),
  pos,
  keyLen: s.keys.map((_, i) => pos.getLengths()[i * ARC_PER_KEY]).concat(pos.getLength()), // path distance at each key
  look: closed(s.keys.map((k) => new THREE.Vector3(...k.look))),
  fov: closed(s.keys.map((k) => new THREE.Vector3(k.fov, 0, 0))),
}))(posCurve(s.keys)));

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x); // ease in-out sine
const tmp = new THREE.Vector3();
// snap an angular frequency so it repeats a whole number of times per `loop` seconds
const snapW = (w, loop) => Math.max(1, Math.round((w * loop) / (2 * Math.PI))) * ((2 * Math.PI) / loop);

// Shots are framed for 16:9. For taller formats (Instagram) camera.userData.zoomOut widens
// the view (scales tan(fov/2)) so the action still fits across the narrower frame.
const DEG = Math.PI / 180;
function setFov(camera, fov) {
  camera.fov = (2 * Math.atan(Math.tan((fov * DEG) / 2) * (camera.userData.zoomOut ?? 1))) / DEG;
}

export function applyCamera(camera, sceneIdx, t) {
  const s = SCENES[sceneIdx];
  camera.far = s.far ?? 400;
  if (s.camera) return s.camera(camera, t);
  const D = s.duration;
  const c = curves[sceneIdx], st = c.starts;
  const tl = ((t % D) + D) % D;
  let i = 0;
  while (i < st.length - 2 && tl >= st[i + 1]) i++;
  // distance along the path as a smooth function of time (cubic Hermite, monotone, wrapping),
  // so the camera's speed changes gently between segments instead of jolting at each key
  const n = st.length - 1, h = st[i + 1] - st[i], x = (tl - st[i]) / h, ks = c.keyLen;
  const w = (j) => ((j % n) + n) % n;
  const seg = (j) => ks[w(j) + 1] - ks[w(j)];
  const speed = (j) => seg(j) / (st[w(j) + 1] - st[w(j)]);
  const tan = (j) => { const a = speed(j - 1), b = speed(j); return a + b > 0 ? (2 * a * b) / (a + b) : 0; };
  const m0 = (tan(i) * h) / seg(i), m1 = (tan(i + 1) * h) / seg(i); // in units of this segment
  const x2 = x * x, x3 = x2 * x;
  const f = (x2 * 3 - x3 * 2) + (x3 - 2 * x2 + x) * m0 + (x3 - x2) * m1;
  const u = c.pos.getUtoTmapping((ks[i] + f * seg(i)) / ks[n]); // arc length -> curve parameter
  c.pos.getPoint(u, camera.position);
  // a tiny handheld wobble so it doesn't feel robotic (repeats with the loop)
  camera.position.x += Math.sin(t * snapW(1.7, D)) * 0.08;
  camera.position.y += Math.sin(t * snapW(2.3, D)) * 0.06;
  c.look.getPoint(u, tmp);
  camera.lookAt(tmp);
  setFov(camera, c.fov.getPoint(u, tmp).x);
  camera.updateProjectionMatrix();
}

// Park chase orbit (seconds within the LOOP): hold behind, sweep right to the front, dwell,
// sweep round the left, hold behind again. Each move eases in and out, so the camera is at
// rest at the loop point and the end joins the start with no jump.
// It orbits the pair (parent ~z 32, kid ~z -42). Out at the sides it rises above the trees,
// since the whole park streams through there; front and back it sits over the path.
function parkOrbit(camera, t) {
  const L = LOOP;
  const T1 = 0.08 * L, T2 = 0.38 * L, T3 = 0.58 * L, T4 = 0.88 * L; // move, dwell, move
  const k = (a, b) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
  const th = Math.PI * k(T1, T2) + Math.PI * k(T3, T4); // 0 behind -> pi in front (via +x) -> 2pi
  const dwell = k(T2 - 1, T2 + 1) * (1 - k(T3 - 1, T3 + 1)); // 0..1, eased, while out front
  const side = Math.sin(th) ** 2;
  const r = 92 - dwell * 8;
  const cz = -5;
  camera.position.set(Math.sin(th) * r, 58 + side * 40 - dwell * 24, cz + Math.cos(th) * r);
  const w = (2 * Math.PI) / L;
  camera.position.x += Math.sin(t * w * 5) * 0.12; // handheld drift, repeats with the loop
  camera.position.y += Math.sin(t * w * 7) * 0.08;
  tmp.set(0, 12 + dwell * 6, cz - 6 + dwell * 8);
  camera.lookAt(tmp);
  setFov(camera, 42 - dwell * 4);
  camera.updateProjectionMatrix();
}
