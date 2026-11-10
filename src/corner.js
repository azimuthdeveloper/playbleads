import * as THREE from 'three';
import { VoxGroup, rand, setSeed } from './voxel.js';
import { buildToddler, buildParent, TODDLER_LOOKS } from './characters.js';

// Outside The Corner, State Library of Queensland's children's space (reopened April 2026),
// at its own entrance on Stanley Place, South Brisbane. A sunny morning bubble-and-water
// play session in the courtyard out the front.
// From the reference photos: sage-green painted concrete with formwork tie holes, a taupe
// hanging sign box with cut-out leaves and bugs, a concrete canopy on one slim column,
// angular sage planters full of bromeliads under slender trees, warm red/orange play walls
// glimpsed through the glass, and the white Gallery of Modern Art across the road.
//
// Layout (x right, y up, z toward the viewer; pavement top at y = 0):
//   library facade x = 30 (building to the right), glazed entry recess z -42..-14
//   canopy x 0..30, z -46..-4, sign hanging at its front edge (z = -4)
//   planter A back left, planter B behind the canopy column, planter C front left
//   water play tub at (0, 0, 4), Stanley Place road z -110..-84, GOMA beyond.

export const KID_POS = new THREE.Vector3(3, 0, -7.5); // across the tub, facing the street
export const PARENT_POS = new THREE.Vector3(-17.5, 11, -27.5);
const TUB = new THREE.Vector3(0, 0, 3);
const faceYaw = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const hash = (a, b, c = 0) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };

export const ARCH = 1.5;
const SAGE = 0x8fae86, SAGE_DARK = 0x7f9e77, SAGE_LIGHT = 0xa9c2a0, CAP = 0xbfc4b8;
const CONCRETE = 0xc9cbc4, PALE = 0xd3d8cc;
const SLQ_RED = 0xa4483a, SLQ_PLUM = 0x6c3a50, SLQ_GREEN = 0x5d7f50;
const GLASS = 0x2f4250;

// the other kids at the session
const KIDS = [
  { pos: [-9, 0, 1], look: { skin: 0xf6d0b0, hair: 0x1a1210, tee: [0x7fe0c8, 0xff8fc8], legs: [0xff7a3c, 0xf06f33], style: 'bun', bow: 0xffd23f, mode: 'block', blockColor: 0xff7a3c, phase: 1.1, brows: 0x1a1210, lookUp: 0.35 } },
  { pos: [9, 0, -4], look: { skin: 0xffdbac, hair: 0xe0c070, tee: [0x2f6fd6, 0xffffff], legs: [0x2f2f3a, 0x29293a], style: 'tuft', mode: 'point', phase: 2.6, brows: 0xc49a4a, lookUp: 0.5 } },
  { pos: [7, 0, 11], look: { skin: 0x8d5524, hair: 0x140d0a, tee: [0xf2c94c], legs: [0x55b86a, 0x4caa60], style: 'curly', mode: 'clap', phase: 0.3, brows: 0x140d0a } },
];

export function buildCorner({ kidLook = 'girl', parentLook = 'tired', loop = 16 } = {}) {
  setSeed(4101);
  const L = loop;
  const W = (2 * Math.PI) / L;
  const snap = (w) => Math.max(1, Math.round(w / W)) * W; // frequencies that repeat in the loop

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xd6eaf7, 170, 340);

  const world = new THREE.Group();
  scene.add(world);
  const anims = [];

  buildGround(world);
  // the architecture is modelled a size down and scaled up, so the building towers over the
  // (chunky) people the way the real one does
  const arch = new THREE.Group();
  arch.scale.setScalar(ARCH);
  world.add(arch);
  buildLibraryFront(arch);
  buildEntryInterior(arch);
  buildCanopyAndSign(arch);
  buildGallery(world);
  for (const p of PLANTERS) buildPlanter(world, p);
  for (const t of TREES) anims.push(tree(world, t, snap));
  buildPlayThings(world);

  // ---------- people ----------
  const kids = KIDS.map(({ pos, look }) => {
    const k = buildToddler(look, { loop: L });
    k.root.position.set(...pos);
    k.root.rotation.y = faceYaw(k.root.position, TUB);
    scene.add(k.root);
    return k;
  });
  let ourKid, parent;
  function setKid(look) {
    if (ourKid) scene.remove(ourKid.root);
    ourKid = buildToddler({ ...(typeof look === 'object' ? look : TODDLER_LOOKS[look] || TODDLER_LOOKS.girl), mode: 'point', lookUp: 0.55 }, { loop: L });
    ourKid.root.position.copy(KID_POS);
    ourKid.root.rotation.y = faceYaw(KID_POS, TUB);
    scene.add(ourKid.root);
  }
  function setParent(look) {
    if (parent) scene.remove(parent.root);
    parent = buildParent(look, 'chair', { loop: L });
    parent.root.position.copy(PARENT_POS);
    parent.root.rotation.y = faceYaw(PARENT_POS, TUB);
    scene.add(parent.root);
  }
  setKid(kidLook);
  setParent(parentLook);

  // ---------- wildlife and bubbles ----------
  const bird = ibis(snap);
  scene.add(bird.root);
  anims.push((t) => {
    // a bin chicken doing slow laps of the courtyard, one per loop
    const a = t * W, cx = -46, cz = 30, rx = 15, rz = 10;
    bird.root.position.set(cx + Math.sin(a) * rx, 0, cz + Math.cos(a) * rz);
    bird.root.rotation.y = Math.atan2(-Math.cos(a) * rx, Math.sin(a) * rz);
    bird.update(t);
  });
  const dragon = waterDragon(snap, L);
  dragon.root.position.set(-48, 8, -23);
  dragon.root.rotation.y = -Math.PI / 2 + 0.25; // basking along the planter wall, facing the kids
  scene.add(dragon.root);
  anims.push(dragon.update);
  anims.push(bubbles(scene, L));
  [0x2f7ff0, 0xf28c28, 0xf2d23f].forEach((col, i) => anims.push(butterfly(scene, col, i, snap)));

  // ---------- lights: bright Brisbane morning ----------
  scene.add(new THREE.HemisphereLight(0xe6f2ff, 0x8a7a62, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
  sun.position.set(-90, 130, 70);
  sun.target.position.set(0, 0, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 400 });
  sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const inside = new THREE.PointLight(0xffc48a, 520, 70, 1.5); // warm light inside The Corner
  inside.position.set(54 * ARCH, 26 * ARCH, -28 * ARCH);
  scene.add(inside);
  const underCanopy = new THREE.PointLight(0xfff2dc, 160, 40, 1.5);
  underCanopy.position.set(16 * ARCH, 36 * ARCH, -24 * ARCH);
  scene.add(underCanopy);

  function update(t) {
    for (const k of kids) k.update(t);
    ourKid.update(t);
    parent.update(t);
    for (const f of anims) f(t);
  }

  return { scene, update, setKid, setParent, exposure: 1.0, get kid() { return ourKid; }, get parent() { return parent; } };
}

// ------------------------------------------------------------------ ground
function buildGround(world) {
  const pave = new VoxGroup('pavement');
  pave.boxFn(-130, -1, -84, 176, 1, 170, (x, y, z) => {
    const h = hash(x, z);
    if ((x - z * 0.55) % 46 === 0 || z % 28 === 0) return 0xa9a69d; // saw-cut joints
    return h < 0.5 ? 0xc6c2b8 : h < 0.92 ? 0xbfbbb1 : 0xcdc9bf;
  }, 0.03);
  pave.build({ castShadow: false });
  world.add(pave);

  // Stanley Place: kerb, road, far footpath
  const road = new VoxGroup('road');
  road.box(-130, -1, -86, 200, 1, 2, 0xa8a59c);
  road.boxFn(-130, -2, -112, 200, 1, 26, (x, y, z) => (z === -99 && ((x + 200) % 14) < 7 ? 0xf2f0e6 : hash(x, z) < 0.5 ? 0x4b4d52 : 0x45474c), 0.04);
  road.boxFn(-130, -1, -134, 200, 1, 22, (x, y, z) => (z === -113 ? 0xa8a59c : hash(x, z) < 0.5 ? 0xd2cec4 : 0xcac6bc), 0.03);
  road.build({ castShadow: false });
  world.add(road);
}

// ------------------------------------------------------------------ the library
function buildLibraryFront(world) {
  const Z0 = -84, Z1 = 70;
  const g = new VoxGroup('slqFront');
  // ground floor: sage painted concrete, panel joints and formwork tie holes
  g.boxFn(30, 0, Z0, 2, 42, Z1 - Z0, (x, y, z) => {
    if (x === 31) return SAGE_DARK;
    if (y === 21 || y === 0) return SAGE_DARK;             // horizontal reveal / plinth
    if (((z + 200) % 26) === 0) return SAGE_DARK;          // panel joints
    if (((z + 200) % 13) === 6 && (y % 10) === 5) return 0x56684f; // tie holes
    return y > 21 ? SAGE : SAGE_LIGHT;
  }, 0.025);
  g.box(32, 0, Z1 - 1, 40, 42, 1, SAGE);                  // end wall
  // entry recess: the glazed front door of The Corner, tucked in under the building
  g.remove(30, 1, -42, 2, 34, 28);
  g.box(30, 0, -43, 12, 36, 1, SAGE_DARK);
  g.box(30, 0, -14, 12, 36, 1, SAGE_DARK);
  g.box(30, 35, -43, 12, 2, 30, PALE);
  // a long bench seat in the recess, like the photos
  g.box(32, 0, -40, 3, 4, 10, 0x8a6a4a);
  // first floor: pale concrete band that oversails the ground floor a little
  g.boxFn(27, 42, Z0, 4, 4, Z1 - Z0, (x, y) => (y === 42 ? 0xb8bdb1 : PALE), 0.02);
  g.boxFn(30, 46, Z0, 2, 22, Z1 - Z0, (x, y, z) => {
    if (y >= 51 && y <= 60) return (((z + 200) % 18) === 0) ? 0x9aa196 : (hash(y, z) < 0.15 ? 0x6f8aa0 : GLASS); // window strip
    if (((z + 200) % 13) === 6 && (y % 10) === 5) return 0x8d958a;
    return y < 51 ? 0xd9dccf : 0xcfd3c6;
  }, 0.02);
  // upper levels: the State Library's painted concrete in red, plum and green, with glazing
  g.boxFn(24, 68, Z0, 7, 3, Z1 - Z0, (x, y) => (y === 68 ? 0xb3b7ab : PALE), 0.02);
  const PAINT = [SLQ_RED, SLQ_GREEN, SLQ_PLUM, SLQ_RED, SAGE, SLQ_PLUM];
  g.boxFn(30, 71, Z0, 2, 34, Z1 - Z0, (x, y, z) => {
    const bay = Math.floor((z + 200) / 22);
    if (y > 78 && y < 98 && (z + 200) % 22 >= 15) return hash(y, z) < 0.1 ? 0x7d9ab0 : GLASS; // tall windows
    if ((z + 200) % 22 === 0) return 0x9a9a92;
    return PAINT[bay % PAINT.length];
  }, 0.03);
  g.box(22, 105, Z0, 12, 2, Z1 - Z0, PALE); // roof overhang
  // vertical fins over the glazing
  for (let z = Z0 + 2; z < Z1; z += 22) g.box(28, 71, z + 17, 2, 34, 1, 0xe5e5dd);
  g.build();
  world.add(g);

  // big glass front of The Corner, at the back of the recess
  const glass = new VoxGroup('slqGlass');
  glass.boxFn(42, 0, -42, 1, 35, 28, (x, y, z) => ((z + 42) % 7 === 0 || y === 0 || y === 34 ? null : 0xbfdcec), 0.01);
  glass.build({ castShadow: false });
  const gm = glass.children[0];
  gm.material.transparent = true;
  gm.material.opacity = 0.22;
  gm.material.depthWrite = false;
  gm.material.roughness = 0.1;
  world.add(glass);
  const frames = new VoxGroup('slqFrames');
  frames.boxFn(42, 0, -42, 1, 35, 28, (x, y, z) => ((z + 42) % 7 === 0 || y === 0 || y === 34 ? 0x3a3a3c : null), 0.02);
  frames.box(41, 16, -31, 1, 1, 6, 0xd8d8d8); // door pulls
  frames.build();
  world.add(frames);
}

// what you can see through the glass: an orange play wall with a blobby hole, timber stairs,
// pale green soft blocks, a red reading nook
function buildEntryInterior(world) {
  const g = new VoxGroup('cornerInside');
  g.boxFn(30, -1, -43, 40, 1, 30, (x) => (x < 42 ? 0xb9b5ab : 0xe2c27a), 0.03); // entry, then the yellow play floor
  g.box(70, 0, -44, 1, 40, 32, 0xf2e8d6); // back wall
  g.box(42, 0, -44, 29, 40, 1, 0xefe4cf);
  g.box(42, 0, -13, 29, 40, 1, 0xefe4cf);
  g.box(43, 38, -43, 27, 1, 30, 0xf6efe2); // ceiling
  // the orange play wall with a wobbly window
  g.boxFn(56, 0, -36, 3, 22, 18, (x, y, z) => {
    const u = z + 27, v = y - 12;
    if ((u / 6) ** 2 + (v / 4 + Math.sin(u * 0.6) * 0.25) ** 2 < 1) return null;
    if ((u - 6) ** 2 + (v - 2) ** 2 < 2.5) return null;
    return 0xf0643c;
  }, 0.03);
  g.box(54, 0, -36, 2, 6, 18, 0xe85a34);
  // timber stair-seats up the side
  for (let i = 0; i < 5; i++) g.box(60 + i * 2, 0, -42, 2, 3 + i * 3, 8, i % 2 ? 0xd9b47c : 0xcfa870);
  for (let i = 0; i < 5; i++) g.box(60 + i * 2, 3 + i * 3, -42, 2, 1, 8, 0x9e3b3b); // red carpet treads
  // soft blocks
  g.box(46, 0, -24, 6, 3, 5, 0xc6d9a0);
  g.box(47, 3, -23, 4, 3, 3, 0xd2e2b0);
  g.box(48, 0, -30, 5, 2, 4, 0xbcd396);
  // a plum reading nook with a round window
  g.boxFn(62, 0, -24, 8, 20, 10, (x, y, z, i, j, k) => {
    if (i === 0 && (j - 11) ** 2 + (k - 5) ** 2 < 10) return null;
    return i === 0 || k === 0 || k === 9 || j === 19 ? 0x7a2f45 : null;
  }, 0.04);
  g.box(64, 0, -23, 6, 4, 8, 0xc8402f);
  // a little shelf of picture books
  const BOOKS = [0xe64545, 0x3f7fd6, 0xf2c94c, 0x55b86a, 0xf28c28, 0x8a5cc8];
  g.box(44, 0, -42, 10, 1, 3, 0xd9b47c);
  g.box(44, 7, -42, 10, 1, 3, 0xd9b47c);
  for (let x = 45; x < 53; x++) g.box(x, 1, -42, 1, 3 + (x % 3), 2, BOOKS[x % BOOKS.length], 0.06);
  g.build({ castShadow: false });
  world.add(g);
}

// ------------------------------------------------------------------ canopy, column and sign
function buildCanopyAndSign(world) {
  const g = new VoxGroup('canopy');
  g.boxFn(0, 40, -46, 30, 3, 42, (x, y) => (y === 40 ? 0xcfd0c8 : 0xbdbfb7), 0.02);
  g.box(-1, 40, -46, 1, 3, 42, 0xa9aba3);
  g.box(0, 40, -5, 30, 3, 1, 0xa9aba3);
  // slim round-ish column holding up the corner
  g.boxFn(1, 0, -9, 3, 40, 3, (x, y, z, i, j, k) => (i !== 1 && k !== 1 ? null : 0xc4c6be), 0.02);
  g.box(2, 0, -8, 1, 40, 1, 0xc9cbc3);
  // downlights in the soffit
  for (let x = 6; x < 28; x += 8) for (let z = -40; z < -8; z += 10) g.set(x, 39, z, 0xfff6dc, 0);
  // sign bracket off the building
  g.box(20, 71, -5, 10, 1, 1, 0x6e6a64);
  g.box(20, 43, -5, 1, 28, 1, 0x6e6a64);
  g.build();
  world.add(g);

  // the hanging sign box: taupe with "The Corner" and cut-out leaves and bugs
  const tex = signTexture();
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const side = new THREE.MeshStandardMaterial({ color: 0xa69b8f, roughness: 0.85 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(28, 27, 2), [side, side, side, side, face, face]);
  sign.position.set(6, 43 + 13.5, -4.5); // clear of the slab edges on the building
  sign.castShadow = true;
  sign.receiveShadow = true;
  world.add(sign);
}

function signTexture() {
  const W = 224, H = 216;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#b3a89c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#a99e92'; g.fillRect(0, 50, W, 1); // panel joint under the lettering
  g.font = '600 40px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#7d746a'; g.fillText('The Corner', W / 2 + 1.5, 30 + 1.5);
  g.fillStyle = '#fbf8f2'; g.fillText('The Corner', W / 2, 30);
  // cut-out leaves, a beetle and a bee scattered about
  const leaf = (x, y, s, a, col) => {
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col;
    g.beginPath(); g.ellipse(0, 0, 4 * s, 7 * s, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(-4 * s, -2 * s, 3 * s, 4.5 * s, -0.7, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(4 * s, -2 * s, 3 * s, 4.5 * s, 0.7, 0, Math.PI * 2); g.fill();
    g.fillRect(-0.6 * s, 4 * s, 1.2 * s, 5 * s);
    g.restore();
  };
  const bug = (x, y, s, a, col) => {
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.2 * s;
    g.beginPath(); g.ellipse(0, 0, 3.4 * s, 4.6 * s, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0, -5.5 * s, 2 * s, 0, Math.PI * 2); g.fill();
    for (const k of [-1, 1]) for (const yy of [-2, 0.5, 3]) { g.beginPath(); g.moveTo(0, yy * s); g.lineTo(k * 6 * s, (yy - 1.5) * s); g.stroke(); }
    g.restore();
  };
  const spots = [[20, 18, 1, 0.3, 'w'], [200, 22, 0.9, -0.5, 'd'], [178, 64, 1.1, 0.9, 'd'], [64, 82, 1.2, -0.4, 'd'],
    [128, 96, 1, 0.2, 'd'], [190, 116, 1.1, 1.6, 'b'], [32, 120, 1, -1.1, 'w'], [96, 132, 1.1, 0.6, 'd'], [150, 150, 1.2, -0.8, 'd'],
    [60, 170, 1, 2.2, 'b'], [204, 176, 0.9, 0.4, 'w'], [120, 196, 1, -0.2, 'd'], [24, 196, 0.9, 0.9, 'd'], [160, 100, 0.8, 2.6, 'w']];
  for (const [x, y, s, a, k] of spots) {
    if (k === 'b') bug(x, y, s, a, '#2f2b27');
    else leaf(x, y, s, a, k === 'w' ? '#f4f1ea' : '#34302b');
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ------------------------------------------------------------------ GOMA across Stanley Place
function buildGallery(world) {
  const g = new VoxGroup('goma', 2);
  // long white box with a thin oversailing roof and a band of glass
  g.boxFn(-90, 0, -95, 75, 26, 14, (x, y, z) => {
    if (y >= 4 && y <= 11 && z === -82) return x % 6 === 0 ? 0xc4c8cc : 0x5d6e7c; // glazing
    return y > 22 ? 0xf2f2ee : (x % 10 === 0 ? 0xdedfd9 : 0xeaeae4);
  }, 0.02);
  g.box(-94, 26, -97, 83, 1, 19, 0xf8f8f4);
  g.box(-92, 0, -82, 1, 26, 1, 0xd8d8d2);
  for (let x = -88; x < -14; x += 8) g.box(x, 0, -79, 1, 26, 1, 0xe8e8e2); // slim columns under the roof
  g.build({ castShadow: false });
  world.add(g);
  const qag = new VoxGroup('qag', 2);
  qag.boxFn(-14, 0, -98, 50, 18, 16, (x, y) => (y > 15 ? 0xd9d4c8 : (y % 4 === 0 ? 0xc9c2b2 : 0xd3ccbd)), 0.02);
  qag.build({ castShadow: false });
  world.add(qag);
}

// ------------------------------------------------------------------ planters
// sage concrete walls with a pale cap, filled with mulch, bromeliads, cordylines and ferns
const PLANTERS = [
  { name: 'A', poly: [[-130, -82], [-12, -82], [-12, -36], [-26, -22], [-130, -22]] },
  { name: 'B', poly: [[-6, -82], [30, -82], [30, -50], [16, -46], [-6, -48]] },
  { name: 'C', poly: [[-130, -6], [-34, -6], [-28, 4], [-28, 12], [-130, 12]] },
];
const WALL_H = 8;
function inPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function buildPlanter(world, { name, poly }) {
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const g = new VoxGroup('planter' + name);
  const plants = new VoxGroup('plants' + name, 0.5);
  const IN = (x, z) => inPoly(poly, x + 0.5, z + 0.5);
  const spots = [];
  for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
    if (!IN(x, z)) continue;
    let edge = false;
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, 1], [1, -1], [-1, -1]]) if (!IN(x + dx, z + dz)) edge = true;
    if (edge) {
      g.box(x, 0, z, 1, WALL_H - 1, 1, (z % 9 === 0 && x % 2 === 0) ? SAGE_DARK : SAGE, 0.025);
      g.set(x, WALL_H - 1, z, CAP, 0.03);
      if (hash(x, z) < 0.03) g.set(x, 2, z, 0x7a7c74, 0); // little step lights in the wall
    } else {
      g.box(x, 0, z, 1, WALL_H - 2, 1, 0x4a3524, 0);
      g.set(x, WALL_H - 2, z, hash(x, z) < 0.5 ? 0x6b4a33 : 0x7a5638, 0.05); // mulch
      if (hash(x, z, 3) < 0.035) spots.push([x + 0.5, z + 0.5]);
    }
  }
  g.build();
  world.add(g);
  // plants, kept a bit in from the walls
  const top = WALL_H - 1;
  for (const [x, z] of spots) {
    const r = hash(x, z, 9);
    if (r < 0.45) bromeliad(plants, x, top, z, r);
    else if (r < 0.62) cordyline(plants, x, top, z);
    else fern(plants, x, top, z, r);
  }
  plants.build();
  world.add(plants);
}
function bromeliad(g, x, y, z, r) {
  const cols = r < 0.15 ? [0x7a2440, 0x962e4f] : r < 0.3 ? [0x3f6b3a, 0x4f7d3f] : [0x5a2a3a, 0x3f5a35];
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r * 6, len = 3.2 + hash(k, x) * 1.6;
    g.cap(x, y + 0.6, z, x + Math.cos(a) * len, y + 2.6 + hash(z, k) * 1.4, z + Math.sin(a) * len, 0.45, cols[k % 2], 0.06);
  }
  g.ell(x, y + 1.2, z, 0.9, 0.9, 0.9, r < 0.15 ? 0xe23a3a : 0x6e8a3a, 0.05);
}
function cordyline(g, x, y, z) {
  g.cap(x, y, z, x + 0.4, y + 6, z, 0.4, 0x5a4434);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2, len = 3.5;
    g.cap(x + 0.4, y + 6, z, x + 0.4 + Math.cos(a) * len, y + 7.5 + Math.sin(k * 2.3) * 2, z + Math.sin(a) * len, 0.35, k % 2 ? 0x6e1f3c : 0x8a2e4c, 0.06);
  }
}
function fern(g, x, y, z, r) {
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + r * 4;
    g.cap(x, y + 0.5, z, x + Math.cos(a) * 3.8, y + 2.4, z + Math.sin(a) * 3.8, 0.55, k % 2 ? 0x5f9a45 : 0x6fae4f, 0.08);
  }
}

// ------------------------------------------------------------------ trees
// slender trunks, loose lumpy canopies (like the lilly pillies and eucalypts in the photos)
const TREES = [
  { x: -46, z: -54, h: 76, r: 17, lean: 3 }, { x: -78, z: -40, h: 86, r: 19, lean: -2 }, { x: -24, z: -70, h: 92, r: 16, lean: 2 },
  { x: -106, z: -62, h: 80, r: 18, lean: 0 }, { x: 8, z: -70, h: 84, r: 15, lean: -3 }, { x: 22, z: -60, h: 66, r: 12, lean: 1 },
  { x: -66, z: 4, h: 70, r: 17, lean: 2 }, { x: -110, z: 2, h: 80, r: 18, lean: -1 },
];
function tree(world, { x, z, h, r, lean }, snap) {
  const root = new THREE.Group();
  root.position.set(x, WALL_H - 1, z);
  const trunk = new VoxGroup('trunk', 0.5);
  trunk.cap(0, 0, 0, lean * 0.5, h * 0.55, 0, 1.3, 0x7d6a58, 0.08);
  trunk.cap(lean * 0.5, h * 0.55, 0, lean, h * 0.85, 0, 0.9, 0x86735f, 0.08);
  trunk.cap(lean * 0.5, h * 0.5, 0, lean * 0.5 + r * 0.5, h * 0.75, r * 0.2, 0.7, 0x86735f, 0.08);
  trunk.cap(lean * 0.5, h * 0.55, 0, lean * 0.5 - r * 0.45, h * 0.78, -r * 0.25, 0.7, 0x86735f, 0.08);
  trunk.build();
  root.add(trunk);
  const crown = new THREE.Group();
  crown.position.set(lean * 0.5, h * 0.55, 0);
  root.add(crown);
  const leaves = new VoxGroup('crown', 2);
  const GREENS = [0x4f8a3a, 0x5c9a42, 0x3f7533, 0x6aa84a];
  const blobs = 6;
  for (let k = 0; k < blobs; k++) {
    const a = (k / blobs) * Math.PI * 2 + x;
    const bx = Math.cos(a) * r * 0.55, bz = Math.sin(a) * r * 0.55, by = h * 0.25 + Math.sin(k * 1.7 + z) * 4;
    leaves.ell(bx, by, bz, r * 0.55, r * 0.4, r * 0.55, (px, py, pz) => {
      const hh = hash(Math.floor(px / 2), Math.floor(py / 2), Math.floor(pz / 2));
      if (hh < 0.12) return null; // gaps, so it reads as leafy
      return py > by + r * 0.2 ? GREENS[3] : GREENS[Math.floor(hh * 3)];
    }, 0.06);
  }
  leaves.ell(0, h * 0.38, 0, r * 0.6, r * 0.38, r * 0.6, (px, py, pz) => (hash(px, py, pz) < 0.1 ? null : GREENS[(Math.floor(px + pz) & 1) ? 3 : 1]), 0.06);
  leaves.build();
  crown.add(leaves);
  world.add(root);
  const w1 = snap(0.9 + (x % 3) * 0.1), ph = z * 0.37;
  return (t) => {
    crown.rotation.z = Math.sin(t * w1 + ph) * 0.012;
    crown.rotation.x = Math.sin(t * w1 * 2 + ph) * 0.008;
  };
}

// ------------------------------------------------------------------ water play, picnic rug, bubble machine
function buildPlayThings(world) {
  const g = new VoxGroup('waterPlay', 0.5);
  const { x, z } = TUB;
  // shallow round grey tub on short legs
  g.fill(x - 7, 0, z - 5, x + 7, 5.5, z + 5, (px, py, pz) => {
    const e = ((px - x) / 7) ** 2 + ((pz - z) / 5) ** 2;
    if (e > 1) return false;
    if (py < 3) return e > 0.8 && Math.abs(px - x) > 5;   // legs
    return py < 3.5 || e > 0.8;
  }, 0x8e959b, 0.03);
  g.fill(x - 6.5, 4.5, z - 4.5, x + 6.5, 5, z + 4.5, (px, py, pz) => ((px - x) / 6.4) ** 2 + ((pz - z) / 4.4) ** 2 <= 0.8, (px, py, pz) => (hash(px * 2, pz * 2) < 0.12 ? 0xcdeefa : 0x7cc4e4), 0.03);
  // floating toys: an orange water wheel, a teal boat, a red jug
  g.wbox(x - 3, 5, z - 1, 2, 2, 2, 0xf27a1f, 0.03);
  g.wbox(x - 2.5, 7, z - 0.5, 1, 1, 1, 0xffb03a, 0.03);
  g.wbox(x + 1.5, 5, z + 1, 3, 1, 1.5, 0x2fb8a6, 0.03);
  g.wbox(x + 2.5, 6, z + 1.25, 0.5, 1.5, 0.5, 0xffffff, 0);
  g.wbox(x + 2, 5, z - 3, 1.5, 2, 1.5, 0xe64545, 0.03);
  // picnic rug the kids sit on
  g.fill(-16, 0, -14, 16, 0.4, 20, () => true, (px, py, pz) => ((Math.floor(px / 3) + Math.floor(pz / 3)) % 2 ? 0x3f7fd6 : 0xf6f1e6), 0.03);
  // bubble machine on the rug: a little blue box with a fan grill
  g.wbox(12, 0.5, 6, 4, 3, 3, 0x2f6fd6, 0.03);
  g.wbox(12.5, 1, 9, 3, 2, 0.5, 0x22252a, 0.02);
  g.wbox(13.5, 3.5, 7, 1, 1, 1, 0xff5fa8, 0.02);
  // a couple of plastic buckets
  g.wbox(-14, 0.5, 14, 2.5, 3, 2.5, 0xffd23f, 0.03);
  g.wbox(-15, 0.5, 10, 2, 2.5, 2, 0x55b86a, 0.03);
  g.build();
  world.add(g);
}

// voxel bubbles drifting off the machine on the breeze; every one loops back on itself
function bubbles(scene, L) {
  const N = 30, P = L / 2;
  const mat = new THREE.MeshStandardMaterial({ color: 0xe6f6ff, emissive: 0x6a8aa8, emissiveIntensity: 0.6, transparent: true, opacity: 0.5, roughness: 0.05, depthWrite: false });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const list = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(geo, mat);
    scene.add(m);
    list.push({ m, ph: i / N, s: 0.7 + hash(i, 1) * 0.9, dx: (hash(i, 2) - 0.5) * 30, dz: 14 + hash(i, 3) * 26, rise: 10 + hash(i, 4) * 26 });
  }
  return (t) => {
    for (const b of list) {
      const f = ((t / P + b.ph) % 1 + 1) % 1;
      const wob = Math.sin(f * Math.PI * 6 + b.ph * 20);
      b.m.position.set(14 + b.dx * f + wob * 1.2, 4 + b.rise * Math.sqrt(f) + Math.sin(f * 9 + b.ph * 7) * 1.5, 9 + b.dz * f);
      const grow = Math.min(1, f * 12), pop = f > 0.93 ? 1 - (f - 0.93) / 0.07 : 1;
      b.m.scale.setScalar(b.s * grow * pop + 1e-3);
      b.m.rotation.set(f * 4 + b.ph, f * 6, 0);
    }
  };
}

function butterfly(scene, col, i, snap) {
  const root = new THREE.Group();
  const body = new VoxGroup('bfBody', 0.25);
  body.cap(0, 0, -0.6, 0, 0, 0.6, 0.18, 0x1a1a1a, 0);
  body.build();
  root.add(body);
  const wings = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Group();
    const w = new VoxGroup('bfWing', 0.25);
    w.fill(0, -0.1, -1.2, s * 1.8, 0.1, 1.2, (x, y, z) => ((x * s) / 1.8) ** 2 + (z / 1.2) ** 2 <= 1 || ((x * s) / 1.2) ** 2 + ((z - 0.8) / 1) ** 2 <= 1,
      (x, y, z) => (((x * s) / 1.8) ** 2 + (z / 1.2) ** 2 > 0.6 ? 0x1a1a1a : col), 0.02);
    w.build({ castShadow: false });
    p.add(w);
    root.add(p);
    wings.push([p, s]);
  }
  scene.add(root);
  const C = [[-60, 18, -40], [-40, 16, 2], [10, 14, -56]][i];
  const w = snap(0.8 + i * 0.25), flap = snap(18 + i * 3);
  return (t) => {
    const a = t * w + i * 2;
    root.position.set(C[0] + Math.sin(a) * 9, C[1] + Math.sin(a * 2) * 2.5 + Math.abs(Math.sin(t * flap)) * 0.4, C[2] + Math.cos(a) * 6);
    root.rotation.y = Math.atan2(-Math.cos(a) * 9, Math.sin(a) * 6);
    for (const [p, s] of wings) p.rotation.z = s * Math.sin(t * flap) * 0.9;
  };
}

// ------------------------------------------------------------------ the local wildlife
// an Australian white ibis (bin chicken): white body, bald black head, long down-curved beak
function ibis(snap) {
  const root = new THREE.Group();
  const R = 0.25;
  const body = new VoxGroup('ibisBody', R);
  body.ell(0, 9, 0.3, 2.3, 2.3, 4, (x, y, z) => (z > 2.8 && y < 9.6 ? 0x1c1c1e : (y < 7.5 ? 0xe4e1d8 : 0xf4f2ec)), 0.03);
  body.ell(0, 9.3, 3.6, 1.6, 1.2, 1.8, 0x202022, 0.03); // black plumes over the tail
  body.build();
  root.add(body);
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.9, 8, 0.4);
    const l = new VoxGroup('ibisLeg', R);
    l.cap(0, 0, 0, 0, -4, 0.3, 0.4, 0x2a2a2c, 0.02);
    l.cap(0, -4, 0.3, 0, -8, 0, 0.3, 0x2a2a2c, 0.02);
    l.cap(0, -8, 0, 0, -8, -1.4, 0.3, 0x2a2a2c, 0.02); // toes
    l.build();
    hip.add(l);
    root.add(hip);
    legs.push([hip, s]);
  }
  const neck = new THREE.Group();
  neck.position.set(0, 10.6, -3);
  const n = new VoxGroup('ibisNeck', R);
  n.cap(0, 0, 0, 0, 3.4, -1.2, 0.85, (x, y) => (y > 1.8 ? 0x18181a : 0xf2f0ea), 0.03);
  n.ell(0, 4.2, -1.6, 1.05, 1, 1.25, 0x18181a, 0.03);
  n.cap(0, 4.0, -2.6, 0, 3.0, -5, 0.32, 0x141416, 0.02); // the beak, curving down
  n.cap(0, 3.0, -5, 0, 1.4, -6.6, 0.28, 0x141416, 0.02);
  n.set(Math.round(-0.75 / R), Math.round(4.5 / R), Math.round(-2.0 / R), 0x7a1c1c, 0);
  n.set(Math.round(0.6 / R), Math.round(4.5 / R), Math.round(-2.0 / R), 0x7a1c1c, 0);
  n.build();
  neck.add(n);
  root.add(neck);
  const step = snap(5.5), peck = snap(1.7);
  function update(t) {
    const c = Math.sin(t * step);
    for (const [hip, s] of legs) hip.rotation.x = c * s * 0.45;
    body.position.y = Math.abs(c) * 0.25;
    // strut, then a quick jab at the pavement every so often
    const p = Math.max(0, Math.sin(t * peck)) ** 6;
    neck.rotation.x = -0.15 + Math.sin(t * step * 2) * 0.06 - p * 1.7;
  }
  root.scale.setScalar(0.95);
  return { root, update };
}

// an eastern water dragon basking on the planter wall: head bobs, push-ups, a slow arm wave
function waterDragon(snap, L) {
  const root = new THREE.Group();
  const R = 0.25;
  const DRAGON = 0x6f6a55, DRAGON_D = 0x55513f, BELLY = 0xb7ad8a;
  const body = new VoxGroup('dragonBody', R);
  body.ell(0, 1.3, 0, 1.3, 1, 3.2, (x, y) => (y < 0.9 ? BELLY : DRAGON), 0.06);
  body.cap(0, 1.2, 2.8, 0, 0.8, 7, 0.75, DRAGON, 0.06);           // tail, tapering
  body.cap(0, 0.8, 7, 0.8, 0.5, 12, 0.45, (x, y, z) => (Math.floor(z) % 2 ? DRAGON_D : DRAGON), 0.06);
  body.cap(0.8, 0.5, 12, 2, 0.4, 15, 0.25, DRAGON_D, 0.06);
  for (let z = -2.5; z < 4; z += 0.75) body.set(0, Math.round((2.5 - Math.abs(z) * 0.08) / R), Math.round(z / R), 0xd9cfa0, 0.04); // spiky crest
  for (const [sx, sz] of [[-1, 2], [1, 2]]) body.cap(sx * 1.1, 1, sz, sx * 2.4, 0.2, sz + 1, 0.4, DRAGON, 0.05); // back legs
  body.cap(1.1, 1, -2, 2.4, 0.2, -3, 0.4, DRAGON, 0.05); // right front leg
  body.build();
  root.add(body);
  const arm = new THREE.Group();
  arm.position.set(-1.1, 1.1, -2);
  const a = new VoxGroup('dragonArm', R);
  a.cap(0, 0, 0, -1.3, -0.8, -1, 0.4, DRAGON, 0.05);
  a.build();
  arm.add(a);
  root.add(arm);
  const head = new THREE.Group();
  head.position.set(0, 1.6, -3);
  const h = new VoxGroup('dragonHead', R);
  h.ell(0, 0.3, -1.4, 1.05, 0.95, 1.7, (x, y, z) => (Math.abs(y - 0.45) < 0.15 && z > -1.6 ? 0x1e1c18 : y < 0 ? BELLY : DRAGON), 0.05);
  h.set(Math.round(-1 / R), Math.round(0.6 / R), Math.round(-1.9 / R), 0x0f0f0f, 0);
  h.set(Math.round(0.95 / R), Math.round(0.6 / R), Math.round(-1.9 / R), 0x0f0f0f, 0);
  h.build();
  head.add(h);
  root.add(head);
  root.scale.setScalar(1.2);
  const P = L / Math.max(1, Math.round(L / 5.5)); // one routine every ~5.5 s, fitted to the loop
  return (function () {
    const update = (t) => {
      const u = ((t % P) + P) % P;
      const bob = u > 1 && u < 2.2 ? Math.abs(Math.sin((u - 1) * Math.PI * 3.3)) : 0; // quick bobs
      head.rotation.x = -bob * 0.35;
      root.position.y = 8 + (u > 1 && u < 2.2 ? Math.abs(Math.sin((u - 1) * Math.PI * 1.65)) * 0.5 : 0);
      const wave = u > 3 && u < 4.6 ? Math.sin(((u - 3) / 1.6) * Math.PI) : 0; // slow circular arm wave
      arm.rotation.z = wave * 0.9;
      arm.rotation.x = wave * Math.sin((u - 3) * 8) * 0.3;
      head.rotation.y = Math.sin(t * snap(0.5)) * 0.2;
    };
    return { root, update };
  })();
}

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3f8ee0');
  grad.addColorStop(0.35, '#7ab8ee');
  grad.addColorStop(0.5, '#d6eaf7');
  grad.addColorStop(1, '#c9dcc0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
