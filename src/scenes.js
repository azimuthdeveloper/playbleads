import * as THREE from 'three';

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
    // little planet of a park. High behind, round the side (above the trees: everything in
    // the park streams through the side lanes), down low in front of the kid, in close on the
    // parent's face, then pull right up and away to show it never ends.
    name: 'Park chase',
    world: 'park',
    duration: 16,
    keys: [
      { t: 0, pos: [0, 70, 110], look: [0, 6, -20], fov: 40 },
      { t: 3.5, pos: [62, 76, -6], look: [0, 12, -6], fov: 42 },
      { t: 5.5, pos: [10, 52, -108], look: [0, 14, -12], fov: 38 },
      { t: 7.2, pos: [3, 22, -124], look: [0, 15, -8], fov: 34 },
      { t: 10.5, pos: [3, 40, -18], look: [3, 35, 34], fov: 40 },
      { t: 16, pos: [-4, 95, 160], look: [0, 0, -60], fov: 46 },
    ],
  },
];

const curves = SCENES.map((s) => ({
  pos: new THREE.CatmullRomCurve3(s.keys.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal'),
  look: new THREE.CatmullRomCurve3(s.keys.map((k) => new THREE.Vector3(...k.look)), false, 'centripetal'),
}));

const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x); // ease in-out sine
const tmp = new THREE.Vector3();

export function applyCamera(camera, sceneIdx, t) {
  const s = SCENES[sceneIdx];
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
