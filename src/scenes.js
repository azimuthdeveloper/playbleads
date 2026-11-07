import * as THREE from 'three';
import { LOOP } from './park.js';

// Camera scripts. Each key: t (s), pos, look, fov.
// Positions/targets are joined with Catmull-Rom curves so the move never stops
// at a key; the whole move is eased in at the start and out at the end.
export const SCENES = [
  {
    name: 'Wide establishing',
    duration: 12,
    keys: [
      { t: 0, pos: [6, 40, 64], look: [0, 16, 8], fov: 40 },
      { t: 4, pos: [22, 40, 46], look: [0, 14, 0], fov: 42 },
      { t: 8, pos: [34, 30, 22], look: [0, 13, -8], fov: 44 },
      { t: 12, pos: [28, 20, 4], look: [-2, 12, -14], fov: 46 },
    ],
  },
  {
    name: "Kid's eye view",
    duration: 12,
    keys: [
      { t: 0, pos: [11, 10, 8], look: [2, 12, -12], fov: 50 },
      { t: 4, pos: [12, 16, -3], look: [2, 16, -20], fov: 46 },
      { t: 8, pos: [7, 20, -11], look: [0, 18, -24], fov: 42 },
      { t: 12, pos: [0, 18, -13], look: [0, 18, -25], fov: 40 },
    ],
  },
  {
    name: 'The exhausted parent',
    duration: 12,
    keys: [
      { t: 0, pos: [-4, 20, 4], look: [0, 18, -25], fov: 45 },
      { t: 3.5, pos: [-20, 28, -2], look: [0, 18, 8], fov: 45 },
      { t: 7, pos: [-22, 32, -10], look: [0, 21, 10], fov: 44 },
      { t: 12, pos: [-28, 34, -22], look: [1, 18, 6], fov: 42 },
    ],
  },
  {
    // the next morning: library playgroup. Wide on the circle, down to kid height
    // for the story, then round to the parent, coffee in hand.
    name: 'Library story time',
    world: 'library',
    duration: 16,
    keys: [
      { t: 0, pos: [-28, 54, 33], look: [2, 6, -6], fov: 50 },
      { t: 5, pos: [14, 16, 22], look: [-2, 16, -20], fov: 46 },
      { t: 10, pos: [1, 34, 3], look: [13, 19, 20], fov: 48 },
      { t: 16, pos: [5, 32, 2], look: [17, 27, 25], fov: 36 },
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
];

const curves = SCENES.map((s) => s.keys && ({
  pos: new THREE.CatmullRomCurve3(s.keys.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal'),
  look: new THREE.CatmullRomCurve3(s.keys.map((k) => new THREE.Vector3(...k.look)), false, 'centripetal'),
}));

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x); // ease in-out sine
const tmp = new THREE.Vector3();

export function applyCamera(camera, sceneIdx, t) {
  const s = SCENES[sceneIdx];
  if (s.camera) return s.camera(camera, t);
  const keys = s.keys;
  const te = ease(Math.min(1, Math.max(0, t / s.duration))) * s.duration;
  let i = 0;
  while (i < keys.length - 2 && te > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const local = Math.min(1, Math.max(0, (te - a.t) / (b.t - a.t)));
  const u = (i + local) / (keys.length - 1);

  curves[sceneIdx].pos.getPoint(u, camera.position);
  // a tiny handheld wobble so it doesn't feel robotic
  camera.position.x += Math.sin(t * 1.7) * 0.08;
  camera.position.y += Math.sin(t * 2.3) * 0.06;
  curves[sceneIdx].look.getPoint(u, tmp);
  camera.lookAt(tmp);
  camera.fov = a.fov + (b.fov - a.fov) * local;
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
  camera.fov = 42 - dwell * 4;
  camera.updateProjectionMatrix();
}
