import * as THREE from 'three';
import { VoxGroup, setSeed, rand } from './voxel.js';
import { buildToddler, buildParent, TODDLER_LOOKS } from './characters.js';

// $1 day trip: a three-car Queensland Rail-style electric train out on a sunny day.
// Opens close on our kid with their nose to the window, pulls slowly back along the train,
// then rises overhead as it crosses a river bridge past the words "$1 DAY TRIP".
// Fades in from black and out to black, so the loop point is a black frame.
//
// World axes: the train runs along +x (left to right as seen from the camera side, +z).
// Ground top y = 0, rail top RAIL_Y. The river runs along z, |x| < ~205, water at y = -40;
// the bridge spans |x| < 280. The words hover over the water on the +z side of the bridge.

export const TRAIN_LOOP = 20;
export const SPEED = 35;               // units/s
const T_MEET = 15;                     // when the middle car passes the middle of the words
export const midCarX = (t) => SPEED * (t - T_MEET);

const HALF_L = 88, HALF_W = 30, PITCH = 180; // car half length / half width, car spacing
const F = 12;                          // floor, above rail top
const ROOF = 57;                       // ceiling
export const RAIL_Y = 5;
const WIRE_Y = RAIL_Y + 72;            // overhead contact wire
const WIN0 = F + 14, WIN1 = F + 38;    // window opening, y
const BAND0 = F + 11, BAND1 = F + 41;  // charcoal window band
const DOORS = [-40, 40];
const WATER_Y = -40;
const X0 = -1152, X1 = 752, Z0 = -400, Z1 = 500; // the voxel world
const ROAD = { z0: 140, z1: 164, x1: -300 };

// Queensland Rail-ish livery: white body, charcoal window band, yellow doors and nose.
const C = {
  white: 0xf2f3f1, band: 0x252a31, skirt: 0x4d5258, roof: 0xc4c8cc, yellow: 0xffc20e,
  glass: 0x14181e, floor: 0x5a6676, wallIn: 0xd6dad8, ceiling: 0xeceeee,
  seat: 0x34507a, seatGrey: 0x8b919c, seatRed: 0xc8433a, rail: 0xffc20e,
};

const hash = (a, b, c = 0) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sm = (x) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();

// ------------------------------------------------------------------ the words
const FONT = {
  $: ['..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..'],
  1: ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
};
export const TEXT_Y = 12;          // underside of the letters
const TEXT_TOP = HALF_W + 18;      // nearest edge of the words to the track (z)
const lineWidth = (str) => [...str].reduce((w, ch, i) => w + (ch === ' ' ? 3 : FONT[ch][0].length) + (i ? 1 : 0), 0);

// Wide frames get one line ("$1" bigger, sat on the same baseline); the taller Instagram
// frames stack "$1" / "DAY" / "TRIP" so the words fill the narrow frame. Returns each glyph's
// top-left corner (x, z) and pixel size P, plus the bounding box with the outline.
export function textLayout(aspect) {
  const tall = aspect < 1.25;
  const glyphs = [];
  const place = (line, x, z) => {
    let cx = x;
    [...line.str].forEach((ch, i) => {
      if (i) cx += line.P;
      if (ch === ' ') { cx += 3 * line.P; return; }
      glyphs.push({ ch, P: line.P, x: cx, z });
      cx += FONT[ch][0].length * line.P;
    });
  };
  const width = (l) => lineWidth(l.str) * l.P;
  if (tall) {
    let z = TEXT_TOP;
    for (const l of [{ str: '$1', P: 14 }, { str: 'DAY', P: 11 }, { str: 'TRIP', P: 11 }]) {
      place(l, -width(l) / 2, z);
      z += 7 * l.P + 14;
    }
  } else {
    const big = { str: '$1', P: 8 }, small = { str: 'DAY TRIP', P: 6 };
    const gap = 3 * small.P, w = width(big) + gap + width(small);
    place(big, -w / 2, TEXT_TOP);
    place(small, -w / 2 + width(big) + gap, TEXT_TOP + 7 * (big.P - small.P));
  }
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const g of glyphs) {
    box.x0 = Math.min(box.x0, g.x - g.P); box.x1 = Math.max(box.x1, g.x + (FONT[g.ch][0].length + 1) * g.P);
    box.z0 = Math.min(box.z0, g.z - g.P); box.z1 = Math.max(box.z1, g.z + 8 * g.P);
  }
  return { tall, glyphs, box };
}

function buildWords(layout) {
  const group = new THREE.Group();
  const pivots = [];
  for (const g of layout.glyphs) {
    const rows = FONT[g.ch], w = rows[0].length;
    const on = (i, j) => j >= 0 && j < 7 && i >= 0 && i < w && rows[j][i] === '#';
    const money = g.ch === '$' || g.ch === '1';
    const top = money ? C.yellow : 0xffffff, side = money ? 0xe09a00 : 0xcfd6de, edge = 0x1b2130;
    const v = new VoxGroup('glyph', g.P);
    for (let j = -1; j <= 7; j++)
      for (let i = -1; i <= w; i++) {
        if (on(i, j)) { v.set(i, 1, j, top, 0.03); v.set(i, 0, j, side, 0.03); continue; }
        let near = false;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) near ||= on(i + a, j + b);
        if (near) v.set(i, 0, j, edge, 0.03); // dark outline, so the words read over anything
      }
    v.build();
    v.position.set(-(w * g.P) / 2, 0, -(7 * g.P) / 2);
    const pivot = new THREE.Group();
    pivot.position.set(g.x + (w * g.P) / 2, TEXT_Y, g.z + (7 * g.P) / 2);
    pivot.add(v);
    group.add(pivot);
    pivots.push(pivot);
  }
  return { group, pivots };
}

// ------------------------------------------------------------------ camera
// 0-2.4 s close on the kid at the window; 2.4-10.6 a slow pull back (distance grows
// exponentially, so it feels steady) round to the whole train; 9.8-14 it lets the train go
// and rises over the river to frame the train and the words; then a slow drift to the end.
const DEG = Math.PI / 180;
const effFov = (camera, fov) => (2 * Math.atan(Math.tan((fov * DEG) / 2) * (camera.userData.zoomOut ?? 1))) / DEG;
const KID_LOCAL = new THREE.Vector3(-13, F + 12, 22.4); // in the middle car
const DIR0 = new THREE.Vector3(0.26, 0.05, 1).normalize();
const DIR1 = new THREE.Vector3(-0.25, 0.4, 1).normalize();
const D0 = 30, D1 = 560;
const PITCH_O = 78 * DEG, FOV_O = 40;
const cA = new THREE.Vector3(), cB = new THREE.Vector3(), lookB = new THREE.Vector3(), posB = new THREE.Vector3();
const lookO = new THREE.Vector3(), posO = new THREE.Vector3(), dir = new THREE.Vector3();
export const camFocus = new THREE.Vector3(); // where the camera's looking, for the sun's shadow box

export function trainCamera(camera, t) {
  // A + B: rides along with the train
  const k = ease((t - 2.4) / 8.2);
  cA.set(midCarX(t) + KID_LOCAL.x, RAIL_Y + KID_LOCAL.y + 12, 25.5); // their face
  cB.set(midCarX(t) + 40, RAIL_Y + 30, 0);
  lookB.lerpVectors(cA, cB, ease(k * 1.25));
  dir.lerpVectors(DIR0, DIR1, k).normalize();
  posB.copy(lookB).addScaledVector(dir, D0 * Math.pow(D1 / D0, k));
  const fovB = effFov(camera, 30 + 10 * k);

  // C: overhead, fitted to the words and the train for this frame shape
  const { box, tall } = textLayout(camera.aspect);
  const tanV = Math.tan((FOV_O * DEG) / 2);
  const z0 = -HALF_W - 22, z1 = box.z1 + 6;
  const W = (box.x1 - box.x0) * (tall ? 1.3 : 1.2), H = (z1 - z0) * 1.12; // the near (lower) edge looms larger
  const hold = Math.max(0, t - 14);
  const h = Math.max(W / (2 * tanV * camera.aspect), H / (2 * tanV)) * (1 - hold * 0.008); // a slow push in
  lookO.set((box.x0 + box.x1) / 2, TEXT_Y * 0.5, (z0 + z1) / 2);
  posO.set(0, Math.sin(PITCH_O), Math.cos(PITCH_O)).multiplyScalar(h).add(lookO);

  const m = ease((t - 9.8) / 4.2);
  camera.position.lerpVectors(posB, posO, m);
  camFocus.lerpVectors(lookB, lookO, m);
  const w = (2 * Math.PI) / TRAIN_LOOP; // a touch of handheld drift
  camera.position.x += Math.sin(t * w * 3) * 0.06 * (1 + k * 4);
  camera.position.y += Math.sin(t * w * 5) * 0.05 * (1 + k * 4);
  camera.up.set(0, 1, 0);
  camera.lookAt(camFocus);
  camera.fov = fovB + (FOV_O - fovB) * m;
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ fast instanced voxels
// For the big static stuff: push(x, y, z, size, color) then flush() into one InstancedMesh.
function cubes({ roughness = 0.9, metalness = 0, castShadow = true, receiveShadow = true } = {}) {
  const P = [];
  return {
    push(x, y, z, s, c) { P.push(x, y, z, s, c); },
    flush(parent) {
      const n = P.length / 5;
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness, metalness }), n);
      const m = new THREE.Matrix4(), col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const o = i * 5, s = P[o + 3];
        m.makeScale(s, s, s).setPosition(P[o], P[o + 1], P[o + 2]);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, col.set(P[o + 4]));
      }
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.computeBoundingSphere();
      parent.add(mesh);
      return mesh;
    },
  };
}

// ------------------------------------------------------------------ terrain
const bankX = (z) => 205 + 10 * Math.sin(z * 0.011) + 6 * Math.sin(z * 0.027 + 1.3);
function groundY(x, z) {
  const ax = Math.abs(x), b = bankX(z);
  if (ax < b) return WATER_Y;
  if (ax < b + 68) return Math.round((WATER_Y * (1 - sm((ax - b) / 68))) / 4) * 4;
  return 0;
}
const onRoad = (x, z) => x < ROAD.x1 && z >= ROAD.z0 && z < ROAD.z1;

function buildGround(scene) {
  const land = cubes(), water = cubes({ roughness: 0.22, metalness: 0.05, castShadow: false });
  const S = 4;
  const top = (ix, iz) => groundY((ix + 0.5) * S, (iz + 0.5) * S);
  for (let ix = X0 / S; ix < X1 / S; ix++)
    for (let iz = Z0 / S; iz < Z1 / S; iz++) {
      const x = (ix + 0.5) * S, z = (iz + 0.5) * S, y = top(ix, iz), h = hash(ix, iz);
      if (y === WATER_Y && Math.abs(x) < bankX(z)) {
        const shallow = Math.abs(x) > bankX(z) - 8;
        const ripple = Math.sin(x * 0.09 + Math.sin(z * 0.05) * 2) > 0.93;
        water.push(x, y - S / 2, z, S, shallow ? 0x4b93ad : ripple || h < 0.05 ? 0x3d86bb : h < 0.5 ? 0x2c6fa0 : 0x2a6a99);
        continue;
      }
      let c;
      const n = Math.sin(x * 0.013 + 2) * Math.sin(z * 0.017) + Math.sin(x * 0.041 + z * 0.023) * 0.4; // patchy dry grass
      if (y < -28) c = h < 0.4 ? 0xd3bf92 : h < 0.75 ? 0xc6b083 : 0x8f887c;      // sandy, rocky foreshore
      else if (y < 0) c = h < 0.15 ? 0x9a8f7e : h < 0.6 ? 0x5f9440 : 0x6a9c46;   // banks
      else if (Math.abs(z) < 22) c = h < 0.5 ? 0x7d7466 : 0x857c6d;              // under the ballast
      else if (onRoad(x, z)) {
        const dz = z - (ROAD.z0 + ROAD.z1) / 2;
        c = Math.abs(dz) < 2 && Math.floor(x / 12) % 2 === 0 ? 0xf2f2f2 : Math.abs(dz) > 10 ? 0x5a5d61 : 0x46494e;
      } else c = n > 0.55 ? (h < 0.5 ? 0xa7ae5e : 0x9da656) : h < 0.12 ? 0x8fb552 : h < 0.55 ? 0x76a646 : 0x6d9c3f;
      // a column down to the lowest neighbour, so the banks are solid
      const lo = Math.min(y - S, top(ix - 1, iz), top(ix + 1, iz), top(ix, iz - 1), top(ix, iz + 1));
      for (let yy = y; yy > Math.max(lo, y - 6 * S); yy -= S) land.push(x, yy - S / 2, z, S, yy === y ? c : shade(c, yy > y - 2 * S ? 0.8 : 0.62));
    }
  land.flush(scene);
  water.flush(scene);

  // past the voxels: flat grass to the horizon either side, the river carrying on between
  const grass = new THREE.MeshStandardMaterial({ color: 0x6f9e41, roughness: 1 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(6000, 9000), grass);
    p.rotation.x = -Math.PI / 2;
    p.position.set(s * (296 + 3000), -2, 0);
    p.receiveShadow = true;
    scene.add(p);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(9000, 42), new THREE.MeshStandardMaterial({ color: 0x5f8a3c, roughness: 1 }));
    wall.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    wall.position.set(s * 296, -21, 0);
    scene.add(wall);
  }
  const river = new THREE.Mesh(new THREE.PlaneGeometry(560, 9000), new THREE.MeshStandardMaterial({ color: 0x2c6fa0, roughness: 0.25 }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, WATER_Y - 1, 0);
  scene.add(river);
}

// ------------------------------------------------------------------ track, bridge, wires
function buildTrack(scene) {
  const ballast = new VoxGroup('ballast', 2);
  for (let x = X0; x < X1; x += 2)
    for (let z = -18; z < 18; z += 2) {
      const h = hash(x, z, 3);
      const edge = Math.abs(z + 1) > 14;
      ballast.set(x / 2, edge ? -1 : 0, z / 2, h < 0.33 ? 0x8a8178 : h < 0.66 ? 0x9c948a : 0x766e65, 0.04);
    }
  ballast.build({ castShadow: false });
  scene.add(ballast);

  const steel = new VoxGroup('track', 1);
  for (let x = X0; x < X1; x += 5) steel.box(x, 2, -15, 2, 1, 30, 0xa8a39a, 0.05); // concrete sleepers
  for (const z of [-13, 12]) for (let x = X0; x < X1; x++) { steel.set(x, 3, z, 0x6f6a66, 0.03); steel.set(x, 4, z, 0xc9ccd1, 0.02); }
  steel.build();
  scene.add(steel);

  // the bridge: a concrete deck on piers in the river, steel railings each side
  const deck = new VoxGroup('bridgeDeck', 2);
  const BX = 280;
  deck.boxFn(-BX / 2, -5, -18, BX, 5, 36, (x, y, z, i, j, k) => {
    if (j === 4) return 0xb7b8b2;
    if (k === 0 || k === 35) return j === 3 ? 0x8d8f8a : 0xa3a59f;
    return 0x9a9c96;
  }, 0.03);
  for (const px of [-150, -75, 0, 75, 150])
    deck.fill(px - 6, WATER_Y - 4, -32, px + 6, -10, 32, (x, y, z) => Math.abs(z) < 26, (x, y) => (y < WATER_Y + 4 ? 0x7f817c : 0xa1a39d), 0.04);
  deck.build();
  scene.add(deck);
  const rails = new VoxGroup('bridgeRails', 1);
  for (const z of [-36, 35]) {
    for (let x = -BX; x < BX; x++) { rails.set(x, 8, z, 0x5f6f66, 0.03); rails.set(x, 4, z, 0x5f6f66, 0.03); }
    for (let x = -BX; x < BX; x += 8) rails.box(x, 0, z, 1, 8, 1, 0x4f5d55, 0.03);
  }
  rails.build();
  scene.add(rails);

  // overhead wiring: masts on the far (-z) side, a cantilever out over the track
  const masts = new VoxGroup('masts', 1);
  for (let x = X0 + 40; x < X1; x += 90) {
    masts.box(x, 0, -38, 2, 84, 2, 0x8a9096, 0.03);
    masts.box(x, 82, -36, 1, 1, 40, 0x8a9096, 0.03);
    masts.cap(x + 0.5, 72, -37, x + 0.5, 82, -14, 0.5, 0x7a8086, 0.02);
    masts.box(x, WIRE_Y, 1, 1, 82 - WIRE_Y, 1, 0x50555a, 0.02);
    for (let y = 70; y < 78; y += 2) masts.set(x, y, -36, 0x6a5040, 0); // insulator
  }
  masts.build();
  scene.add(masts);
  const wire = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }));
  wire.position.set((X0 + X1) / 2, WIRE_Y, 0.5);
  scene.add(wire);
}

// ------------------------------------------------------------------ scenery
function gumTree(h) {
  const g = new VoxGroup('gum', 2);
  const BARK = (x, y, z) => (hash(Math.floor(x), Math.floor(y), Math.floor(z)) < 0.3 ? 0xb8b1a2 : 0xe4dfd2);
  g.cap(0, 0, 0, 1.5, h, 0.5, 2.6, BARK);
  g.cap(1, h * 0.55, 0, 11, h * 0.85, 4, 1.5, BARK);
  g.cap(1, h * 0.65, 0, -9, h * 0.95, -5, 1.4, BARK);
  const LEAF = [0x6f8c4a, 0x5f7c3e, 0x86a05a];
  for (const [bx, by, bz, r] of [[11, h * 0.9, 4, 9], [-9, h, -5, 9], [1, h + 6, 0, 10], [4, h * 0.75, -8, 7]])
    g.ell(bx, by, bz, r, r * 0.6, r, (x, y, z) => {
      const k = hash(Math.floor(x / 2), Math.floor(y / 2), Math.floor(z / 2));
      return k < 0.2 ? null : LEAF[Math.floor(k * 3) % 3]; // sparse, gappy gum canopy
    }, 0.06);
  g.build();
  return g;
}
function roundTree(h, r, leaves, trunk = 0x6a4a2c) {
  const g = new VoxGroup('tree', 2.5);
  g.cap(0, 0, 0, 0, h, 0, 2.2, trunk);
  g.cap(0, h * 0.7, 0, r * 0.5, h + 2, r * 0.2, 1.3, trunk);
  g.cap(0, h * 0.7, 0, -r * 0.5, h + 3, -r * 0.1, 1.3, trunk);
  for (const [bx, by, bz, br] of [[0, h + 4, 0, r], [r * 0.55, h + 1, r * 0.3, r * 0.7], [-r * 0.55, h + 2, -r * 0.3, r * 0.72]])
    g.ell(bx, by, bz, br, br * 0.62, br, (x, y, z) => {
      const k = hash(Math.floor(x / 2.5), Math.floor(y / 2.5), Math.floor(z / 2.5));
      return leaves[k < 0.7 ? Math.floor(k * 10) % (leaves.length - 1) : leaves.length - 1];
    }, 0.06);
  g.build();
  return g;
}
function palm(h) {
  const g = new VoxGroup('palm', 1.5);
  g.cap(0, 0, 0, 3, h, 1, 1.4, (x, y) => (Math.floor(y / 1.5) % 3 === 0 ? 0x8a7350 : 0xa38a62));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.cap(3, h, 1, 3 + Math.cos(a) * 12, h - 5, 1 + Math.sin(a) * 12, 1.1, i % 2 ? 0x4f8a3a : 0x5f9a44, 0.05);
  }
  g.build();
  return g;
}
const TREES = [
  (s) => gumTree(34 + s * 18),
  (s) => roundTree(16 + s * 6, 14 + s * 4, [0x9b7fd8, 0x8a6cc8, 0xb39ae6, 0x6f8c4a]), // jacaranda
  (s) => roundTree(14 + s * 5, 15 + s * 3, [0xe0442e, 0xf06a2a, 0xd23a2a, 0x5f8c3a]), // poinciana
  (s) => roundTree(12 + s * 6, 12 + s * 4, [0x2f6a2f, 0x3d7a35, 0x356f30, 0x2a5e2a]), // mango
  (s) => gumTree(40 + s * 14),
  (s) => palm(26 + s * 10),
];

// a Queenslander: up on stumps with lattice, weatherboards, a deep verandah, tin roof. Faces -z.
function queenslander(roofCol, trim) {
  const v = new VoxGroup('house', 2);
  const W = 30, D = 22; // in cells (60 x 44 units)
  // stumps + lattice
  v.boxFn(-W / 2, 0, -D / 2, W, 6, D, (x, y, z, i, j, k) => {
    const rim = i === 0 || i === W - 1 || k === 0 || k === D - 1;
    if (!rim) return null;
    return (i + j + k) % 2 ? 0xf1ede2 : null;
  }, 0.03);
  for (const [i, k] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1], [W / 2, 0], [W / 2, D - 1]]) v.box(-W / 2 + i, 0, -D / 2 + k, 1, 6, 1, 0x7a6a5a);
  // floor + walls, inset behind a verandah along the front
  const VD = 6;
  v.box(-W / 2, 6, -D / 2, W, 1, D, 0x8a6a4a);
  v.boxFn(-W / 2 + 1, 7, -D / 2 + VD, W - 2, 10, D - VD - 1, (x, y, z, i, j, k) => {
    const front = k === 0, sideWall = i === 0 || i === W - 3;
    if (!(front || sideWall || k === D - VD - 2 || j === 9)) return null;
    const win = (front && j >= 2 && j <= 6 && (i % 7 === 2 || i % 7 === 3 || i % 7 === 4)) || (sideWall && j >= 3 && j <= 6 && k % 6 === 3);
    if (win) return j === 2 || j === 6 ? trim : 0x2a3440;
    if (front && j <= 6 && (i === Math.floor(W / 2) - 1 || i === Math.floor(W / 2))) return j === 6 ? trim : 0x6a4a34; // front door
    return j % 2 ? 0xf6f3ea : 0xe6e2d6; // weatherboards
  }, 0.03);
  // verandah: posts, railing, a bit of fretwork
  for (let i = 0; i < W; i += 5) v.box(-W / 2 + i, 7, -D / 2, 1, 10, 1, 0xf6f3ea);
  v.box(-W / 2 + W - 1, 7, -D / 2, 1, 10, 1, 0xf6f3ea);
  for (let i = 0; i < W; i++) { v.set(-W / 2 + i, 9, -D / 2, trim); if (i % 2) v.set(-W / 2 + i, 8, -D / 2, 0xf6f3ea); v.set(-W / 2 + i, 16, -D / 2, i % 2 ? trim : 0xf6f3ea); }
  // front stairs
  for (let s = 0; s < 6; s++) v.box(-2, s, -D / 2 - 6 + s, 4, 1, 1, 0x8a6a4a);
  // hip roof in corrugated tin
  for (let l = 0; l < 8; l++) {
    const x0 = -W / 2 - 1 + l, z0 = -D / 2 - 1 + l, w = W + 2 - 2 * l, d = D + 2 - 2 * l;
    if (w <= 0 || d <= 0) break;
    v.boxFn(x0, 17 + l, z0, w, 1, d, (x, y, z, i, j, k) => (i === 0 || k === 0 || i === w - 1 || k === d - 1 || l === 7 || w <= 2 || d <= 2 ? ((i + k) % 2 ? roofCol : shade(roofCol, 0.85)) : null), 0.03);
  }
  v.box(W / 2 - 6, 22, 0, 2, 5, 2, 0xb0b0b0); // a chimney-ish flue
  v.build();
  return v;
}

function buildScenery(scene) {
  setSeed(4242);
  const taken = [];
  const free = (x, z, r) => {
    if (Math.abs(z) < 48 + r) return false;                                  // track corridor
    if (x > -760 && x < -60 && z > 0 && z < 190 + r) return false;            // where the camera pulls back through
    if (Math.abs(x) < bankX(z) + 74 + r * 0.5) return false;                  // the river valley
    if (x < ROAD.x1 + r && z > ROAD.z0 - r - 4 && z < ROAD.z1 + r + 4) return false; // road
    return taken.every(([tx, tz, tr]) => (tx - x) ** 2 + (tz - z) ** 2 > (tr + r) ** 2);
  };
  // houses: along the road, and backing onto the line on the far side (seen through the windows)
  const ROOFS = [0xb8452f, 0x4e7a52, 0xa9b0b5, 0x8a3a2a, 0x3f6f8a];
  const TRIM = [0x4e7a52, 0xb8452f, 0x3f6f8a, 0xe0b040];
  const houseAt = (x, z, yaw) => {
    if (!free(x, z, 40)) return;
    taken.push([x, z, 42]);
    const h = queenslander(ROOFS[Math.floor(rand() * ROOFS.length)], TRIM[Math.floor(rand() * TRIM.length)]);
    h.position.set(x, 0, z);
    h.rotation.y = yaw;
    scene.add(h);
  };
  for (let x = -1080; x < -340; x += 105 + rand() * 30) houseAt(x, 215 + rand() * 20, 0);
  for (let x = -1060; x < -320; x += 115 + rand() * 40) houseAt(x, -130 - rand() * 30, Math.PI);
  for (let x = 330; x < 720; x += 120 + rand() * 30) houseAt(x, -135 - rand() * 25, Math.PI);
  for (let x = 330; x < 720; x += 120 + rand() * 30) houseAt(x, 150 + rand() * 40, 0);

  // trees: denser near the line, where the camera is
  const tryTree = (x, z) => {
    const r = 16;
    if (!free(x, z, r)) return;
    taken.push([x, z, r]);
    const kind = Math.floor(rand() * TREES.length);
    const t = TREES[kind](rand());
    t.position.set(x, 0, z);
    t.rotation.y = rand() * Math.PI * 2;
    scene.add(t);
  };
  for (let i = 0; i < 260; i++) {
    const near = i < 150;
    tryTree(X0 + rand() * (X1 - X0), near ? (rand() < 0.5 ? -1 : 1) * (60 + rand() * 120) : Z0 + rand() * (Z1 - Z0));
  }
  // a few gums down the river banks
  for (let i = 0; i < 14; i++) {
    const s = i % 2 ? 1 : -1, z = -380 + rand() * 860;
    if (Math.abs(z) < 60) continue;
    const t = gumTree(28 + rand() * 12);
    const x = s * (bankX(z) + 20 + rand() * 30);
    t.position.set(x, groundY(x, z), z);
    scene.add(t);
  }
}

// ------------------------------------------------------------------ vehicles on the move
function car(col) {
  const v = new VoxGroup('car', 1);
  v.box(-9, 2, -4, 18, 4, 9, col);
  v.boxFn(-5, 6, -4, 10, 3, 9, (x, y, z, i, j, k) => (k === 0 || k === 8 || i === 0 || i === 9 ? (j === 2 ? col : 0x2a3440) : col));
  for (const x of [-6, 4]) for (const z of [-5, 4]) v.box(x, 0, z, 3, 3, 1, 0x1e1e1e);
  v.set(9, 4, -3, 0xfff2c0, 0); v.set(9, 4, 3, 0xfff2c0, 0);
  v.build();
  return v;
}
function ferry() {
  const v = new VoxGroup('ferry', 1);
  for (const x of [-7, 4]) v.boxFn(x, 0, -26, 4, 4, 52, (px, py, pz, i, j, k) => (k < 2 && j > 1 ? null : j === 0 ? 0x2a4f7a : 0xf4f4f4)); // twin hulls
  v.box(-8, 4, -24, 16, 2, 48, 0xf4f4f4);
  v.boxFn(-7, 6, -16, 14, 6, 30, (x, y, z, i, j, k) => (j >= 1 && j <= 3 && k % 3 ? 0x1f3550 : j === 5 ? 0x2a4f7a : 0xffffff));
  v.box(-3, 12, 4, 6, 3, 8, 0xffffff);
  v.build();
  return v;
}

// ------------------------------------------------------------------ the train
const doorAt = (x) => DOORS.find((d) => Math.abs(x - d) < 7);
function windowX(x, cab) {
  const ax = Math.abs(x), cabEnd = cab && Math.sign(x) === cab;
  if (ax > 2 && ax < 31) return true;
  if (ax > 50 && ax < 68) return true;
  if (!cabEnd && ax > 71 && ax < 85) return true;
  return false;
}
// nose: tapers back above the windscreen sill, rounded at the corners
const noseMax = (y, z) => HALF_L - Math.max(0, y - (F + 16)) * 0.55 - (Math.abs(z) / HALF_W) ** 4 * 5;
const zLimit = (y) => (y < 10 ? HALF_W - 1.5 : y > 55 ? HALF_W - (y - 55) ** 2 / 2.4 : HALF_W);

function buildCar(cab, panto) {
  const g = new THREE.Group();
  const body = new VoxGroup('carBody', 1), roof = new VoxGroup('carRoof', 1);
  const interiorEnd = (x) => (cab && Math.sign(x) === cab ? 70 : HALF_L - 2);
  for (let x = -HALF_L; x < HALF_L; x++)
    for (let y = 6; y < 63; y++)
      for (let z = -HALF_W; z < HALF_W; z++) {
        const xc = x + 0.5, yc = y + 0.5, zc = z + 0.5, az = Math.abs(zc), ax = Math.abs(xc);
        if (az > zLimit(yc)) continue;
        const xs = cab ? xc * cab : -1; // distance towards the cab end
        const inNose = cab && xs > 70;
        if (inNose && xs > noseMax(yc, zc)) continue;
        const interior = yc >= F && yc < ROOF && az < HALF_W - 2 && ax < interiorEnd(xc);
        if (interior) continue;
        const side = az >= HALF_W - 2;
        const dc = side ? doorAt(xc) : undefined;
        if (side && !inNose && yc >= WIN0 && yc < WIN1 && windowX(xc, cab) && dc === undefined) continue; // window
        if (dc !== undefined && Math.abs(xc - dc) > 1.2 && Math.abs(xc - dc) < 5.8 && yc >= F + 18 && yc < F + 38) continue; // door window
        let c;
        const inner = (side && az < HALF_W - 1) || (!side && yc >= F && yc < ROOF && !inNose); // faces the inside
        if (yc >= ROOF) {
          c = yc < ROOF + 1 && az < HALF_W - 2 ? C.ceiling : (Math.floor(xc / 22) % 2 && Math.abs(xc % 22) < 0.6 ? 0xa9adb1 : C.roof);
          roof.set(x, y, z, c, 0.025);
          continue;
        }
        if (yc < F && yc >= F - 1 && az < HALF_W - 2 && ax < interiorEnd(xc)) c = hash(x, z) < 0.1 ? 0x66717f : C.floor;
        else if (inNose) {
          const front = xs > noseMax(yc, zc) - 2.5;
          if (yc >= F + 16 && yc < F + 44) c = front || yc >= WIN0 ? C.glass : C.white;      // wraparound windscreen
          else if (yc < F + 16) {
            c = front || yc < F + 4 ? C.yellow : C.white;
            if (front && yc > F + 5 && yc < F + 10 && az > 13 && az < 23) c = cab > 0 ? 0xfff6d8 : 0xff3a3a; // lights
          } else c = C.white;
        } else if (inner) c = yc >= BAND0 && yc < BAND1 ? 0x3a4048 : C.wallIn;
        else if (dc !== undefined && yc >= F - 1 && yc < F + 44) c = Math.abs(xc - dc) < 0.6 ? 0x1a1a1a : yc < F + 1 ? 0x2a2a2a : C.yellow;
        else if (yc >= BAND0 && yc < BAND1) c = C.band;
        else if (yc < 10) c = C.skirt;
        else if (yc >= F + 3 && yc < F + 4.2 && side) c = C.yellow; // thin yellow stripe
        else c = C.white;
        body.set(x, y, z, c, 0.025);
      }
  body.build();
  roof.build({ castShadow: false }); // let the sun in, the inside would be black otherwise
  g.add(body, roof);

  // roof gear: aircon pods, the pantograph on the middle car
  const gear = new VoxGroup('roofGear', 1);
  for (const x of [-50, 50]) {
    if (cab && Math.sign(x) === cab) continue;
    gear.boxFn(x - 15, 61, -13, 30, 4, 26, (px, py, pz, i, j, k) => (j === 3 && i > 2 && i < 27 && k > 4 && k < 21 && i % 3 === 0 ? 0x6a6f76 : 0xb4b8bd), 0.03); // aircon grille
  }
  if (cab) gear.boxFn(cab > 0 ? 20 : -50, 61, -11, 30, 3, 22, (x, y, z, i, j, k) => (j === 2 && i % 4 === 0 ? 0x8a8e94 : 0xb4b8bd), 0.03);
  gear.build({ castShadow: true });
  g.add(gear);
  if (panto) {
    const p = new VoxGroup('panto', 0.5);
    p.wbox(-6, 61, -8, 12, 1.5, 16, 0x3b3f45, 0.02);
    for (const z of [-6, 6]) {
      p.cap(-5, 63, z, 4, 68, z * 0.6, 0.4, 0x3b3f45, 0.02);
      p.cap(4, 68, z * 0.6, -2, 71.6, 0, 0.4, 0x3b3f45, 0.02);
    }
    p.cap(-2, 71.8, -10, -2, 71.8, 10, 0.5, 0x222222, 0.02);
    p.build();
    g.add(p);
  }

  // bogies + gangway bellows
  const under = new VoxGroup('bogies', 1);
  for (const bx of [-60, 60]) {
    under.box(bx - 14, 4, -15, 28, 4, 30, 0x2c2f33, 0.03);
    for (const wx of [-8, 8]) for (const z of [-14, 12]) {
      for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) if (a * a + b * b <= 20) under.box(bx + wx + a, 4.5 + b, z, 1, 1, 2, a * a + b * b > 12 ? 0x9a9a9a : 0x3a3a3a, 0.02);
    }
  }
  for (const s of [-1, 1]) {
    if (cab === s) { under.box(s > 0 ? HALF_L - 4 : -HALF_L, 6, -3, 4, 3, 6, 0x1e1e1e); continue; } // coupler
    under.boxFn(s > 0 ? HALF_L : -HALF_L - 2, F, -13, 2, 42, 26, (x, y, z, i, j, k) => (j % 3 === 0 ? 0x1f2125 : 0x2c2f33), 0.02);
  }
  under.build();
  g.add(under);

  // inside: seats in bays, yellow grab rails and poles, a light strip down the ceiling
  const fit = new VoxGroup('fitout', 1);
  const benches = [[-13, 1], [13, -1]];
  if (cab !== 1) benches.push([53, 1], [79, -1]); else benches.push([53, 1]);
  if (cab !== -1) benches.push([-79, 1], [-53, -1]); else benches.push([-53, -1]);
  const seatCol = (x, y, z) => { const h = hash(x, y, z); return h < 0.14 ? C.seatGrey : h < 0.22 ? C.seatRed : C.seat; };
  for (const [xs, d] of benches)
    for (const side of [-1, 1]) {
      const z0 = side > 0 ? 6 : -28;
      fit.boxFn(Math.min(xs - d * 5, xs + d * 5), F + 6, z0, 10, 4, 22, seatCol, 0.03);          // cushion
      fit.boxFn(d > 0 ? xs - 7 : xs + 5, F + 6, z0, 2, 24, 22, (x, y, z, i, j) => (j > 21 ? 0x5a6a86 : seatCol(x, y, z)), 0.03); // back
      fit.box(xs - 1, F, z0 + 8, 2, 6, 6, 0x3a3e44, 0.02);                                       // pedestal
    }
  for (const side of [-1, 1]) {
    for (let x = -HALF_L + 2; x < HALF_L - 2; x++) if (doorAt(x + 0.5) === undefined && (!cab || x * cab < 68)) fit.set(x, F + 13, side * (HALF_W - 3) - (side < 0 ? 0 : 1), C.rail, 0.02);
    for (const dc of DOORS) for (const dx of [-9, 9]) fit.box(dc + dx, F, side * 20, 1, ROOF - F, 1, C.rail, 0.02);
  }
  fit.build();
  g.add(fit);
  const lightStrip = new VoxGroup('ceilingLights', 1);
  for (const z of [-5, 4]) lightStrip.box(-HALF_L + 4, ROOF - 1, z, cab ? 2 * HALF_L - 22 : 2 * HALF_L - 8, 1, 1, 0xfff8e8, 0);
  lightStrip.build({ emissive: true, castShadow: false });
  if (cab < 0) lightStrip.position.x = 14;
  g.add(lightStrip);
  const lamp = new THREE.PointLight(0xfff1dc, 380, 75, 1.3); // short reach: lights the inside, not the river
  lamp.position.set(0, ROOF - 6, 0);
  g.add(lamp);

  // glass in every window, with reflections that slide past as the train goes
  for (const side of [-1, 1]) {
    const len = cab ? 2 * HALF_L - 18 : 2 * HALF_L;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, BAND1 - BAND0), GLASS);
    glass.position.set(cab ? -cab * 9 : 0, (BAND0 + BAND1) / 2, side * (HALF_W + 0.05));
    if (side < 0) glass.rotation.y = Math.PI;
    glass.renderOrder = 2;
    g.add(glass);
  }
  return g;
}

const GLASS_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#9fc4e0';
  g.fillRect(0, 0, 512, 64);
  for (const [x, w, a] of [[40, 26, 0.55], [80, 8, 0.4], [230, 40, 0.45], [282, 10, 0.35], [400, 18, 0.5]]) {
    g.save();
    g.globalAlpha = a;
    g.fillStyle = '#ffffff';
    g.transform(1, 0, -0.6, 1, 0, 0);
    g.fillRect(x + 20, 0, w, 64);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(3, 1);
  return t;
})();
const GLASS = new THREE.MeshStandardMaterial({ map: GLASS_TEX, transparent: true, opacity: 0.2, roughness: 0.1, metalness: 0, depthWrite: false });

// ------------------------------------------------------------------ who's on board
// look helper: a passenger outfit over the tired look's rig (topFn draws the front of the top)
const P = (o) => ({ topFn: () => null, pantsFn: undefined, hood: false, shoes: 'sneakers', sleeve: 9.3, ...o });
const FOLK = {
  grandma: P({ hairStyle: 'bun', hair: 0xd9d9d9, skin: 0xf3cfb3, lips: 0xb8505e, earrings: 0xf2f2f2, top: 0xc0577a, topDark: 0xa04466, pants: 0x8a7a6a,
    topFn: (x, y, z) => (z < -1.2 && Math.abs(x) < 1.6 && y > 2 ? 0xf6efe2 : null) }),
  grandpa: P({ hairStyle: 'short', hair: 0xc4c4c4, brows: 0xc4c4c4, beard: 0xd4d4d4, skin: 0xe8b890, top: 0xe3d6b8, topDark: 0xc9bb9a, pants: 0x4a5a6e, sleeve: 3.6,
    topFn: (x, y, z) => (z < -1.2 && Math.abs(x) < 0.9 && y > 8 ? 0xc9bb9a : null) }),
  suit: P({ hairStyle: 'short', hair: 0x1a1210, skin: 0x8d5524, top: 0x2f3e5c, topDark: 0x26324a, pants: 0x2f3e5c,
    topFn: (x, y, z) => (z < -1.2 && Math.abs(x) < 1.8 && y > 4 ? (Math.abs(x) < 0.45 ? 0xc8433a : 0xf4f4f4) : null) }),
  teal: P({ hairStyle: 'long', hair: 0xe0b860, skin: 0xffdbac, lips: 0xc76b86, lashes: true, top: 0x3fa7a0, topDark: 0x2f8a84, pants: 0x2f2f3a }),
  hiVis: P({ hairStyle: 'short', hair: 0x7a4a2a, beard: 0x7a4a2a, skin: 0xe0ac69, top: 0xff7a1a, topDark: 0xe0650f, pants: 0x2f3a5c, sleeve: 3.6, shoes: 'socks',
    topFn: (x, y) => (Math.abs(y - 5) < 0.45 || Math.abs(y - 8.5) < 0.45 ? 0xd8dde0 : null) }),
  teen: P({ hairStyle: 'long', hair: 0x140d0a, skin: 0xc68642, lips: 0x9a4a4a, top: 0xa64dff, topDark: 0x8a3ae0, hood: true, pants: 0x4f7fd1 }),
  maroon: P({ hairStyle: 'short', hair: 0x2a1a12, skin: 0xf6d0b0, top: 0x6e1a37, topDark: 0x561229, pants: 0x3a3a3a, sleeve: 3.6,
    topFn: (x, y, z) => (z < -1.2 && Math.abs(Math.abs(x) - (11 - y) * 0.45) < 0.4 && y > 6 ? 0xf2c94c : null) }), // State of Origin jersey
  sunny: P({ hairStyle: 'bun', hair: 0x2a1a12, skin: 0x6e4019, lips: 0x8a3a3a, earrings: 0xf2c94c, top: 0xf2c94c, topDark: 0xd6ac2c, pants: 0xffffff }),
  surfer: P({ hairStyle: 'long', hair: 0xd8b060, skin: 0xe8b890, top: 0x3fd0ff, topDark: 0x2fb0e0, pants: 0xc8b48a, sleeve: 3.6 }),
  mumB: P({ hairStyle: 'long', hair: 0x5a2a1a, skin: 0xffdbac, lips: 0xb8505e, lashes: true, top: 0x55b86a, topDark: 0x3f9a4f, pants: 0x3a4f78 }),
  dadB: P({ hairStyle: 'short', hair: 0x3b2a1a, beard: 0x3b2a1a, skin: 0xc68642, top: 0xffffff, topDark: 0xdddddd, pants: 0x6c6e75, sleeve: 3.6 }),
};
// [car (1 front, 0 middle, -1 rear), seat x, facing (+1 = +x), side (+1 = camera side), lane, who, yaw tweak]
const RIDERS = [
  [0, -13, 1, 1, 'aisle', 'PARENT', 0.45],   // ours, turned to watch the kid
  [0, 13, -1, 1, 'window', 'grandma', -0.15],
  [0, 13, -1, 1, 'aisle', 'grandpa', -0.1],
  [0, -13, 1, -1, 'window', 'suit', 0],
  [0, 13, -1, -1, 'aisle', 'teal', 0.1],
  [0, 53, 1, 1, 'window', 'hiVis', 0.2],
  [0, 79, -1, 1, 'aisle', 'teen', 0],
  [0, -53, -1, 1, 'window', 'maroon', 0],
  [0, -79, 1, -1, 'window', 'sunny', 0],
  [1, -13, 1, 1, 'window', 'sunny', 0.1],
  [1, 13, -1, 1, 'aisle', 'mumB', 0.3],
  [1, -53, -1, 1, 'window', 'surfer', 0],
  [1, 53, 1, -1, 'aisle', 'dadB', 0],
  [-1, 13, -1, 1, 'window', 'teal', 0],
  [-1, -13, 1, 1, 'aisle', 'dadB', 0],
  [-1, 53, 1, 1, 'window', 'grandpa', 0.1],
  [-1, -53, -1, -1, 'window', 'maroon', 0],
];
const laneZ = (side, lane) => side * (lane === 'window' ? 22.5 : 11.5);

// ------------------------------------------------------------------ sky
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2f7fd8');
  grad.addColorStop(0.32, '#5fa6ea');
  grad.addColorStop(0.5, '#cfe6f6');
  grad.addColorStop(1, '#cfe6f6');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------ the world
export function buildTrain({ kidLook = 'girl', parentLook = 'tired', aspect = 16 / 9 } = {}) {
  const scene = new THREE.Scene();
  const HORIZON = 0xcfe6f6;
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(HORIZON, 700, 1900);

  setSeed(2024);
  buildGround(scene);
  buildTrack(scene);
  buildScenery(scene);

  const road = [car(0xd23a2a), car(0x2f6fd8), car(0xf2f2f2)];
  road.forEach((c) => scene.add(c));
  const boat = ferry();
  scene.add(boat);

  // ---- the train
  const train = new THREE.Group();
  scene.add(train);
  const cars = [1, 0, -1].map((cab) => {
    const g = buildCar(cab, cab === 0);
    g.position.set(cab * PITCH, 0, 0);
    train.add(g);
    return { g, cab };
  });
  const carOf = (i) => cars.find((c) => c.cab === i).g;

  const riders = [];
  const seat = (rig, ci, xs, d, side, lane, tweak = 0, phase = 0) => {
    const holder = new THREE.Group();
    holder.position.set(xs - d * 2, F + 11, laneZ(side, lane));
    holder.rotation.y = (d > 0 ? -Math.PI / 2 : Math.PI / 2) - tweak * side * d; // +tweak turns towards the window
    holder.add(rig.root);
    carOf(ci).add(holder);
    return { rig, holder, phase };
  };
  for (const [ci, xs, d, side, lane, who, tweak] of RIDERS) {
    if (who === 'PARENT') continue;
    const rig = buildParent(FOLK[who], 'chair', { calm: who !== 'mumB' });
    riders.push(seat(rig, ci, xs, d, side, lane, tweak, (xs * 0.37 + ci * 1.9 + 10) % 7));
  }

  // another little one up the front, pointing at everything
  const other = buildToddler({ skin: 0x8d5524, hair: 0x140d0a, tee: [0xe64545, 0xffffff], legs: [0x3a4f78, 0x34476c], style: 'curly', mode: 'point', brows: 0x140d0a, phase: 1.1 });
  const otherHolder = new THREE.Group();
  otherHolder.position.set(13, F + 12, 22.4);
  otherHolder.rotation.y = Math.PI;
  otherHolder.add(other.root);
  carOf(1).add(otherHolder);

  // ---- our kid + their grown-up (the pickers)
  let kid, kidHolder, parent, parentRider;
  function setKid(look) {
    if (kidHolder) carOf(0).remove(kidHolder);
    const base = typeof look === 'object' ? look : TODDLER_LOOKS[look] || TODDLER_LOOKS.girl;
    kid = buildToddler({ ...base, mode: 'window', grin: true });
    kidHolder = new THREE.Group();
    kidHolder.position.copy(KID_LOCAL).setY(F + 12);
    kidHolder.rotation.y = Math.PI; // facing out of the window, at the camera
    kidHolder.add(kid.root);
    carOf(0).add(kidHolder);
  }
  function setParent(look) {
    if (parentRider) carOf(0).remove(parentRider.holder);
    const [ci, xs, d, side, lane, , tweak] = RIDERS.find((r) => r[5] === 'PARENT');
    parent = buildParent(look, 'chair');
    parentRider = seat(parent, ci, xs, d, side, lane, tweak, 0);
  }
  setKid(kidLook);
  setParent(parentLook);

  // ---- the words
  let words = null, wordsTall = null;
  function setAspect(a) {
    const layout = textLayout(a);
    if (words && wordsTall === layout.tall) return;
    if (words) scene.remove(words.group);
    words = buildWords(layout);
    wordsTall = layout.tall;
    scene.add(words.group);
  }
  setAspect(aspect);

  // ---- lights: a bright Queensland day
  scene.add(new THREE.HemisphereLight(0xd6ecff, 0x6a7a4a, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
  const SUN_DIR = new THREE.Vector3(0.35, 0.8, 0.5).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -360, right: 360, top: 360, bottom: -360, near: 50, far: 1400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.25;
  scene.add(sun, sun.target);

  const backOut = (k) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2; };
  function update(time) {
    const t = ((time % TRAIN_LOOP) + TRAIN_LOOP) % TRAIN_LOOP;
    // the train, with a little ride on the springs
    train.position.set(midCarX(t), RAIL_Y, 0);
    cars.forEach(({ g, cab }, i) => {
      g.position.y = Math.sin(t * 7.1 + i * 2) * 0.12 + Math.sin(t * 13.3 + i) * 0.05;
      g.rotation.x = Math.sin(t * 3.3 + i * 1.7) * 0.0025;
    });
    GLASS_TEX.offset.x = -t * 0.11;
    kid.update(t);
    parent.update(t);
    other.update(t);
    for (const r of riders) r.rig.update(t + r.phase);

    // the words pop up one by one as the camera gets up there, then bob gently
    if (words) words.pivots.forEach((p, i) => {
      const k = clamp01((t - 10.9 - i * 0.09) / 0.5);
      const s = k <= 0 ? 0.0001 : backOut(k);
      p.scale.setScalar(s);
      p.position.y = TEXT_Y + (1 - ease(k)) * 30 + Math.sin(t * 1.9 + i * 0.7) * 0.9;
      p.rotation.z = Math.sin(t * 1.3 + i * 1.1) * 0.025;
    });

    road[0].position.set(-1000 + 30 * t, 0, 146);
    road[1].position.set(-420 - 26 * t, 0, 158); road[1].rotation.y = Math.PI;
    road[2].position.set(-760 + 24 * t, 0, 146);
    boat.position.set(110, WATER_Y, -40 - 9 * t); // heading upriver on the far side, clear of the words

    // the sun's shadow box follows the camera, snapped to its texels so shadows don't crawl
    const snap = 720 / 4096;
    const fx = Math.round(camFocus.x / snap) * snap, fz = Math.round(camFocus.z / snap) * snap;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx, 0, fz).addScaledVector(SUN_DIR, 700);
  }

  return {
    scene, update, setKid, setParent, setAspect, exposure: 1.0,
    get kid() { return kid; }, get parent() { return parent; },
  };
}
