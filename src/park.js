import * as THREE from 'three';
import { VoxGroup, rand, setSeed } from './voxel.js';
import { buildWalker, buildBikeKid, buildDog, buildToddler } from './characters.js';

// The never-ending chase. The park is a small voxel planet (radius PR) that rolls under a
// parent and their kid, who stay near the top while the park goes by.
// World axes: x = across the path, -z = the way they're heading, top of the planet at y = 0.
// Planet-local "u" = distance along the path (ahead = +u).
//
// Lanes across the path (keep props out of the runner lanes so the dogs never clip them):
//   |x| < 7 path · 7..17 runner lanes (dogs, dog walker) · 17+ benches, lamps, bins · 26+ play
//   equipment, trees · 48+ edge trees.
export const PR = 400; // big enough that the curve is gentle, small enough that you see it
const CIRC = 2 * Math.PI * PR;
// Seamless loop: the park repeats four times round the planet, and the planet turns exactly
// one repeat (a quarter turn) per LOOP, so the last frame runs straight into the first.
// Every animation in the scene repeats a whole number of times per LOOP too.
export const LOOP = 20;
const REPEATS = 4;
const SECTOR = CIRC / REPEATS;
export const SPEED = SECTOR / LOOP; // ground speed (units/s), ~31: a brisk walk
const W = (2 * Math.PI) / LOOP;
const LW = (w) => Math.max(1, Math.round(w / W)) * W; // snap an angular frequency to the loop
const HALF = 60; // half-width of the voxel strip
const PATH = 7;

const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const wrapU = (d) => ((((d + CIRC / 2) % CIRC) + CIRC) % CIRC) - CIRC / 2;
const terr = (x) => Math.round(Math.sqrt(PR * PR - x * x) - PR); // drop of the surface at column centre x
const inE = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const sm = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const sideYaw = (x) => (x < 0 ? -Math.PI / 2 : Math.PI / 2); // turn a -z-facing prop to face the path

// ------------------------------------------------------------------ layout (one repeat, u in 0..SECTOR)
const BASE = [
  { u: 40, x: -22, kind: 'bench', pigeons: 2 }, { u: 64, x: -22, kind: 'bin' },
  { u: 40, x: -33, kind: 'seesaw' },
  { u: 100, x: 32, kind: 'tree' }, { u: 92, x: 22.5, kind: 'dogSit' },
  { u: 140, x: -33, kind: 'tree' },
  { u: 160, x: -20.5, kind: 'lamp' },
  { u: 225, x: -35, kind: 'swings' },
  { u: 262, x: 24, kind: 'bush' }, { u: 285, x: 25, kind: 'flowers' },
  { u: 300, x: 20.5, kind: 'lamp' },
  { u: 330, x: -32, kind: 'tree' },
  { u: 355, x: 32, kind: 'slide' },
  { u: 420, x: 34, kind: 'tree' },
  { u: 440, x: -31, kind: 'pond' },
  { u: 465, x: 22, kind: 'bench', pigeons: 1 },
  { u: 520, x: -24, kind: 'bush' }, { u: 545, x: -20.5, kind: 'lamp' },
  { u: 525, x: 30, kind: 'picnic' }, { u: 552, x: 21, kind: 'ball' },
  { u: 590, x: -32, kind: 'blossom' }, { u: 605, x: 33, kind: 'tree' },
];
// edge trees, wherever the big things aren't
for (let k = 0, e = 0; e < SECTOR - 20; e += 30 + rand() * 18, k++) {
  const side = k % 2 ? 1 : -1;
  const busy = BASE.some((f) => ['swings', 'slide', 'pond', 'picnic'].includes(f.kind) && Math.sign(f.x) === side && Math.abs(wrapU(f.u - e)) < 40);
  if (!busy) BASE.push({ u: e, x: side * (50 + rand() * 6), kind: 'edgeTree' });
}
BASE.forEach((f, i) => { f.seed = 1000 + i * 7919; f.rnd = [rand(), rand(), rand()]; }); // same every repeat
const LAYOUT = [];
for (let n = 0; n < REPEATS; n++) for (const f of BASE) LAYOUT.push({ ...f, u: f.u + n * SECTOR });

// ground patches under things
const ZONES = [];
for (const f of LAYOUT) {
  if (f.kind === 'swings') ZONES.push({ u: f.u, x: f.x, ru: 18, rx: 16, kind: 'bark' });
  if (f.kind === 'seesaw') ZONES.push({ u: f.u, x: f.x, ru: 26, rx: 8, kind: 'bark' });
  if (f.kind === 'slide') ZONES.push({ u: f.u + 12, x: f.x, ru: 32, rx: 11, kind: 'sand' });
  if (f.kind === 'flowers') ZONES.push({ u: f.u, x: f.x, ru: 12, rx: 5, kind: 'flowers' });
  if (f.kind === 'pond') ZONES.push({ u: f.u, x: f.x, ru: 30, rx: 13, kind: 'water', level: terr(f.x) - 1 });
}
const BUCKET = 40;
const buckets = new Map();
for (const z of ZONES) {
  for (let b = Math.floor((z.u - z.ru) / BUCKET); b <= Math.floor((z.u + z.ru) / BUCKET); b++) {
    const k = ((b % Math.ceil(CIRC / BUCKET)) + Math.ceil(CIRC / BUCKET)) % Math.ceil(CIRC / BUCKET);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(z);
  }
}
function zoneAt(u, xc) {
  const uu = ((u % CIRC) + CIRC) % CIRC;
  const list = buckets.get(Math.floor(uu / BUCKET) % Math.ceil(CIRC / BUCKET));
  if (!list) return null;
  for (const z of list) {
    const du = wrapU(uu - z.u) / z.ru, dx = (xc - z.x) / z.rx, e = du * du + dx * dx;
    if (e <= 1) return { z, e };
  }
  return null;
}

// ------------------------------------------------------------------ ground
// The strip is built from rows of voxels laid tangent to the planet: LCH rows per chunk,
// NCH chunks all the way round (a multiple of REPEATS so every repeat lines up exactly).
const LCH = 3, NCH = REPEATS * Math.round(SECTOR / LCH), ROWS = NCH * LCH, ROWS_PER = ROWS / REPEATS;
const ROW = CIRC / ROWS; // arc length of one row (~1)
const SOIL = 0x6e5236;
const GRASS = [0x6fb84a, 0x63aa41];
const FLOWER = [0xff5f8a, 0xffd23f, 0xffffff, 0xa64dff, 0xff8a3c];
// row = row index round the planet, x = column
function surface(row, x) {
  const r = ((row % ROWS_PER) + ROWS_PER) % ROWS_PER; // position within the repeat
  const u = (r + 0.5) * ROW;
  const xc = x + 0.5, h = hash(r, x), base = terr(xc);
  const Z = zoneAt(u, xc);
  if (Z) {
    const { z, e } = Z;
    if (z.kind === 'water') {
      if (e < 0.72) return { c: h < 0.1 ? 0x7cbbe8 : h < 0.55 ? 0x4f95cc : 0x478bc2, top: z.level };
      return { c: h < 0.5 ? 0x9a948a : 0x86807a, top: Math.max(base, z.level + 1), tuft: h > 0.8 ? 0x4f8a3a : 0 }; // stone rim + reeds
    }
    if (z.kind === 'sand') return { c: h < 0.3 ? 0xe8d49a : 0xf0dda8, top: base, tuft: h > 0.99 ? 0xd8c088 : 0 };
    if (z.kind === 'bark') return { c: [0x7a5432, 0x8a6038, 0x6a4628, 0x94693e][Math.floor(h * 4)], top: base };
    if (z.kind === 'flowers') return { c: 0x5a3e28, top: base, tuft: h < 0.5 ? FLOWER[Math.floor(h * 10) % 5] : 0x4f9a3a };
  }
  const ax = Math.abs(xc);
  if (ax < PATH) {
    if (ax > PATH - 1) return { c: 0xaaa293, top: base };                    // kerb
    const joint = r % 8 === 0;
    if (h < 0.004) return { c: 0xd9822b, top: base };                         // a fallen leaf
    return { c: joint ? 0xb9b2a4 : h < 0.5 ? 0xd3ccbe : 0xcbc4b5, top: base };
  }
  let c = GRASS[Math.floor(r / 12) % 2];                                      // mower stripes
  if (h < 0.12) c = shade(c, 0.9);
  let tuft = 0;
  if (h > 0.965 || (ax < PATH + 1.2 && h > 0.6)) tuft = h > 0.985 ? 0x82c95a : 0x58a03a;
  if (h > 0.9975) tuft = 0xffffff;                                            // daisies
  else if (h > 0.996) tuft = 0xffd23f;                                       // dandelions
  return { c, top: base, tuft };
}

function buildGround(planet) {
  const SECTORS = 36, per = Math.ceil(NCH / SECTORS);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  const m = new THREE.Matrix4(), col = new THREE.Color();
  const topAt = (row, x) => (x < -HALF || x >= HALF ? -999 : surface(row, x).top);
  for (let s0 = 0; s0 < NCH; s0 += per) {
    const cells = [];
    for (let i = s0; i < Math.min(NCH, s0 + per); i++) {
      const rot = new THREE.Matrix4().makeRotationX(-((i + 0.5) * 2 * Math.PI) / NCH);
      for (let k = 0; k < LCH; k++) {
        const row = i * LCH + k, zc = (LCH / 2 - k - 0.5) * ROW;
        for (let x = -HALF; x < HALF; x++) {
          const S = surface(row, x), top = S.top;
          let lo = Math.min(top - 1, topAt(row, x - 1), topAt(row, x + 1), topAt(row - 1, x), topAt(row + 1, x));
          if (lo < top - 4) lo = top - 4; // strip edge: a few layers of soil
          for (let y = lo; y <= top - 1; y++) {
            const c = y === top - 1 ? S.c : y === top - 2 ? shade(S.c, 0.82) : SOIL;
            cells.push(rot, x + 0.5, PR + y + 0.5, zc, c, row % ROWS_PER, x * 31 + y);
          }
          if (S.tuft) cells.push(rot, x + 0.5, PR + top + 0.5, zc, S.tuft, row % ROWS_PER, x * 31 + top + 7);
        }
      }
    }
    const n = cells.length / 7;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    for (let j = 0; j < n; j++) {
      const o = j * 7;
      m.makeTranslation(cells[o + 1], cells[o + 2], cells[o + 3]).premultiply(cells[o]);
      mesh.setMatrixAt(j, m);
      const jit = hash(cells[o + 5] * 0.37 + 11.3, cells[o + 6] * 0.71 + 5.1); // same in every repeat
      mesh.setColorAt(j, col.set(cells[o + 4]).multiplyScalar(1 + (jit * 2 - 1) * 0.045));
    }
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.computeBoundingSphere();
    planet.add(mesh);
  }
  // the rest of the planet past the strip
  const under = new THREE.Mesh(new THREE.SphereGeometry(PR - 3, 128, 64), new THREE.MeshStandardMaterial({ color: 0x5a9a3c, roughness: 1 }));
  under.receiveShadow = true;
  planet.add(under);
}

// ------------------------------------------------------------------ props (each faces -z, base at y = 0)
function tree({ h = 28, r = 13, res = 1.5, blossom = false } = {}) {
  const g = new THREE.Group();
  const BARK = 0x6a4a2c;
  const t = new VoxGroup('trunk', 1);
  t.cap(0, 0, 0, 0, h, 0, 2.3, (x, y, z) => (Math.sin(y * 1.3 + x) > 0.7 ? 0x5a3e24 : BARK));
  t.ell(0, 0.5, 0, 3.8, 1.4, 3.8, BARK);
  t.cap(0, h * 0.62, 0, r * 0.45, h + 3, r * 0.15, 1.2, BARK);
  t.cap(0, h * 0.7, 0, -r * 0.4, h + 5, -r * 0.25, 1.2, BARK);
  t.build();
  g.add(t);
  const LEAF = blossom ? [0xf7a8c8, 0xffc4dc, 0xe88ab0, 0xfff0f6] : [0x4f9a3a, 0x5aa844, 0x3f8a32, 0x6cb84e];
  const c = new VoxGroup('canopy', res);
  const blobs = [[0, h + 6, 0, r], [r * 0.6, h + 2, r * 0.3, r * 0.7], [-r * 0.55, h + 4, -r * 0.35, r * 0.75], [r * 0.15, h + r * 0.75, -r * 0.3, r * 0.6]];
  for (const [bx, by, bz, br] of blobs)
    c.ell(bx, by, bz, br, br * 0.82, br, (x, y, z) => {
      const k = hash(Math.floor(x / res), Math.floor(y / res) * 7 + Math.floor(z / res));
      if (y > by + br * 0.4) return k < 0.5 ? LEAF[3] : LEAF[1];
      if (y < by - br * 0.35) return LEAF[2];
      return k < 0.33 ? LEAF[0] : k < 0.66 ? LEAF[1] : LEAF[2];
    }, 0.06);
  c.build();
  g.add(c);
  return g;
}

function bush() {
  const b = new VoxGroup('bush', 1);
  for (const [x, y, z, r] of [[0, 3, 0, 5], [4, 2.5, 2, 4], [-4, 2.5, -1, 4.2], [1, 5, -2, 3.5]])
    b.ell(x, y, z, r, r * 0.85, r, (px, py, pz) => (hash(Math.floor(px), Math.floor(py) * 13 + Math.floor(pz)) < 0.04 ? 0xd8323c : py > 5 ? 0x4c9a3c : 0x3d8530), 0.07);
  b.build();
  return b;
}

function bench(pigeons = 0) {
  const g = new THREE.Group();
  const b = new VoxGroup('bench', 0.5);
  const WOOD = 0xb0763e, IRON = 0x2a2e2a;
  for (let i = 0; i < 3; i++) b.wbox(-12, 9, -3 + i * 2.1, 24, 0.8, 1.6, WOOD, 0.06);
  for (let i = 0; i < 3; i++) b.wbox(-12, 12 + i * 2.6, 3.0 + i * 0.25, 24, 1.6, 0.8, WOOD, 0.06);
  for (const x of [-10, 10]) {
    b.wbox(x - 0.5, 0, -3, 1, 9, 1, IRON, 0.02);
    b.wbox(x - 0.5, 0, 2.6, 1, 20, 1, IRON, 0.02);
    b.wbox(x - 0.5, 13, -3.5, 1, 1, 6.6, IRON, 0.02);
    b.wbox(x - 0.5, 9, -3.4, 1, 4, 1, IRON, 0.02);
    b.wbox(x - 0.5, 0, -3, 1, 1, 6.6, IRON, 0.02);
  }
  b.wbox(-2, 15.4, 3.75, 4, 1.2, 0.3, 0xd4b060, 0);
  b.build();
  g.add(b);
  const anims = [];
  for (let i = 0; i < pigeons; i++) {
    const p = pigeon(i * 1.7);
    p.root.position.set(-6 + i * 9, 9.8, -0.5);
    p.root.rotation.y = i ? 2.2 : -0.6;
    g.add(p.root);
    anims.push(p.update);
  }
  return { obj: g, update: (t) => anims.forEach((f) => f(t)) };
}

function pigeon(phase = 0) {
  const root = new THREE.Group();
  const v = new VoxGroup('pigeon', 0.25);
  v.ell(0, 1.8, 0.3, 1.1, 1.0, 1.7, (x, y, z) => (z > 1.2 ? 0x6a6e78 : y > 2.2 && z < -0.3 ? 0x8a6aa0 : 0x9ea2ac));
  v.ell(0, 1.9, 2.0, 0.6, 0.3, 1.0, 0x5a5e68); // tail
  for (const s of [-1, 1]) v.cap(s * 0.4, 0.8, 0, s * 0.4, 0, -0.2, 0.15, 0xe07a7a, 0);
  v.build();
  root.add(v);
  const head = new THREE.Group();
  head.position.set(0, 2.6, -1.0);
  const hv = new VoxGroup('pigeonHead', 0.25);
  hv.ell(0, 0.6, 0, 0.6, 0.65, 0.6, (x, y) => (y < 0.3 ? 0x5a9a7a : 0x8e929c));
  hv.wbox(-0.12, 0.4, -1.0, 0.25, 0.25, 0.5, 0xf0c060, 0);
  for (const s of [-1, 1]) hv.set(Math.round(s * 0.5 / 0.25), Math.round(0.8 / 0.25), Math.round(-0.3 / 0.25), 0xff8a20, 0);
  hv.build();
  head.add(hv);
  root.add(head);
  return {
    root,
    update(t) {
      const k = (t + phase) % (LOOP / 12);
      head.position.z = -1.0 - (k < 0.5 ? Math.sin(k * Math.PI * 2) * 0.35 : 0); // head bob
      head.rotation.x = k > 0.9 && k < 1.2 ? 0.7 : 0;                          // peck
    },
  };
}

function bin() {
  const b = new VoxGroup('bin', 0.5);
  b.fill(-3, 0, -3, 3, 11, 3, (x, y, z) => Math.hypot(x, z) <= 2.9 - (y < 1 ? 0.3 : 0), (x, y) => (Math.abs(y - 8.5) < 0.6 ? 0xd4b060 : 0x2f6b3a), 0.04);
  b.fill(-3.2, 11, -3.2, 3.2, 12.5, 3.2, (x, y, z) => Math.hypot(x, z) <= 3.2 - (y - 11) * 0.8, 0x24552e, 0.03);
  b.wbox(-1.5, 10.5, -3.3, 3, 1, 0.5, 0x111111, 0);           // slot
  b.wbox(0.4, 12.3, -0.8, 1.6, 0.5, 1.2, 0xe64545, 0);          // a crisp packet balanced on top
  b.build();
  return b;
}

function lamp() {
  const b = new VoxGroup('lamp', 0.5);
  const G = 0x1f3a2a;
  b.fill(-1.8, 0, -1.8, 1.8, 3, 1.8, (x, y, z) => Math.hypot(x, z) <= 1.8 - y * 0.25, G, 0.03);
  b.cap(0, 2, 0, 0, 44, 0, 0.7, G, 0.02);
  b.ell(0, 44.5, 0, 1.6, 0.6, 1.6, G, 0.02);
  b.fill(-2, 45, -2, 2, 50, 2, (x, y, z) => Math.max(Math.abs(x), Math.abs(z)) <= 2 - (y - 45) * 0.12,
    (x, y, z) => (Math.abs(Math.abs(x) - Math.abs(z)) < 0.6 || y < 45.6 ? G : 0xfff2c0), 0.02);
  b.fill(-2.6, 50, -2.6, 2.6, 53, 2.6, (x, y, z) => Math.max(Math.abs(x), Math.abs(z)) <= 2.6 - (y - 50) * 0.9, G, 0.02);
  b.cap(0, 53, 0, 0, 54.5, 0, 0.35, G, 0);
  b.build();
  return b;
}

function swings() {
  const g = new THREE.Group();
  const f = new VoxGroup('swingFrame', 0.5);
  const FR = 0xd64545, TOP = 42;
  f.cap(0, TOP, -16, 0, TOP, 16, 0.9, FR, 0.03);
  for (const zc of [-15, 15]) {
    for (const s of [-1, 1]) f.cap(0, TOP, zc, s * 11, -0.5, zc, 0.8, FR, 0.03);
    f.cap(-5.6, TOP * 0.45, zc, 5.6, TOP * 0.45, zc, 0.5, FR, 0.03);
  }
  f.build();
  g.add(f);
  const seats = [];
  for (const [zc, kid] of [[-6, true], [6, false]]) {
    const p = new THREE.Group();
    p.position.set(0, TOP, zc);
    const s = new VoxGroup('swing', 0.5);
    for (const dz of [-2.5, 2.5]) s.fill(-0.3, -28.5, dz - 0.3, 0.3, -0.5, dz + 0.3, () => true, (x, y) => (Math.floor(y) % 2 ? 0x9a9aa0 : 0x7a7a80), 0);
    s.wbox(-2.5, -29.3, -3, 5, 0.8, 6, 0x222226, 0.02);
    s.build();
    p.add(s);
    let k;
    if (kid) {
      k = loopRig(buildToddler({ skin: 0xc68642, hair: 0x1a1210, tee: [0xffd23f, 0xff7a5c], legs: [0x3f7fd6, 0x3a76c4], style: 'curly', mode: 'listen', lookUp: 0.05, brows: 0x1a1210 }));
      const seat = new THREE.Group(); // the toddler rig owns its root's y, so sit it in a holder
      seat.position.set(0, -28.6, 0);
      seat.rotation.y = -Math.PI / 2; // faces the way the swing goes
      seat.scale.setScalar(0.9);
      seat.add(k.root);
      p.add(seat);
    }
    g.add(p);
    seats.push({ p, k, amp: kid ? 0.55 : 0.07, ph: kid ? 0 : 1.3 });
  }
  return {
    obj: g,
    update(t) {
      for (const { p, k, amp, ph } of seats) {
        p.rotation.z = Math.sin(t * LW(2.3) + ph) * amp;
        k?.update(t);
      }
    },
  };
}

function slide() {
  const b = new VoxGroup('slide', 0.5);
  const FR = 0x2f6fbf, DECK = 0x55b86a, RAMP = 0xffc93c, ROOF = 0xe64545, PY = 20;
  for (const [x, z] of [[-5, 0], [4.5, 0], [-5, 9.5], [4.5, 9.5]]) b.wbox(x, 0, z, 1, 32, 1, FR, 0.02);
  b.wbox(-5, PY, 0, 10.5, 1, 10.5, DECK, 0.04);
  for (const s of [-1, 1]) b.wbox(s > 0 ? 4.5 : -5, PY + 1, 0, 1, 4, 10.5, FR, 0.02); // side rails
  b.fill(-6, 32, -1, 6.5, 38, 11.5, (x, y, z) => Math.max(Math.abs(x - 0.25) / 6.25, Math.abs(z - 5.25) / 6.25) <= 1 - (y - 32) / 6, (x, y) => (Math.floor(y) % 2 ? ROOF : 0xffffff), 0.03);
  for (const s of [-1, 1]) b.cap(s * 3.5, 0, 20, s * 3.5, PY + 4, 10, 0.5, FR, 0.02); // ladder
  for (let i = 1; i < 7; i++) b.cap(-3.5, i * 3, 20 - i * 1.43, 3.5, i * 3, 20 - i * 1.43, 0.35, 0xd8d8d8, 0);
  const rampY = (z) => (z <= -30 ? 2 : 2 + (PY - 1.5) * sm((z + 30) / 30));
  b.fill(-3.5, 0, -34, 3.5, PY + 2, 0, (x, y, z) => {
    const ry = rampY(z);
    return (y <= ry && y > ry - 1) || (Math.abs(x) > 2.9 && y <= ry + 1.6 && y > ry - 1);
  }, RAMP, 0.03);
  b.wbox(-3, 0, -31, 1, 2, 1, FR, 0);
  b.wbox(2, 0, -31, 1, 2, 1, FR, 0);
  b.build();
  return b;
}

function seesaw() {
  const g = new THREE.Group();
  const base = new VoxGroup('seesawBase', 0.5);
  base.fill(-2.5, 0, -2, 2.5, 5.5, 2, (x, y, z) => Math.abs(z) <= 2 - y * 0.25, 0xe64545, 0.03);
  base.build();
  g.add(base);
  const p = new THREE.Group();
  p.position.y = 5.8;
  const pl = new VoxGroup('plank', 0.5);
  pl.wbox(-2, 0, -21, 4, 1, 42, 0xffc93c, 0.04);
  for (const s of [-1, 1]) {
    pl.cap(-1.8, 0.5, s * 15, -1.8, 5, s * 15, 0.4, 0x2f6fbf, 0);
    pl.cap(1.8, 0.5, s * 15, 1.8, 5, s * 15, 0.4, 0x2f6fbf, 0);
    pl.cap(-1.8, 5, s * 15, 1.8, 5, s * 15, 0.4, 0x2f6fbf, 0);
  }
  pl.build();
  p.add(pl);
  const kids = [
    { z: 18, yaw: 0, look: { skin: 0xffdbac, hair: 0xe0b860, tee: [0xff8fc8, 0xffffff], legs: [0x8fd3ff, 0x84c6ef], style: 'bun', bow: 0xff3fa4, mode: 'clap', brows: 0xc49a4a, lookUp: 0 } },
    { z: -18, yaw: Math.PI, look: { skin: 0x6e4019, hair: 0x120c0a, tee: [0xf28c28], legs: [0x2f2f3a, 0x29293a], style: 'tuft', mode: 'clap', phase: 2.5, brows: 0x120c0a, lookUp: 0 } },
  ].map(({ z, yaw, look }) => {
    const k = loopRig(buildToddler(look));
    const seat = new THREE.Group();
    seat.position.set(0, 1, z);
    seat.rotation.y = yaw;
    seat.scale.setScalar(0.85);
    seat.add(k.root);
    p.add(seat);
    return k;
  });
  g.add(p);
  return {
    obj: g,
    update(t) {
      p.rotation.x = Math.sin(t * LW(1.6)) * 0.2;
      kids.forEach((k) => k.update(t));
    },
  };
}

function pond(level, side) {
  const g = new THREE.Group();
  const r = new VoxGroup('reeds', 0.5);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, rr = 0.82 + rand() * 0.12;
    const x = Math.sin(a) * 13 * rr, z = Math.cos(a) * 30 * rr;
    if (Math.sign(Math.sin(a)) === -side && Math.abs(Math.cos(a)) < 0.55) continue; // leave the path side open
    const h = 5 + rand() * 6;
    r.cap(x, level, z, x + (rand() - 0.5) * 1.5, level + h, z, 0.25, 0x5a8a3a, 0.05);
    if (rand() < 0.5) r.ell(x, level + h - 0.5, z, 0.45, 1.2, 0.45, 0x6a4022, 0.03); // bulrush
  }
  r.build();
  g.add(r);
  const lily = new VoxGroup('lilies', 0.5);
  for (const [x, z] of [[-4, 10], [3, -14], [6, 4], [-6, -6]]) {
    lily.fill(x - 2, level, z - 2, x + 2, level + 0.4, z + 2, (px, py, pz) => Math.hypot(px - x, pz - z) <= 1.9, 0x3f9a4f, 0.05);
    lily.set(Math.floor(x / 0.5), Math.floor((level + 0.5) / 0.5), Math.floor(z / 0.5), 0xffb6d0, 0);
  }
  lily.build({ castShadow: false });
  g.add(lily);
  const ducks = [0, 1, 2].map((i) => {
    const d = duck(i === 0);
    g.add(d);
    return d;
  });
  return {
    obj: g,
    update(t) {
      ducks.forEach((d, i) => {
        const a = t * W * (i === 1 ? -1 : 1) + i * 2.1; // one lap of the pond per loop
        d.position.set(Math.sin(a) * (5 + i * 1.5), level + Math.sin(t * LW(2) + i) * 0.12, Math.cos(a) * (14 + i * 3));
        d.rotation.y = a + Math.PI / 2 + Math.PI;
        d.rotation.z = Math.sin(t * 2.4 + i) * 0.06;
      });
    },
  };
}

function duck(mallard) {
  const v = new VoxGroup('duck', 0.25);
  const BODY = mallard ? 0xb8b0a0 : 0x9a7a54;
  v.ell(0, 1.0, 0, 1.5, 1.1, 2.3, (x, y, z) => (z > 1.4 ? 0x2a2a2e : BODY));
  v.ell(0, 2.6, -1.8, 0.85, 0.9, 0.85, (x, y) => (mallard ? (y < 2.0 ? 0xffffff : 0x1f7a4a) : 0x8a6a44));
  v.wbox(-0.35, 2.2, -3.2, 0.7, 0.4, 0.8, 0xf0b030, 0);
  for (const s of [-1, 1]) v.set(Math.round(s * 0.7 / 0.25), Math.round(2.85 / 0.25), Math.round(-2.3 / 0.25), 0x111111, 0);
  v.build();
  return v;
}

function picnic() {
  const b = new VoxGroup('picnic', 0.5);
  b.wbox(-10, 0, -8, 20, 0.5, 16, (x, y, z) => ((Math.floor((x + 10) / 2.5) + Math.floor((z + 8) / 2.5)) % 2 ? 0xe64545 : 0xfaf6ee), 0.03);
  b.fill(2, 0.5, -4, 8, 5, 0, (x, y, z) => true, (x, y, z) => ((Math.floor(x * 2) + Math.floor(y * 2)) % 2 ? 0xc49a5c : 0xb08848), 0.04); // basket
  b.cap(2.5, 5, -2, 7.5, 5, -2, 0.4, 0x9a7440, 0);
  b.cap(2.5, 5, -2, 2.5, 7, -2, 0.4, 0x9a7440, 0);
  b.cap(7.5, 5, -2, 7.5, 7, -2, 0.4, 0x9a7440, 0);
  b.cap(2.5, 7, -2, 7.5, 7, -2, 0.4, 0x9a7440, 0);
  b.ell(-4, 1.3, 2, 0.9, 0.9, 0.9, 0xd8323c, 0); b.ell(-2.5, 1.3, 3, 0.9, 0.9, 0.9, 0x7ac043, 0); // apples
  b.wbox(-6, 0.5, -4, 4, 1, 3, (x, y) => (y > 1.2 ? 0xe8c890 : 0xf6efe0), 0);              // sandwich
  b.wbox(4, 0.5, 4, 1.5, 3, 1, 0x3fb8c4, 0);                                                  // juice box
  b.cap(4.6, 3.5, 4.4, 5.4, 5, 4.6, 0.15, 0xffffff, 0);
  b.build();
  return b;
}

function ball() {
  const b = new VoxGroup('ball', 0.5);
  b.ell(0, 2.2, 0, 2.2, 2.2, 2.2, (x, y, z) => (Math.abs(x) < 0.6 ? 0x3f7fd6 : y > 2.2 ? 0xe64545 : 0xffffff), 0);
  b.build();
  return b;
}

// ------------------------------------------------------------------ world
export function buildPark({ kidLook = 'girl', parentLook = 'dad' } = {}) {
  const scene = new THREE.Scene();
  const HORIZON = 0xc4e2f8;
  scene.background = skyTexture(HORIZON);
  scene.fog = new THREE.Fog(HORIZON, 150, 390);

  const planet = new THREE.Group();
  planet.position.y = -PR;
  scene.add(planet);
  buildGround(planet);

  // ---- props on the planet
  const anims = [];
  const place = (obj, u, x, yaw = 0) => {
    const anchor = new THREE.Group();
    anchor.rotation.x = -u / PR;
    obj.position.set(x, PR + terr(Math.floor(x) + 0.5), 0);
    obj.rotation.set(0, yaw, -Math.asin(x / PR), 'ZYX');
    anchor.add(obj);
    planet.add(anchor);
  };
  for (const f of LAYOUT) {
    const yaw = sideYaw(f.x);
    setSeed(f.seed); // every repeat of a prop gets built voxel-for-voxel the same
    const [r0, r1, r2] = f.rnd;
    let made;
    switch (f.kind) {
      case 'tree': made = tree({ h: 24 + r0 * 8, r: 11 + r1 * 3 }); break;
      case 'blossom': made = tree({ h: 22, r: 11, blossom: true }); break;
      case 'edgeTree': made = tree({ h: 26 + r0 * 10, r: 11 + r1 * 4, res: 2 }); break;
      case 'bush': made = bush(); break;
      case 'bench': { const b = bench(f.pigeons || 0); made = b.obj; anims.push(b.update); break; }
      case 'bin': made = bin(); break;
      case 'lamp': made = lamp(); break;
      case 'swings': { const s = swings(); made = s.obj; anims.push(s.update); place(made, f.u, f.x, 0); continue; }
      case 'slide': made = slide(); place(made, f.u, f.x, 0); continue;
      case 'seesaw': { const s = seesaw(); place(s.obj, f.u, f.x, 0); anims.push(s.update); continue; }
      case 'pond': {
        const z = ZONES.find((zz) => zz.kind === 'water' && zz.u === f.u);
        const p = pond(z.level - terr(Math.floor(f.x) + 0.5), Math.sign(f.x));
        place(p.obj, f.u, f.x, 0);
        anims.push(p.update);
        continue;
      }
      case 'picnic': made = picnic(); break;
      case 'ball': made = ball(); break;
      case 'dogSit': {
        const d = buildDog('lab', { collar: 0x3f7fd6, loop: LOOP });
        place(d.root, f.u, f.x, yaw + 0.4);
        anims.push((t) => { d.update(t, 0); d.neck.rotation.y = Math.sin(t * LW(0.6)) * 0.5; });
        continue;
      }
      default: continue;
    }
    if (made) place(made, f.u, f.x, f.kind.includes('ree') || f.kind === 'blossom' ? r2 * 6 : yaw);
  }

  // ---- clouds (not on the planet; they drift slowly overhead)
  const clouds = new THREE.Group();
  for (const [x, y, z, s] of [[-120, 140, -150, 1.2], [60, 160, -190, 1.5], [150, 130, -60, 1], [-160, 150, 40, 1.3], [20, 170, 60, 1.1], [110, 150, 140, 1.2], [-60, 135, -60, 0.9]]) {
    const c = new VoxGroup('cloud', 3);
    for (let i = 0; i < 5; i++) c.ell((i - 2) * 10 * s, (i % 2) * 3, (rand() - 0.5) * 10, (9 + rand() * 6) * s, (5 + rand() * 3) * s, (8 + rand() * 4) * s, 0xffffff, 0.03);
    c.build({ emissive: true, castShadow: false, receiveShadow: false });
    c.traverse((o) => o.material && (o.material.fog = false));
    c.position.set(x, y, z);
    clouds.add(c);
  }
  scene.add(clouds);

  // ---- the chase
  // stand something on the planet: x across, s = arc length along the path (ahead = -s, like z)
  const onSphere = (obj, x, s, yaw = 0) => {
    const rr = Math.sqrt(PR * PR - x * x), ang = s / PR;
    obj.position.set(x, rr * Math.cos(ang) - PR, rr * Math.sin(ang));
    const n = new THREE.Vector3(x, rr * Math.cos(ang), rr * Math.sin(ang)).normalize();
    obj.quaternion.setFromUnitVectors(UP, n).multiply(new THREE.Quaternion().setFromAxisAngle(UP, yaw));
  };
  let kid, parent;
  let kidLookNow = kidLook, parentLookNow = parentLook;
  function setKid(look) {
    if (kid) scene.remove(kid.root);
    kidLookNow = look;
    kid = buildBikeKid(look, { loop: LOOP, loopDist: SPEED * LOOP });
    scene.add(kid.root);
  }
  function setParent(look) {
    if (parent) scene.remove(parent.root);
    parentLookNow = look;
    parent = buildWalker(look, { speed: SPEED, chaser: true, loop: LOOP });
    scene.add(parent.root);
  }
  setKid(kidLook);
  setParent(parentLook);

  // ---- other park-goers, in the runner lanes. z(t) is world space; ground speed drives the gait.
  const westie = buildDog('westie', { collar: 0xff3fa4 });
  const lab = buildDog('lab', { collar: 0x55b86a, phase: 0.7 });
  const sausage = buildDog('sausage', { collar: 0xffd23f, phase: 0.3 });
  const walker = buildWalker({
    hairStyle: 'short', hair: 0xb8b8b8, skin: 0xe8b890, brows: 0x9a9a9a, pants: 0x6a5a44, top: 0x3a5a3a, topDark: 0x2c472c,
    sleeve: 10, shoes: 'sneakers', topFn: (x, y, z) => (z < -1.2 && Math.abs(x) < 0.4 && y > 2 ? 0x2c472c : null),
  }, { speed: 12, chaser: false, lead: true, calm: true, phase: 0.4 });
  scene.add(westie.root, lab.root, sausage.root, walker.root);
  const leadGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3()));
  const leadLine = new THREE.Line(leadGeo, new THREE.LineBasicMaterial({ color: 0xc83a3a }));
  leadLine.frustumCulled = false;
  scene.add(leadLine);
  // s(t) runs over one loop from far behind/ahead to the same distance the other side, so
  // each one swaps ends at the loop point while it's round the back of the planet, out of sight.
  // Lanes: westie and lab on the right (x 9..18), dog walker + sausage dog on the left.
  const MOVERS = [
    { a: westie, x: (t) => 11 + Math.sin(t * LW(3)) * 0.8, s: (t) => 480 - 48 * t, ground: SPEED + 48 },
    { a: lab, x: (t) => 15.5 + Math.sin(t * LW(0.9)) * 0.8, s: (t) => 300 - 30 * t, ground: SPEED + 30 },
    { a: walker, x: () => -12, s: (t) => -420 + 42 * t, ground: 42 - SPEED, yaw: Math.PI },
    { a: sausage, x: (t) => -15.5 + Math.sin(t * LW(1.3)) * 0.4, s: (t) => -413 + 42 * t, ground: 42 - SPEED, yaw: Math.PI },
  ];

  // ---- lights: sunny afternoon
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x5a7a3a, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.5);
  sun.position.set(-90, 160, -70);
  sun.target.position.set(0, 0, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 20, far: 420 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.3;
  scene.add(sun, sun.target);

  const kidZ = (t) => -42 - 10 * Math.sin(t * W) - 3 * Math.sin(t * 3 * W);
  const kidX = (t) => 1 + 1.5 * Math.sin(t * 2 * W) + 0.5 * Math.sin(t * 4 * W);
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function update(time) {
    const t = ((time % LOOP) + LOOP) % LOOP;
    planet.rotation.x = (SPEED * t) / PR;
    for (const f of anims) f(t);
    clouds.position.z = Math.sin(t * W) * 12;

    // the grown-up: holds station a few metres behind, surging a bit as they try to catch up
    onSphere(parent.root, 3.5 + Math.sin(t * W) * 0.6, 32 + 2.5 * Math.sin(t * W + 1));
    parent.update(t);

    // the kid: pulls away, eases off, weaves about
    const zk = kidZ(t), xk = kidX(t);
    const vx = (kidX(t + 0.05) - xk) / 0.05, vz = (kidZ(t + 0.05) - zk) / 0.05;
    const ground = SPEED - vz;
    onSphere(kid.root, xk, zk, Math.atan2(-vx, ground));
    kid.update(t, SPEED * t - (zk - kidZ(0)));

    for (const m of MOVERS) {
      onSphere(m.a.root, m.x(t), m.s(t), m.yaw || 0);
      m.a.update(t, m.ground);
    }
    // the dog lead: hand to collar, with a bit of droop
    scene.updateMatrixWorld();
    walker.hand.getWorldPosition(tmpA);
    sausage.neck.getWorldPosition(tmpB);
    tmpB.y += 1.0;
    const pos = leadGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = i / (pos.count - 1);
      pos.setXYZ(i, tmpA.x + (tmpB.x - tmpA.x) * k, tmpA.y + (tmpB.y - tmpA.y) * k - Math.sin(k * Math.PI) * 3, tmpA.z + (tmpB.z - tmpA.z) * k);
    }
    pos.needsUpdate = true;
  }

  return {
    scene, update, setKid, setParent, exposure: 1.0,
    get kid() { return kid; }, get parent() { return parent; },
    get parentLook() { return parentLookNow; }, get kidLook() { return kidLookNow; },
  };
}

const UP = new THREE.Vector3(0, 1, 0);

// Make any rig's animation repeat every LOOP seconds, however its own timings go: blend from
// the pose at t + LOOP to the pose at t across the loop, so the end lands on the start.
function loopRig(rig) {
  const nodes = [];
  rig.root.traverse((o) => nodes.push(o));
  const snap = nodes.map(() => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3() }));
  const update = rig.update;
  rig.update = (time, ...rest) => {
    const t = ((time % LOOP) + LOOP) % LOOP, k = t / LOOP;
    update(t + LOOP, ...rest);
    nodes.forEach((o, i) => { snap[i].p.copy(o.position); snap[i].q.copy(o.quaternion); snap[i].s.copy(o.scale); });
    update(t, ...rest);
    nodes.forEach((o, i) => { o.position.lerp(snap[i].p, 1 - k); o.quaternion.slerp(snap[i].q, 1 - k); o.scale.lerp(snap[i].s, 1 - k); });
  };
  return rig;
}

function skyTexture(horizon) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  // the planet curves away, so a lot of what you see is "below" the horizon: keep that blue too
  grad.addColorStop(0, '#3f8fe0');
  grad.addColorStop(0.3, '#6fb2ee');
  grad.addColorStop(0.47, '#a8d4f6');
  grad.addColorStop(0.53, '#' + new THREE.Color(horizon).getHexString());
  grad.addColorStop(0.62, '#9fcdf2');
  grad.addColorStop(1, '#7fbaea');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
