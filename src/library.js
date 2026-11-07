import * as THREE from 'three';
import { VoxGroup, rand } from './voxel.js';
import { buildToddler, buildParent, buildTeacher } from './characters.js';

// Library playgroup, morning story time.
// Layout (voxel units, x right, y up, z toward the viewer):
//   back wall z=-37 lined with shelves, window wall x=-47, floor y=-1
//   story rug centred on (0, -2); teacher's chair at the top of the circle (z=-21)
//   our kid sits front-right in the circle, the parent on a chair just behind them.

export const CIRCLE = { x: 0, z: -2, r: 15 };
export const TEACHER_POS = new THREE.Vector3(0, 11, -21);
export const OUR_KID_ANGLE = 22; // degrees round the circle from the front (+z)
export const PARENT_POS = new THREE.Vector3(17, 11, 26);

const onCircle = (deg, r = CIRCLE.r) => {
  const a = THREE.MathUtils.degToRad(deg);
  return new THREE.Vector3(CIRCLE.x + Math.sin(a) * r, 0, CIRCLE.z + Math.cos(a) * r);
};
// everything is modelled facing -z; yaw to face a point
const faceYaw = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

// the other kids at playgroup
const KIDS = [
  { a: -150, look: { skin: 0x8d5524, hair: 0x140d0a, tee: [0x55b86a], legs: [0x6b4f3a, 0x634936], style: 'curly', mode: 'listen', phase: 1.3, brows: 0x140d0a } },
  { a: -108, look: { skin: 0xffdbac, hair: 0xe0b860, tee: [0xff8fc8, 0xffffff], legs: [0x8fd3ff, 0x84c6ef], style: 'bun', bow: 0xff3fa4, mode: 'point', phase: 2.1, brows: 0xc49a4a } },
  { a: -66, look: { skin: 0xc68642, hair: 0x1a1210, tee: [0x3f7fd6], legs: [0x2f2f3a, 0x29293a], style: 'tuft', mode: 'block', blockColor: 0xe64545, phase: 0.4, brows: 0x1a1210 } },
  { a: -22, look: { skin: 0xe0ac69, hair: 0x3a2414, tee: [0xa64dff, 0xd9b8ff], legs: [0x4f7fd1, 0x4a76c4], style: 'pigtails', bow: 0xffd23f, mode: 'listen', phase: 3.4 } },
  // OUR_KID_ANGLE goes here
  { a: 66, look: { skin: 0x6e4019, hair: 0x120c0a, tee: [0xf28c28], legs: [0xffffff, 0xf0f0f0], style: 'curly', mode: 'clap', phase: 1.9, brows: 0x120c0a } },
  { a: 108, look: { skin: 0xf6d0b0, hair: 0xb5532a, tee: [0xe64545, 0xffffff], legs: [0x3a4f78, 0x34476c], style: 'tuft', mode: 'point', phase: 0.2, brows: 0xa0482a } },
  { a: 150, look: { skin: 0xc68642, hair: 0x2a1a12, tee: [0x3fd0ff], legs: [0xf2c94c, 0xe6bd40], style: 'bun', bow: 0xff7a5c, mode: 'block', blockColor: 0x55b86a, phase: 2.8, brows: 0x2a1a12 } },
];

export function buildLibrary({ kidLook = 'girl', parentLook = 'tired' } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3ead8);
  scene.fog = new THREE.Fog(0xf3ead8, 120, 240);

  const room = new THREE.Group();
  scene.add(room);
  buildRoom(room);

  // ---------- people ----------
  const teacher = buildTeacher();
  teacher.root.position.copy(TEACHER_POS);
  teacher.root.rotation.y = Math.PI; // faces the kids
  scene.add(teacher.root);

  const kids = KIDS.map(({ a, look }) => {
    const k = buildToddler(look);
    const p = onCircle(a);
    k.root.position.copy(p);
    k.root.rotation.y = faceYaw(p, TEACHER_POS);
    k.root.scale.setScalar(0.92 + ((a * 7919) % 13) / 100); // not all the same size
    scene.add(k.root);
    return k;
  });

  let ourKid, parent;
  function setKid(look) {
    if (ourKid) scene.remove(ourKid.root);
    ourKid = buildToddler(look);
    const p = onCircle(OUR_KID_ANGLE);
    ourKid.root.position.copy(p);
    ourKid.root.rotation.y = faceYaw(p, TEACHER_POS);
    scene.add(ourKid.root);
  }
  function setParent(look) {
    if (parent) scene.remove(parent.root);
    parent = buildParent(look, 'chair');
    parent.root.position.copy(PARENT_POS);
    // watching their kid (and the story) from just outside the circle
    parent.root.rotation.y = faceYaw(PARENT_POS, onCircle(OUR_KID_ANGLE - 25, 6));
    scene.add(parent.root);
  }
  setKid(kidLook);
  setParent(parentLook);

  // ---------- lights: bright, warm morning ----------
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x7a6450, 1.5));
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.2);
  sun.position.set(-70, 85, 45);
  sun.target.position.set(0, 0, -2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 260 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  for (const [x, z] of [[-18, 0], [18, 0], [0, -24], [0, 24]]) {
    const l = new THREE.PointLight(0xffe9cc, 260, 75, 1.5); // ceiling panels
    l.position.set(x, 42, z);
    scene.add(l);
  }

  function update(t) {
    teacher.update(t);
    for (const k of kids) k.update(t);
    ourKid.update(t);
    parent.update(t);
  }

  return { scene, update, setKid, setParent, exposure: 1.0, get parent() { return parent; }, get kid() { return ourKid; } };
}

// ------------------------------------------------------------------ room
function buildRoom(room) {
  // ---------- carpet tiles ----------
  const floor = new VoxGroup('libFloor');
  floor.boxFn(-46, -1, -36, 92, 1, 72, (x, y, z) => {
    const tile = (Math.floor((x + 46) / 6) + Math.floor((z + 36) / 6)) % 2;
    return tile ? 0x6d8796 : 0x66808f;
  }, 0.05);
  floor.build({ castShadow: false });
  room.add(floor);

  // ---------- round rainbow story rug ----------
  const RAINBOW = [0xe64545, 0xf28c28, 0xf2c94c, 0x55b86a, 0x3fb8c4, 0x3f7fd6, 0x8a5cc8, 0xe86aa6];
  const rug = new VoxGroup('storyRug');
  rug.boxFn(-23, 0, -25, 46, 1, 46, (x, y, z) => {
    const dx = x + 0.5, dz = z + 0.5 + 2, r = Math.hypot(dx, dz);
    if (r > 22.5) return null;
    if (r > 21) return 0xf6efe0; // cream border
    if (r < 5) return 0xfff3d6;
    const a = (Math.atan2(dx, dz) / (Math.PI * 2) + 1) % 1;
    return RAINBOW[Math.floor(a * RAINBOW.length)];
  }, 0.04);
  rug.position.y = -0.8;
  rug.build({ castShadow: false });
  room.add(rug);

  // ---------- walls ----------
  const wallCol = (u) => (Math.floor(u / 4) % 2 ? 0xcfe3cf : 0xc8ddc8);
  const back = new VoxGroup('libBackWall');
  back.boxFn(-47, -1, -37, 94, 46, 1, (x, y) => (y < 2 ? 0xf2ede2 : wallCol(x)), 0.02);
  back.build({ castShadow: false });
  room.add(back);

  const left = new VoxGroup('libLeftWall');
  left.boxFn(-47, -1, -36, 1, 46, 72, (x, y, z) => (y < 2 ? 0xf2ede2 : wallCol(z)), 0.02);
  const windows = [[-26, 14], [0, 14]]; // z start, width
  for (const [z0, w] of windows) {
    left.remove(-47, 10, z0, 1, 24, w);
    left.box(-47, 9, z0 - 1, 3, 1, w + 2, 0xf7f4ec);  // sill
    left.box(-47, 34, z0 - 1, 2, 1, w + 2, 0xf7f4ec);
    left.box(-47, 10, z0 - 1, 2, 24, 1, 0xf7f4ec);
    left.box(-47, 10, z0 + w, 2, 24, 1, 0xf7f4ec);
    left.box(-47, 22, z0, 1, 1, w, 0xf7f4ec);
    // potted plants on the sill
    for (const pz of [z0 + 2, z0 + w - 4]) {
      left.box(-45, 10, pz, 2, 2, 2, 0xc8643a);
      left.box(-45, 12, pz, 2, 2, 2, 0x4caf50);
      left.set(-45, 14, pz + 1, 0x5fc463);
      left.set(-44, 13, pz - 1 >= z0 ? pz - 1 : pz, 0x3f9a4f);
    }
  }
  left.build();
  room.add(left);

  // right wall, and the front wall behind the parent with the kids' art board and a door
  const right = new VoxGroup('libRightWall');
  right.boxFn(46, -1, -36, 1, 46, 72, (x, y, z) => (y < 2 ? 0xf2ede2 : wallCol(z)), 0.02);
  right.build({ castShadow: false });
  room.add(right);
  const front = new VoxGroup('libFrontWall');
  front.boxFn(2, -1, 36, 44, 46, 1, (x, y) => (y < 2 ? 0xf2ede2 : wallCol(x)), 0.02);
  front.box(32, 0, 35, 10, 22, 1, 0xb07a4a); // door
  front.box(33, 11, 34, 1, 1, 1, 0xd8d8d8);
  front.box(36, 14, 35, 4, 6, 1, 0xd6eef8); // door window
  front.box(4, 14, 35, 24, 18, 1, 0xc49a6c); // cork board
  const ART = [0xffffff, 0xfff6c8, 0xffe0ec, 0xe0f4ff];
  for (let i = 0; i < 8; i++) {
    const ax = 5 + (i % 4) * 6, ay = 15 + Math.floor(i / 4) * 8;
    front.boxFn(ax, ay, 34, 5, 7, 1, (x, y, z, u, v) => {
      if ((u + v * 3 + i) % 7 === 0) return [0xe64545, 0x3f7fd6, 0x55b86a, 0xf2c94c][(u + i) % 4]; // scribbles
      if (v === 1 && u > 0 && u < 4) return 0x55b86a;
      if (u === 3 && v === 5) return 0xffd23f;
      return ART[i % 4];
    }, 0.02);
  }
  front.build({ castShadow: false });
  room.add(front);

  // daylight behind the windows
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), new THREE.MeshBasicMaterial({ color: 0xa8dcff }));
  sky.rotation.y = Math.PI / 2;
  sky.position.set(-56, 22, -6);
  room.add(sky);
  const clouds = new VoxGroup('clouds');
  for (const [z, y] of [[-20, 28], [-8, 30], [6, 26], [12, 31]]) {
    clouds.box(0, y, z, 1, 2, 6, 0xffffff, 0.02);
    clouds.box(0, y + 2, z + 1, 1, 1, 3, 0xffffff, 0.02);
  }
  clouds.position.x = -54;
  clouds.build({ emissive: true, castShadow: false, receiveShadow: false });
  room.add(clouds);
  // a tree outside
  const tree = new VoxGroup('tree');
  tree.box(0, 0, 0, 2, 22, 2, 0x6a4a2a);
  tree.sphere(1, 26, 1, 7, 0x4f9a4a, 0.08);
  tree.position.set(-52, -1, -16);
  tree.build({ emissive: true, castShadow: false, receiveShadow: false });
  room.add(tree);

  // ---------- bookshelves along the back wall ----------
  const shelves = new VoxGroup('shelves');
  const WOOD = 0xc89a64, WOOD_DARK = 0xa87c4a;
  const BOOKS = [0xd64545, 0x3f7fd6, 0xf2c94c, 0x55b86a, 0xf28c28, 0x8a5cc8, 0xf4f0e6, 0x2f8f8a, 0xe86aa6, 0x6a4a2a];
  for (const [x0, x1] of [[-42, -2], [2, 42]]) {
    shelves.box(x0, 0, -36, x1 - x0, 1, 5, WOOD_DARK);
    for (let sh = 0; sh < 4; sh++) {
      const y0 = 1 + sh * 7;
      shelves.box(x0, y0 + 6, -36, x1 - x0, 1, 5, WOOD);
      let x = x0 + 1;
      while (x < x1 - 1) {
        const w = rand() < 0.3 ? 2 : 1;
        const h = 3 + Math.floor(rand() * 3);
        if (rand() < 0.08) { x += 2; continue; } // gap
        if (rand() < 0.07 && x + 4 < x1) { // a book face out
          shelves.box(x, y0, -33, 4, 5, 1, BOOKS[Math.floor(rand() * BOOKS.length)]);
          shelves.box(x + 1, y0 + 2, -32, 2, 2, 1, 0xfff6e0);
          x += 5;
          continue;
        }
        const leanBook = x + w <= x1 - 1;
        if (leanBook) shelves.box(x, y0, -35, w, h, 3, BOOKS[Math.floor(rand() * BOOKS.length)], 0.08);
        x += w;
      }
    }
    for (const xs of [x0, x1 - 1]) shelves.box(xs, 0, -36, 1, 29, 5, WOOD_DARK); // uprights
  }
  shelves.build();
  room.add(shelves);

  // ---------- sign + bunting over the shelves ----------
  const sign = makeSign('STORY TIME');
  sign.position.set(0, 35.5, -35.9);
  room.add(sign);
  const bunting = new VoxGroup('bunting', 0.5);
  const FLAGS = [0xe64545, 0xf2c94c, 0x3f7fd6, 0x55b86a, 0xf28c28, 0xe86aa6];
  for (let x = -44; x <= 44; x += 0.5) {
    const sag = 31.5 - Math.cos((x / 44) * Math.PI * 0.5) * 2.5;
    bunting.wbox(x, sag, -33.5, 0.5, 0.5, 0.5, 0xffffff, 0);
  }
  for (let i = 0, x = -42; x <= 40; i++, x += 4) {
    const sag = 31.5 - Math.cos(((x + 1.5) / 44) * Math.PI * 0.5) * 2.5;
    for (let r = 0; r < 6; r++) {
      const half = 1.5 * (1 - r / 6);
      bunting.wbox(x + 1.5 - half, sag - 0.5 - r * 0.5, -33.5, half * 2, 0.5, 0.5, FLAGS[i % FLAGS.length], 0.02);
    }
  }
  bunting.build({ castShadow: false });
  room.add(bunting);

  // ---------- teacher's chair ----------
  function chair(cx, cz, yaw, seatY, col) {
    const g = new VoxGroup('chair');
    g.box(-5, seatY, -5, 10, 1, 10, col);                    // seat
    g.box(-5, seatY + 1, 4, 10, 11, 1, col);                  // back
    for (const [lx, lz] of [[-5, -5], [4, -5], [-5, 4], [4, 4]]) g.box(lx, 0, lz, 1, seatY, 1, 0x555a60);
    g.position.set(cx, 0, cz);
    g.rotation.y = yaw;
    g.build();
    room.add(g);
  }
  chair(TEACHER_POS.x, TEACHER_POS.z - 1.5, Math.PI, 8, 0xd8a24a);
  chair(PARENT_POS.x, PARENT_POS.z + 1.5, faceYaw(PARENT_POS, onCircle(OUR_KID_ANGLE - 25, 6)), 8, 0x3f7fd6);

  // ---------- blocks in the middle of the circle ----------
  const blocks = new VoxGroup('libBlocks');
  const BCOL = [0xe64545, 0x3f7fd6, 0xf2c94c, 0x55b86a, 0xf28c28, 0x9b59b6];
  // a wobbly tower
  [[-2, 0, -4], [-2, 2, -4], [-1, 4, -4], [-2, 6, -3]].forEach(([x, y, z], i) => blocks.box(x, y, z, 2, 2, 2, BCOL[i], 0.03));
  // a little bridge
  blocks.box(3, 0, -7, 2, 2, 2, BCOL[4], 0.03);
  blocks.box(7, 0, -7, 2, 2, 2, BCOL[5], 0.03);
  blocks.box(3, 2, -7, 6, 1, 2, BCOL[2], 0.03);
  // scattered
  for (const [x, z, c] of [[-6, 2, 1], [4, 1, 0], [1, -10, 3], [-8, -8, 2], [8, -1, 3], [-4, 6, 4], [11, 5, 5], [-11, 3, 0], [2, 4, 2]])
    blocks.box(x, 0, z, 2, 2, 2, BCOL[c], 0.03);
  blocks.box(-6, 2, 2, 2, 2, 2, BCOL[5], 0.03);
  // a block crate
  blocks.boxFn(13, 0, -14, 6, 4, 5, (x, y, z, i, j, k) => (i === 0 || i === 5 || k === 0 || k === 4 || j === 0 ? 0xd94a4a : j === 3 ? BCOL[(i + k) % 6] : null));
  blocks.build();
  room.add(blocks);

  // ---------- beanbags, book trolley, pram, nappy bag ----------
  const props = new VoxGroup('libProps');
  props.sphere(-34, 3, 18, 5.5, 0xe64545, 0.04);
  props.remove(-40, -3, 12, 12, 3, 12);
  props.sphere(-24, 3, 28, 5, 0xf2c94c, 0.04);
  props.remove(-30, -3, 22, 12, 3, 12);
  // trolley
  props.box(31, 1, -14, 10, 1, 6, 0x8a5a3a);
  props.box(31, 7, -14, 10, 1, 6, 0x8a5a3a);
  props.box(31, 13, -14, 10, 1, 6, 0x8a5a3a);
  for (const [x, z] of [[31, -14], [40, -14], [31, -9], [40, -9]]) { props.box(x, 1, z, 1, 13, 1, 0x6a4a2a); props.set(x, 0, z, 0x222222); }
  for (let y of [2, 8, 14]) for (let x = 32; x < 40; x++) if (rand() > 0.2) props.box(x, y, -13, 1, 3 + Math.floor(rand() * 2), 4, BOOKS[Math.floor(rand() * BOOKS.length)], 0.08);
  // pram next to the parent
  const px = 29, pz = 20;
  for (const [x, z] of [[px, pz], [px + 7, pz], [px, pz + 9], [px + 7, pz + 9]]) { props.box(x, 0, z, 1, 3, 3, 0x1e1e22); props.set(x, 1, z + 1, 0x8a8a90, 0); }
  props.box(px, 3, pz + 1, 8, 1, 9, 0x8a8a90);
  props.boxFn(px, 4, pz, 8, 7, 11, (x, y, z, i, j, k) => (i === 0 || i === 7 || k === 0 || k === 10 || j === 0 ? 0x3a6e78 : null)); // bassinet
  props.boxFn(px, 11, pz + 6, 8, 5, 5, (x, y, z, i, j, k) => (i === 0 || i === 7 || j === 4 || k === 4 ? (j % 2 ? 0x2f5e66 : 0x3a6e78) : null)); // hood
  props.box(px + 1, 9, pz + 1, 6, 2, 5, 0xf2c4d8); // blanket
  props.box(px, 11, pz - 3, 1, 8, 1, 0x555a60); // handle
  props.box(px + 7, 11, pz - 3, 1, 8, 1, 0x555a60);
  props.box(px, 18, pz - 3, 8, 1, 1, 0x222222);
  props.box(px + 1, 3, pz + 1, 6, 1, 1, 0x555a60);
  // nappy bag slumped by the parent's chair, a muslin hanging out
  props.box(10, 0, 27, 5, 4, 3, 0x5b4b8a);
  props.box(11, 4, 27, 3, 1, 3, 0x4a3c74);
  props.box(14, 2, 26, 2, 1, 2, 0xf6f0e6);
  // somebody's shoes at the edge of the rug
  props.box(-20, 0, 18, 2, 1, 3, 0xff3fa4);
  props.box(-17, 0, 19, 2, 1, 3, 0xff3fa4);
  props.build();
  room.add(props);
}

function makeSign(text) {
  const W = 120, H = 22;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#fff6e0'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#e64545'; g.fillRect(0, 0, W, 2); g.fillRect(0, H - 2, W, 2);
  g.font = 'bold 15px "Courier New", monospace';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cols = ['#e64545', '#f28c28', '#e0b020', '#3f9a4f', '#3f7fd6', '#8a5cc8'];
  const chars = [...text];
  const step = W / (chars.length + 1);
  chars.forEach((ch, i) => { g.fillStyle = cols[i % cols.length]; g.fillText(ch, step * (i + 1), H / 2 + 1); });
  // threshold to hard pixels
  const img = g.getImageData(0, 0, W, H);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(36, 6.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
}
