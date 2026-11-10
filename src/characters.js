import * as THREE from 'three';
import { VoxGroup, rand } from './voxel.js';

// Characters use fine voxels (R = 0.25 world units) built from smooth shapes.
// Both face -z (toward the TV). All shape coords are world units.
const R = 0.25;
const SKIN = 0xf1c27d, SKIN_SHADE = 0xd9a866, SKIN_BASE = SKIN, SKIN_SHADE_BASE = SKIN_SHADE;

// For seamless loops: snap an angular frequency (rad/s) or a period (s) so it repeats a whole
// number of times in `loop` seconds. Without a loop they pass values through unchanged.
const loopW = (loop) => (w) => (loop ? Math.max(1, Math.round(w / ((2 * Math.PI) / loop))) * ((2 * Math.PI) / loop) : w);
const loopP = (loop) => (p) => (loop ? loop / Math.max(1, Math.round(loop / p)) : p);

const V = (name) => new VoxGroup(name, R);
function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
// is (x,y) inside an axis-aligned ellipse
const inE = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

// ------------------------------------------------------------------ toddler
export const TODDLER_LOOKS = {
  girl: { label: 'Girl (pigtails)', hair: 0x8a5a2b, tee: [0xffd23f, 0xff7a5c], legs: [0x4f7fd1, 0x4a76c4], style: 'pigtails', bike: 0xff5fa8, bikeAcc: 0xffffff, helmet: 0xa64dff, shoe: 0xff3fa4 },
  boy: { label: 'Boy (tuft)', hair: 0x3b2a1a, tee: [0x5cc46a, 0x3f9a4f], legs: [0xc8504a, 0xb54640], style: 'tuft', bike: 0x2f8fe8, bikeAcc: 0xffd23f, helmet: 0xe64545, shoe: 0x3f7fd6 },
};

const shadeOf = (c, k = 0.86) => new THREE.Color(c).multiplyScalar(k).getHex();

// the toddler's head (face, ears, hair), built facing -z with its base at y = 0
function makeToddlerHead(L, SKIN, SKIN_SHADE) {
  const hv = V('toddlerHead');
  hv.ell(0, 4, 0, 4, 4, 3.8, (x, y, z) => {
    if (z > -1.5) return SKIN;
    // face decals
    for (const s of [-1, 1]) {
      const ex = s * 1.5;
      if (inE(x, y, ex + 0.3, 4.6, 0.35, 0.35)) return 0xffffff; // sparkle
      if (inE(x, y, ex, 4.2, 0.8, 1.0)) return 0x231a33;          // big eyes
      if (inE(x, y, ex, 5.75, 0.8, 0.2)) return L.brows ?? 0x9a6a3a; // brows
      if (inE(x, y, s * 2.6, 2.9, 0.8, 0.5)) return 0xff9a9a;     // cheeks
    }
    if (L.grin && inE(x, y, 0, 2.5, 1.7, 1.0) && y < 2.6) { // big open-mouthed giggle
      if (y > 2.15) return 0xffffff;
      return inE(x, y, 0, 1.75, 0.85, 0.35) ? 0xff8a9a : 0x7a2430;
    }
    if (!L.grin && inE(x, y, 0, 2.0, 0.7, 0.45)) return 0x9b3b3b; // little open mouth
    if (inE(x, y, 0, 3.2, 0.35, 0.3)) return SKIN_SHADE;
    return SKIN;
  });
  hv.ell(-3.9, 3.8, 0.3, 0.6, 1, 0.8, SKIN_SHADE); // ears
  hv.ell(3.9, 3.8, 0.3, 0.6, 1, 0.8, SKIN_SHADE);
  const HAIR = L.hair;
  if (L.style === 'pigtails') {
    hv.ell(0, 4.5, 0.4, 4.25, 4.1, 4.0, (x, y, z) =>
      (y > 6.4 || z > 1 || (y > 5.2 && Math.abs(x) > 2.8) || (y > 6 && z < -2 && Math.sin(x * 4) > 0) ? HAIR : null));
    for (const s of [-1, 1]) {
      hv.ell(s * 4.5, 6, 1.2, 1.1, 1.1, 1.1, HAIR); // pigtails
      hv.ell(s * 3.9, 6.3, 0.6, 0.5, 0.5, 0.5, L.bow ?? 0xff6fa0, 0);
    }
  } else if (L.style === 'curly' || L.style === 'bun') {
    hv.ell(0, 4.5, 0.4, 4.25, 4.1, 4.0, (x, y, z) =>
      (y > 6.2 || z > 0.8 || (y > 5 && Math.abs(x) > 2.8) ? HAIR : null));
    if (L.style === 'curly') {
      for (let i = 0; i < 11; i++) { // a halo of curls
        const a = (i / 11) * Math.PI * 2;
        hv.ell(Math.cos(a) * 3.3, 6.9 + (i % 2) * 0.5, Math.sin(a) * 3.0 + 0.7, 1.35, 1.35, 1.35, HAIR, 0.08);
      }
      hv.ell(0, 8.1, 0.6, 2.8, 1.4, 2.8, HAIR, 0.08);
    } else {
      hv.ell(0, 8.9, 0.9, 1.5, 1.3, 1.5, HAIR); // top knot
      hv.ell(0, 8.0, 0.9, 1.6, 0.35, 1.6, L.bow ?? 0x3fd0ff, 0);
    }
  } else {
    // short hair with a cowlick tuft on top
    hv.ell(0, 4.5, 0.4, 4.2, 4.05, 3.95, (x, y, z) =>
      (y > 6.9 || z > 1.4 || (y > 5.6 && Math.abs(x) > 3.2) || (y > 6.5 && z < -2.4 && Math.sin(x * 5) > 0.2) ? HAIR : null));
    hv.cap(0, 8.2, 0.2, 0.6, 9.6, -0.6, 0.45, HAIR, 0.02);
    hv.cap(0.3, 8.2, 0.5, -0.5, 9.3, 0.6, 0.4, HAIR, 0.02);
  }
  hv.build();
  return hv;
}

// `look` is a TODDLER_LOOKS key, or an object overriding the girl look: skin, hair, tee,
// legs, style ('pigtails' | 'tuft' | 'curly' | 'bun'), bow, mode ('clap' | 'listen' |
// 'point' | 'block'), phase (seconds offset so a crowd doesn't move in sync).
export function buildToddler(look = 'girl', { loop = 0 } = {}) {
  const lw = loopW(loop), lp = loopP(loop);
  const L = typeof look === 'object' ? { ...TODDLER_LOOKS.girl, ...look } : TODDLER_LOOKS[look] || TODDLER_LOOKS.girl;
  const SKIN = L.skin ?? SKIN_BASE, SKIN_SHADE = shadeOf(SKIN);
  const mode = L.mode || 'clap', phase = L.phase || 0;
  const root = new THREE.Group();
  root.name = 'toddler';

  const body = V('toddlerBody');
  body.cap(-3.5, 1, -3, 2.5, 1, -0.5, 1.1, L.legs[0]); // crossed legs
  body.cap(3.5, 1, -3, -2.5, 1, -0.5, 1.1, L.legs[1]);
  body.ell(-3.9, 0.9, -3.5, 0.9, 0.8, 1.2, 0xffffff); // socks
  body.ell(3.9, 0.9, -3.5, 0.9, 0.8, 1.2, 0xffffff);
  body.ell(0, 1.7, 1, 3, 1.7, 2.3, 0xf4f4f4); // nappy bum
  body.ell(0, 5, 0, 3, 3.4, 2.2, (x, y) => (Math.floor(y / 0.75) % 2 ? L.tee[0] : L.tee[1])); // striped tee
  body.build();
  root.add(body);

  const head = pivot(root, 0, 8, 0);
  const hv = makeToddlerHead(L, SKIN, SKIN_SHADE);
  head.add(hv);

  const arms = [];
  for (const s of [-1, 1]) {
    const arm = pivot(root, s * 3.1, 7.2, 0);
    const a = V('toddlerArm');
    a.cap(0, 0, 0, 0, -3.6, 0, 0.9, (x, y) => (y > -1.4 ? L.tee[0] : SKIN));
    a.ell(0, -4.1, 0, 0.9, 0.9, 0.9, SKIN);
    a.build();
    arm.add(a);
    if (mode === 'block' && s > 0) {
      const b = new VoxGroup('heldBlock', R);
      b.wbox(-0.9, -5.6, -0.9, 1.8, 1.8, 1.8, L.blockColor ?? 0x3f7fd6, 0.03);
      b.build();
      arm.add(b);
    }
    arm.userData.side = s;
    arms.push(arm);
  }

  const BEAT = lp(5);
  function update(time) {
    const t = time + phase;
    root.rotation.z = Math.sin(t * lw(1.3)) * 0.03;
    head.rotation.x = (L.lookUp ?? 0.22) + Math.sin(t * lw(2.6)) * 0.03;
    head.rotation.y = Math.sin(t * lw(0.7)) * 0.05;
    if (mode === 'window') {
      // kneeling up on a train seat, nose to the glass, hands either side of the face,
      // watching the world go by, with the odd excited bounce and a tap on the window
      const look = Math.sin(t * lw(0.9)) * 0.2 + Math.sin(t * lw(2.1)) * 0.06;
      head.rotation.set(0.02 + Math.sin(t * lw(1.7)) * 0.03, look, Math.sin(t * lw(0.6)) * 0.07);
      root.rotation.x = -0.12;
      const bounce = Math.max(0, Math.sin(t * lw(1.25))) ** 8;
      root.position.y = Math.abs(Math.sin(t * lw(9))) * bounce * 0.5;
      const tap = Math.max(0, Math.sin(t * lw(0.8) + 1)) ** 10 * Math.abs(Math.sin(t * lw(11)));
      for (const arm of arms) {
        const s = arm.userData.side;
        arm.rotation.x = 2.35 + (s > 0 ? tap * 0.2 : 0);
        arm.rotation.z = s * 0.12;
      }
      return;
    }
    const beat = (((t % BEAT) + BEAT) % BEAT) * (5 / BEAT); // a 5 s routine, stretched to fit the loop
    const clapping = mode === 'clap' && beat > 2.5 && beat < 3.7;
    for (const arm of arms) {
      const s = arm.userData.side;
      const lift = (a, b) => Math.sin(Math.PI * Math.min(1, Math.max(0, (beat - a) / (b - a)))) ** 0.6; // 0..1..0 bump
      if (mode === 'listen') {
        head.rotation.z = Math.sin(t * lw(0.5)) * 0.12; // head tilted, rapt
        arm.rotation.x = 0.35;
        arm.rotation.z = s * 0.1;
      } else if (mode === 'point' && s > 0) {
        const k = lift(1, 3.2); // arm shoots up at the book
        arm.rotation.x = 0.55 + k * 1.9;
        arm.rotation.z = -k * 0.25 + Math.sin(t * lw(9)) * k * 0.06;
      } else if (mode === 'block' && s > 0) {
        const k = lift(0.5, 2.5); // holds the block up to show it off, then bangs it down
        arm.rotation.x = 0.7 + k * 0.9 - (beat > 3 && beat < 4 ? Math.abs(Math.sin(t * lw(10))) * 0.35 : 0);
        arm.rotation.z = -0.25;
      } else if (clapping) {
        const c = Math.abs(Math.sin(t * lw(14)));
        arm.rotation.x = 1.25;
        arm.rotation.z = -s * (0.15 + c * 0.45);
      } else {
        arm.rotation.x = 0.55;
        arm.rotation.z = s * 0.15;
      }
    }
    root.position.y = clapping ? Math.abs(Math.sin(t * lw(7))) * 0.3 : 0;
  }

  return { root, update, head };
}

// ------------------------------------------------------------------ parent
// Slumped-on-the-couch parent. `look` picks the model; all share one rig.
export const PARENT_LOOKS = {
  tired: {
    label: 'Parent (messy bun)', hairStyle: 'bun', hair: 0x4a3222,
    pants: 0x3a4f78, pantsFn: (x, y, z) => (Math.abs(z + 6) < 0.3 && y > 1.2 ? 0x6f88b5 : null),
    top: 0x6f7d6a, topDark: 0x58654f, sleeve: 9.3, hood: true, shoes: 'sneakers', prop: 'phone',
    topFn: (x, y, z, T) => {
      if (z >= -1.2) return null;
      if (Math.abs(Math.abs(x) - 1) < 0.15 && y > 8.3 && y < 11.6) return 0xdddddd; // drawstrings
      if (Math.abs(x) < 3 && y > 1.5 && y < 4.6) return T.topDark;                 // pocket
      if (inE(x, y, 2.4, 7.3, 0.7, 0.5) || inE(x, y, 3.1, 6.6, 0.3, 0.3)) return 0xe9e1c8; // yoghurt stain
      return null;
    },
  },
  mum: {
    label: 'Woman (long hair)', hairStyle: 'long', hair: 0x2e1c14, lips: 0xb8505e, lashes: true, earrings: 0xf2c94c,
    pants: 0x7d5a9c, pantsFn: (x, y, z) => ((Math.floor(x * 1.2) + Math.floor(z * 1.2)) % 3 === 0 ? 0x9c7bbd : null), // pyjama check
    top: 0xc76b86, topDark: 0xa85570, sleeve: 9.6, shoes: 'slippers', prop: 'mug',
    topFn: (x, y, z, T) => {
      if (z >= -1.2) return null;
      if (Math.abs(x) < 1.7 && y > 2) return y > 10.4 && Math.abs(x) < 1.1 ? SKIN : 0xf1e6d2; // cream vest under an open cardigan
      if (Math.abs(Math.abs(x) - 1.95) < 0.3) return T.topDark;                                  // cardigan edge
      if (inE(x, y, -2.4, 6.4, 0.8, 0.5)) return 0xe9e1c8;                                      // a splodge of yoghurt
      return null;
    },
  },
  dad: {
    label: 'Man (beard)', hairStyle: 'short', hair: 0x3a2618, beard: 0x5a3c28,
    pants: 0x6c6e75, pantsFn: (x, y, z) => (Math.abs(x) > 1.6 && Math.abs(x) < 1.9 ? 0xeeeeee : null), // trackie stripe
    top: 0x2f5b7c, topDark: 0x244a66, sleeve: 3.6, shoes: 'socks', prop: 'remote',
    topFn: (x, y, z) => {
      if (z >= -1.2) return null;
      if (inE(x, y, 0, 7.4, 2.2, 1.9)) return inE(x, y, 0, 7.4, 1.5, 1.2) ? 0xf2c94c : 0xe0663c; // faded band logo
      if (inE(x, y, -2.8, 4.2, 0.6, 0.4)) return 0xe9e1c8;                                         // yoghurt
      return null;
    },
  },
};

// footwear on the end of a shin (shin runs 0 .. -8.6 in y). `outdoors` turns the dad's
// odd socks into socks-and-sandals, pulled up over the trackies.
function addShoe(sv, L, s, SKIN, outdoors) {
  if (L.shoes === 'slippers') {
    sv.ell(0, -9.6, -1.2, 2.2, 1.4, 3.2, (x, y) => (y < -10.5 ? 0xd88aa8 : 0xf7b6cf)); // fluffy slippers
    sv.ell(s * 0.9, -8.8, -3.4, 0.5, 0.5, 0.5, 0xffffff, 0); // pom-pom
  } else if (L.shoes === 'socks' && outdoors) {
    sv.cap(0, -6.9, 0, 0, -8.9, 0, 1.85, (x, y) => (Math.abs(y + 7.3) < 0.28 ? 0xc83a3a : 0xf2f2f2)); // sports socks, hoiked up
    sv.ell(0, -9.5, -1, 1.7, 1.0, 2.8, 0xf2f2f2);
    sv.ell(0, -10.5, -1, 1.9, 0.38, 3.0, 0x3a2a1e, 0.02); // sandal sole
    sv.cap(-1.75, -9.4, -2.3, 1.75, -9.4, -2.3, 0.36, 0x6a4a2a, 0.02); // straps
    sv.cap(-1.75, -9.2, 0.1, 1.75, -9.2, 0.1, 0.36, 0x6a4a2a, 0.02);
  } else if (L.shoes === 'socks') {
    sv.ell(0, -9.5, -1, 1.7, 1.0, 2.8, (x, y, z) => (y < -10.2 ? 0xd8d8d8 : z < -3 ? 0xc83a3a : 0xf2f2f2)); // odd socks, hole at the toe
    sv.set(Math.round(s * 0.4 / R), Math.round(-9.5 / R), Math.round(-3.8 / R), SKIN, 0);
  } else {
    sv.ell(0, -9.7, -1, 1.8, 1.1, 2.9, (x, y) => (y < -10.3 ? 0xb8b8b8 : 0xf0f0f0)); // sneakers
  }
}

// the grown-up's head; `chair` = the happier playgroup face, `closed` = blink frame
function makeParentHead(L, closed, chair, calm = false) {
  const HAIR = L.hair, LID = 0xc8935a;
  const SKIN = L.skin ?? SKIN_BASE, SKIN_SHADE = L.skin ? shadeOf(L.skin) : SKIN_SHADE_BASE;
  const h = V(closed ? 'parentHeadClosed' : 'parentHead');
  h.cap(0, -0.5, 0, 0, 1.5, 0, 1.3, SKIN_SHADE); // neck
  h.ell(0, 5, 0, 3.9, 4.7, 4, (x, y, z) => {
    if (z > -1.5) return SKIN;
    if (calm) { // a well-rested stranger: open eyes, soft smile
      for (const s of [-1, 1]) {
        const ex = s * 1.6;
        if (inE(x, y, ex, 5.45, 0.55, 0.5)) return inE(x, y, ex, 5.4, 0.28, 0.3) ? 0x2a2018 : 0xf4f0e8;
        if (Math.abs(x - ex) < 0.9 && Math.abs(y - 6.5) < 0.16) return L.brows ?? 0x8a8a8a;
      }
      if (inE(x, y, 0, 4.0, 0.4, 0.75)) return SKIN_SHADE;
      if (inE(x, y, 0, 2.8, 1.2, 0.6) && !inE(x, y, 0, 3.15, 1.15, 0.55)) return 0x7a3a3a;
      return SKIN;
    }
    for (const s of [-1, 1]) {
      const ex = s * 1.6;
      if (chair) {
        // happy-tired eyes: smiling arcs when closed, half-lidded and softened when open
        if (closed) {
          if (inE(x, y, ex, 5.25, 0.9, 0.6) && !inE(x, y, ex, 5.0, 0.8, 0.55) && y > 5.2) return 0x2a2018;
        } else if (inE(x, y, ex, 5.55, 0.85, 0.45) && y > 5.25) {
          if (y > 5.8) return LID;
          if (inE(x, y, ex + s * 0.1, 5.5, 0.32, 0.3)) return 0x2a2018;
          if (inE(x, y, ex + s * 0.25, 5.62, 0.1, 0.1)) return 0xffffff;
          return 0xf4f0e8;
        }
        if (inE(x, y, ex, 4.85, 0.95, 0.28)) return 0x8e6a92;    // the eye bags are still there
        if (inE(x, y, s * 2.4, 3.6, 0.85, 0.5)) return 0xe89a8a; // but there's colour in the cheeks
        if (Math.abs(x - ex) < 0.95 && Math.abs(y - (6.7 - s * (x - ex) * 0.1)) < 0.17) return L.hairStyle === 'long' ? 0x2a1a12 : 0x3a2618; // soft, relaxed brows
        continue;
      }
      if (inE(x, y, ex, 5.6, 0.85, 0.45)) {
        if (closed || y > 5.65) return closed && L.lashes && y < 5.4 ? 0x1c1410 : LID; // heavy lids
        if (inE(x, y, ex - s * 0.15, 5.45, 0.3, 0.3)) return 0x2a2018;              // vacant pupils
        return 0xf4f0e8;
      }
      if (L.lashes && Math.abs(y - 6.1) < 0.14 && Math.abs(x - ex) < 1.05) return 0x1c1410; // lashes
      if (L.lashes && Math.abs(y - 6.15 + (x - ex) * s * 0.4) < 0.12 && (x - ex) * s > 0.8 && (x - ex) * s < 1.25) return 0x1c1410; // flick
      if (inE(x, y, ex, 5.0, 0.95, 0.3)) return 0x8e6a92;    // eye bags
      if (inE(x, y, ex, 4.55, 0.85, 0.3)) return 0xb98aa0;
      if (Math.abs(x - ex) < 0.95 && Math.abs(y - (6.55 - s * (x - ex) * 0.12)) < 0.17) return L.hairStyle === 'long' ? 0x2a1a12 : 0x3a2618; // droopy brows
    }
    if (inE(x, y, 0, 4.0, 0.4, 0.75)) return SKIN_SHADE;      // nose
    if (chair && inE(x, y, 0, 2.75, 1.45, 0.8) && !inE(x, y, 0, 3.15, 1.4, 0.68)) return L.lips ?? 0x7a3a3a; // a real smile
    if (chair && inE(x, y, 0, 2.75, 1.45, 0.8)) return L.beard && (y < 2.3 || y > 3.25) ? L.beard : SKIN;
    if (inE(x, y, 0.2, 2.5, 0.85, 0.38)) return L.lips ? (inE(x, y, 0.2, 2.5, 0.5, 0.2) ? 0x7a3a3a : L.lips) : 0x7a3a3a; // mouth hanging open
    if (L.beard && (y < 3.3 || (Math.abs(x) > 2.6 && y < 4.6))) return L.beard; // stubbly beard + sideburns
    if (L.beard && inE(x, y, 0.2, 3.25, 1.3, 0.25)) return L.beard; // moustache
    return SKIN;
  });
  h.ell(-3.9, 5, 0, 0.6, 1.1, 0.9, SKIN_SHADE);
  h.ell(3.9, 5, 0, 0.6, 1.1, 0.9, SKIN_SHADE);
  if (L.earrings) for (const s of [-1, 1]) h.ell(s * 4.05, 3.5, -0.2, 0.35, 0.45, 0.35, L.earrings, 0);

  if (L.hairStyle === 'bun') {
    // messy hair, bun and flyaways
    h.ell(0, 5.5, 0.5, 4.25, 5.0, 4.35, (x, y, z) =>
      (y > 8.3 || z > 1.4 || (Math.abs(x) > 3.1 && y > 4.6) || (y > 7.6 && z < -2 && Math.sin(x * 3 + 1) > -0.2) ? HAIR : null));
    h.ell(0, 10.4, 0.8, 1.8, 1.5, 1.8, HAIR);
    const fly = [[1.2, 11.6, 0.5, 2.4, 12.6, 1.4], [-1, 11.4, 1, -2.3, 12.2, 0.2], [3.6, 8.8, -1, 4.6, 9.6, -2], [-3.8, 9, 1, -4.8, 8.4, 2.2]];
    for (const f of fly) h.cap(...f, 0.2, HAIR, 0);
  } else if (L.hairStyle === 'long') {
    // long hair: side-parted fringe, curtains framing the face, length spilling over the couch back
    const SHINE = 0x4a2e20;
    h.ell(0, 5.5, 0.5, 4.3, 5.05, 4.4, (x, y, z) => {
      const fringe = z < -2 && y > 7.4 - (x + 1.5) * 0.35;
      if (y > 8.2 || z > 1.2 || (Math.abs(x) > 3.2 && y > 2.2) || fringe) return Math.sin(x * 2 + y) > 0.85 ? SHINE : HAIR;
      return null;
    });
    h.ell(0, 1.5, 2.6, 4.6, 6.5, 2.4, (x, y, z) => (z > 1.2 ? (Math.sin(x * 2.5) > 0.8 ? SHINE : HAIR) : null)); // the long fall at the back
    for (const s of [-1, 1]) {
      h.cap(s * 3.8, 5, -1.4, s * 4.4, -1.6, -0.2, 1.0, HAIR, 0.03); // curtains over the shoulders
      h.cap(s * 4.2, 3, 0.8, s * 4.8, -3, 1.6, 1.1, HAIR, 0.03);
    }
    h.cap(-1.6, 9.4, -2.2, -3.6, 10.6, -0.8, 0.22, HAIR, 0); // one flyaway, she's still tired
    h.ell(2.8, 9.4, 1.2, 0.7, 0.7, 0.7, 0xff6fa0, 0);           // a clip that's given up
  } else {
    // short back-and-sides, a bit of a quiff
    h.ell(0, 5.5, 0.5, 4.2, 4.95, 4.3, (x, y, z) =>
      (y > 8.6 || z > 1.8 || (Math.abs(x) > 3.4 && y > 5.6) || (y > 8 && z < -2.4) ? HAIR : null));
    h.cap(-1.5, 9.6, -2.6, 1.8, 10.1, -2.4, 0.7, HAIR, 0.03);
    h.cap(0.6, 10.2, -1.4, 1.6, 10.8, 0.2, 0.4, HAIR, 0.02);
  }
  h.build();
  return h;
}

// pose 'couch': slumped in front of the TV. pose 'chair': sitting up at playgroup with a
// takeaway coffee, still exhausted but happy. `look` is a PARENT_LOOKS key, or an object
// overriding the tired look (it should bring its own topFn). `calm` gives a well-rested face.
export function buildParent(look = 'tired', pose = 'couch', { loop = 0, calm = false } = {}) {
  const lw = loopW(loop), lp = loopP(loop);
  const L = typeof look === 'object' ? { ...PARENT_LOOKS.tired, ...look } : PARENT_LOOKS[look] || PARENT_LOOKS.tired;
  const chair = pose === 'chair';
  const root = new THREE.Group(); // hip pivot
  root.name = 'parent';
  const PANTS = L.pants, TOP = L.top, TOP_DARK = L.topDark, HAIR = L.hair;
  const pantsColor = (x, y, z) => L.pantsFn?.(x, y, z) ?? PANTS;

  const pelvis = V('pelvis');
  pelvis.ell(0, 0, 0.3, 5, 2.3, 2.8, pantsColor);
  pelvis.build();
  root.add(pelvis);

  // splayed legs (on the couch) or knees together, feet down (on a chair)
  for (const s of [-1, 1]) {
    const thigh = pivot(root, s * 2.5, 0, 0);
    thigh.rotation.y = -s * (chair ? 0.06 : 0.22);
    const tv = V('thigh');
    tv.cap(0, 0, 0, 0, 0, -9, 2, pantsColor);
    tv.build();
    thigh.add(tv);
    const shin = pivot(thigh, 0, 0, -9);
    shin.rotation.x = chair ? -0.1 : 0.3;
    const sv = V('shin');
    sv.cap(0, 0, 0, 0, -8.6, 0, 1.7, pantsColor);
    addShoe(sv, L, s, SKIN, false);
    sv.build();
    shin.add(sv);
  }

  // torso slumped back into the couch
  const torso = pivot(root, 0, 1, 0);
  torso.rotation.x = chair ? -0.05 : 0.38;
  const tVox = V('torso');
  tVox.ell(0, 6, 0, 5.2, 6.6, 2.8, (x, y, z) => L.topFn(x, y, z, L) ?? TOP);
  for (const s of [-1, 1]) tVox.ell(s * 4.4, 10.6, 0, 1.9, 1.9, 1.9, TOP);
  if (L.hood) tVox.cap(-3.5, 11.2, 2, 3.5, 11.2, 2, 1.3, TOP_DARK); // bunched hood
  else tVox.cap(-2, 12.2, -0.6, 2, 12.2, -0.6, 0.6, TOP_DARK, 0.02); // collar
  tVox.build();
  torso.add(tVox);

  // head lolled back and to the side; built twice (eyes open / closed) for blinking
  const head = pivot(torso, 0, 12, 0);
  head.rotation.x = chair ? -0.2 : 0.42;
  head.rotation.z = chair ? 0.06 : 0.14;
  const headOpen = makeParentHead(L, false, chair, calm), headClosed = makeParentHead(L, true, chair, calm);
  head.add(headOpen, headClosed);
  headClosed.visible = false;

  // chair pose: both hands round a takeaway coffee; shoulder + elbow rigs so it can be sipped
  let shoulderRig, elbowRig, steam, lidMark;
  if (chair) {
    shoulderRig = pivot(torso, 0, 10.6, 0);
    elbowRig = pivot(shoulderRig, 0, -4.8, -2.2);
    const short = L.sleeve < 6;
    const up = V('parentUpperArms'), fore = V('parentForearms');
    for (const s of [-1, 1]) {
      up.cap(s * 4.5, 0, 0, s * 4.4, -4.8, -2.2, 1.45, (x, y) => (short && y < -2.2 ? SKIN : TOP));
      if (short) up.cap(s * 4.5, 0, 0, s * 4.45, -2.0, -1.0, 1.75, (x, y) => (y < -1.7 ? TOP_DARK : TOP));
      fore.cap(s * 4.4, 0, 0, s * 2.1, 1.2, -3.2, 1.2, (x, y, z) => (short ? SKIN : z < -2.5 ? TOP_DARK : TOP)); // cuff at the wrist
      fore.ell(s * 1.75, 1.35, -3.85, 0.6, 0.85, 0.75, SKIN);
      for (let f = 0; f < 3; f++) fore.cap(s * 1.45, 0.75 + f * 0.5, -4.55, s * 0.55, 0.75 + f * 0.5, -5.05, 0.22, SKIN, 0.02); // fingers round the cup
    }
    up.build(); fore.build();
    shoulderRig.add(up); elbowRig.add(fore);
    const cup = V('coffee');
    const CX = 0, CZ = -3.9;
    cup.fill(-1.5, -0.6, CZ - 1.5, 1.5, 3.9, CZ + 1.5, (x, y, z) => {
      const r = Math.hypot(x - CX, z - CZ);
      if (y < 3.2) return r <= 1.05 + (y + 0.6) * 0.07;           // tapered paper cup
      if (y < 3.5) return r <= 1.45;                               // lid rim
      return r <= 1.2;                                             // lid top
    }, (x, y, z) => {
      if (y >= 3.2) return y > 3.6 && Math.hypot(x, z - (CZ - 0.75)) < 0.3 ? 0x3a2a20 : 0xf7f7f2; // lid + sip hole
      if (y > 0.3 && y < 2.1) return Math.abs(x) < 0.45 && y > 0.9 && y < 1.5 && z < CZ ? 0xe8e0cc : 0xa8784a; // kraft sleeve + stamp
      return 0xf4efe4;
    }, 0.02);
    cup.build();
    elbowRig.add(cup);
    lidMark = pivot(elbowRig, 0, 4.0, CZ + 0.3);

    // steam lives in root space so it rises straight up whatever the cup is doing
    steam = new THREE.Group();
    root.add(steam);
    const puffGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      steam.add(m);
    }
  }

  // arms flung out along the back of the couch
  for (const s of chair ? [] : [-1, 1]) {
    const arm = pivot(torso, s * 5, 10.8, 0);
    arm.rotation.y = -s * 0.32;
    arm.rotation.z = -s * 0.12;
    const a = V('parentArm');
    const short = L.sleeve < 6;
    a.cap(0, 0, 0, s * 10, 0, 0, 1.45, (x) =>
      (Math.abs(x) > L.sleeve ? (short ? SKIN : TOP_DARK) : short && Math.abs(x) > L.sleeve - 0.6 ? TOP_DARK : TOP));
    if (short) a.cap(0, 0, 0, s * L.sleeve, 0, 0, 1.75, (x) => (Math.abs(x) > L.sleeve - 0.6 ? TOP_DARK : TOP)); // tee sleeve
    a.cap(s * 10, 0, 0, s * 12.4, -0.4, 0, 1.0, SKIN);
    for (let f = 0; f < 4; f++) {
      const fz = -0.75 + f * 0.5;
      a.cap(s * 12.8, -0.5, fz, s * 13.3, -1.9 + (f % 2) * 0.3, fz, 0.32, SKIN, 0.02); // limp fingers
    }
    if (s < 0 && L.prop === 'phone') {
      // phone slipping out of the left hand, screen still on
      a.wbox(-14.4, -3.4, -1.6, 0.5, 2.8, 1.6, (x) => (x < -14.25 ? 0x5fa8ff : 0x111111), 0);
    } else if (s < 0 && L.prop === 'remote') {
      a.wbox(-14.2, -3.8, -2.4, 0.9, 3.4, 1.2, (x, y) => (x < -14 && y > -1.4 && y < -0.9 ? 0xd03030 : 0x1a1a1a), 0);
    } else if (s > 0 && L.prop === 'mug') {
      // cold cup of tea dangling from the right hand
      a.cap(13.2, -3.6, 0, 13.2, -1.6, 0, 1.2, (x, y) => (y > -1.8 ? 0x8a5a3a : 0xf4f4f4), 0.02);
      a.ell(14.6, -2.6, 0, 0.35, 0.8, 0.35, 0xf4f4f4, 0);
    }
    a.build();
    arm.add(a);
  }

  const baseTorsoX = torso.rotation.x;
  const smooth = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
  const tmpV = new THREE.Vector3();
  const SIP = lp(7), BLINK = lp(4.6), STEAM = lw(0.45 * 2 * Math.PI) / (2 * Math.PI);
  function updateChair(t) {
    const b = Math.sin(t * lw(1.1));
    torso.scale.set(1 + b * 0.012, 1 + b * 0.008, 1 + b * 0.02);
    // a long contented sip every 7 s: up, hold, down
    const c = (t % SIP) * (7 / SIP);
    const sip = smooth(4.2, 5.0, c) * (1 - smooth(6.0, 6.8, c));
    torso.rotation.x = baseTorsoX - sip * 0.04 + b * 0.006;
    shoulderRig.rotation.x = 0.1 + sip * 0.55;
    elbowRig.rotation.x = sip * 1.05;
    head.rotation.x = -0.2 + sip * 0.12 + Math.sin(t * lw(0.6)) * 0.03;
    head.rotation.y = Math.sin(t * lw(0.33)) * 0.12 * (1 - sip);
    head.rotation.z = 0.06 + Math.sin(t * lw(0.45)) * 0.03;
    const closed = sip > 0.6 || (c > 1.6 && c < 1.85); // eyes close for the sip (bliss) + a blink
    headOpen.visible = !closed;
    headClosed.visible = closed;
    // steam
    root.updateMatrixWorld(true);
    root.worldToLocal(lidMark.getWorldPosition(tmpV));
    steam.children.forEach((m, i) => {
      const p = (t * STEAM + i / steam.children.length) % 1;
      m.position.set(tmpV.x + Math.sin(p * 5 + i * 2) * 0.5, tmpV.y + p * 4.5, tmpV.z + Math.cos(p * 4 + i) * 0.35);
      m.scale.setScalar(0.7 + p * 1.6);
      m.material.opacity = Math.sin(Math.PI * p) * 0.45 * (1 - sip);
    });
  }
  function update(t) {
    if (chair) return updateChair(t);
    const b = Math.sin(t * lw(1.1));
    torso.scale.set(1 + b * 0.012, 1 + b * 0.008, 1 + b * 0.025);
    torso.rotation.x = baseTorsoX - b * 0.008;
    const sigh = Math.max(0, Math.sin((t - 4) * lw(0.8))) ** 8;
    torso.rotation.x -= sigh * 0.05;
    head.rotation.x = 0.42 + sigh * 0.08 + Math.sin(t * lw(0.4)) * 0.015;
    head.rotation.z = 0.14 + Math.sin(t * lw(0.35)) * 0.03;
    const bl = (t % BLINK) * (4.6 / BLINK);
    const closed = bl > 3.7 && bl < 4.35;
    headOpen.visible = !closed;
    headClosed.visible = closed;
  }

  return { root, update, head };
}

// ------------------------------------------------------------------ teacher
// The playgroup leader reading a big picture book. Sits on a chair (root = hips),
// faces -z like everyone else; the book is held out to her left, pages facing the kids.
const PAGE_W = 6, PAGE_H = 8.5;
// little picture-book spreads: fn(u, v) => colour, u/v in 0..1 across each page
const SPREADS = [
  [ // a sunny day
    (u, v) => (inE(u, v, 0.62, 0.72, 0.17, 0.12) ? 0xffd23f : v < 0.28 ? 0x55b86a : 0x8fd3ff),
    (u, v) => (inE(u, v, 0.45, 0.42, 0.28, 0.1) && v < 0.42 ? 0xe64545 : u > 0.44 && u < 0.48 && v > 0.42 && v < 0.75 ? 0x5a3a22
      : u > 0.48 && v > 0.45 && v < 0.74 && u < 0.48 + (0.74 - v) * 0.9 ? 0xffffff : v < 0.36 ? 0x3f7fd6 : 0x8fd3ff),
  ],
  [ // a frog on a lily pad
    (u, v) => (inE(u, v, 0.4, 0.62, 0.07, 0.05) || inE(u, v, 0.62, 0.62, 0.07, 0.05) ? 0x1a1a1a
      : inE(u, v, 0.4, 0.62, 0.12, 0.09) || inE(u, v, 0.62, 0.62, 0.12, 0.09) ? 0xffffff
      : inE(u, v, 0.51, 0.45, 0.32, 0.2) ? 0x4caf50 : inE(u, v, 0.5, 0.25, 0.42, 0.1) ? 0x2e7d32 : 0x6fc3df),
    (u, v) => (inE(u, v, 0.5, 0.55, 0.12, 0.09) ? 0xff7aa8 : inE(u, v, 0.5, 0.45, 0.35, 0.1) ? 0x2e7d32 : 0x6fc3df),
  ],
  [ // goodnight moon-ish: a bear asleep under the stars
    (u, v) => (inE(u, v, 0.5, 0.65, 0.2, 0.14) && !inE(u, v, 0.6, 0.7, 0.18, 0.13) ? 0xfff6c8
      : (Math.floor(u * 13) * 7 + Math.floor(v * 17) * 3) % 23 === 0 ? 0xffffff : 0x1c2a5a),
    (u, v) => (inE(u, v, 0.5, 0.35, 0.32, 0.16) || inE(u, v, 0.25, 0.42, 0.13, 0.11) ? 0x8a5a2b
      : v < 0.2 ? 0x2e5e3a : (Math.floor(u * 11) * 5 + Math.floor(v * 19) * 3) % 19 === 0 ? 0xffffff : 0x1c2a5a),
  ],
];
const FLIP_GAP = 5, FLIP_LEN = 0.9, FIRST_FLIP = 3.5;

export function buildTeacher({ loop = 0 } = {}) {
  const lw = loopW(loop), lp = loopP(loop);
  // page flips: with a loop, a whole number of trips through the book, so it ends where it began
  const FLIP_EVERY = loop ? loop / (SPREADS.length * Math.max(1, Math.round(loop / (FLIP_GAP * SPREADS.length)))) : FLIP_GAP;
  const TALK = lp(3.3), BLINK = lp(3.9);
  const root = new THREE.Group();
  root.name = 'teacher';
  const SK = 0x9a623d, SK_SHADE = shadeOf(SK), HAIR = 0x22160f, GREY = 0x9c958e;
  const CARDI = 0xe0a33a, CARDI_DARK = 0xc4892a, TOP = 0x2f8f8a, SKIRT = 0x7a3b5a, TIGHTS = 0x3a2a3a;

  const pelvis = V('teacherPelvis');
  pelvis.ell(0, 0, 0.3, 5.2, 2.4, 3, SKIRT);
  pelvis.build();
  root.add(pelvis);
  for (const s of [-1, 1]) {
    const thigh = pivot(root, s * 2.2, 0, 0);
    const tv = V('teacherThigh');
    tv.cap(0, 0, 0, 0, 0, -9, 2.1, SKIRT);
    tv.build();
    thigh.add(tv);
    const shin = pivot(thigh, 0, 0, -9);
    shin.rotation.x = -0.12;
    const sv = V('teacherShin');
    sv.cap(0, 0, 0, 0, -8.6, 0, 1.6, (x, y) => (y > -2.2 ? SKIRT : TIGHTS)); // skirt hem past the knee
    sv.ell(0, -9.7, -1, 1.7, 1.0, 2.7, (x, y) => (y < -10.3 ? 0x2a1610 : 0x8a3a24)); // red-brown shoes
    sv.build();
    shin.add(sv);
  }

  const torso = pivot(root, 0, 1, 0);
  torso.rotation.x = -0.06;
  const tVox = V('teacherTorso');
  tVox.ell(0, 6, 0, 5.3, 6.6, 3, (x, y, z) => {
    if (z < -1.2) {
      if (Math.abs(x) < 1.6 && y > 1.5) return TOP;                          // teal top under the cardigan
      if (Math.abs(Math.abs(x) - 1.9) < 0.25) return CARDI_DARK;             // cardigan edges
      if (Math.abs(x + 2.3) < 0.3 && [3.2, 5.6, 8].some((by) => Math.abs(y - by) < 0.3)) return 0x6a3a1a; // buttons
    }
    return CARDI;
  });
  for (const s of [-1, 1]) tVox.ell(s * 4.5, 10.6, 0, 2, 2, 2, CARDI);
  // lanyard + name badge
  tVox.cap(-1.4, 12, -1.9, 0, 6.3, -3.1, 0.18, 0x2a6ad6, 0);
  tVox.cap(1.4, 12, -1.9, 0, 6.3, -3.1, 0.18, 0x2a6ad6, 0);
  tVox.wbox(-0.9, 4.6, -3.4, 1.8, 1.5, 0.25, (x, y) => (y > 5.6 ? 0x2a6ad6 : 0xffffff), 0);
  tVox.build();
  torso.add(tVox);

  // heads: talking (mouth open), mouth closed, eyes closed (blink)
  const head = pivot(torso, 0, 12, 0);
  function makeHead(mouthOpen, blink) {
    const h = V('teacherHead');
    h.cap(0, -0.5, 0, 0, 1.5, 0, 1.3, SK_SHADE);
    h.ell(0, 5, 0, 3.9, 4.7, 4, (x, y, z) => {
      if (z > -1.5) return SK;
      for (const s of [-1, 1]) {
        const ex = s * 1.6;
        if (inE(x, y, ex, 5.55, 1.25, 1.0) && !inE(x, y, ex, 5.55, 0.98, 0.76)) return 0xc0392b; // round red glasses
        if (blink && inE(x, y, ex, 5.4, 0.7, 0.4) && y > 5.4) return 0x2a1a12;
        if (!blink && inE(x, y, ex, 5.55, 0.6, 0.55)) return inE(x, y, ex, 5.5, 0.3, 0.32) ? 0x1e140e : 0xf6f2ea;
        if (Math.abs(x - ex) < 0.95 && Math.abs(y - (7.0 - Math.abs(x - ex) * 0.25)) < 0.17) return 0x22160f; // arched, expressive brows
        if (inE(x, y, s * 2.6, 3.7, 0.8, 0.45)) return 0xb8604a;
      }
      if (Math.abs(x) < 0.65 && Math.abs(y - 5.75) < 0.14) return 0xc0392b; // bridge
      if (inE(x, y, 0, 4.1, 0.45, 0.8)) return SK_SHADE;
      if (mouthOpen) {
        if (inE(x, y, 0, 2.55, 1.2, 0.75) && y < 2.9) return inE(x, y, 0, 2.15, 0.6, 0.3) ? 0xd06a6a : 0x5a1e22;
        if (inE(x, y, 0, 2.95, 1.25, 0.3)) return 0xf8f4ee; // teeth
      } else if (inE(x, y, 0, 2.75, 1.4, 0.75) && !inE(x, y, 0, 3.1, 1.35, 0.62)) return 0x6a2a2a;
      return SK;
    });
    h.ell(-3.9, 5, 0, 0.6, 1.1, 0.9, SK_SHADE);
    h.ell(3.9, 5, 0, 0.6, 1.1, 0.9, SK_SHADE);
    for (const s of [-1, 1]) h.ell(s * 4.05, 3.4, -0.2, 0.4, 0.5, 0.4, 0x3fd0ff, 0); // big earrings
    // a cloud of curly hair with a streak of grey
    const hairCol = (x, y, z) => (x > 1.2 && x < 2.0 && y > 7.5 && z < 0 ? GREY : HAIR); // one grey streak at the front
    h.ell(0, 6.4, 0.8, 4.8, 4.9, 4.7, (x, y, z) => (y > 8.6 || z > 0.4 || (Math.abs(x) > 3.6 && y > 3) ? hairCol(x, y, z) : null), 0.07);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      h.ell(Math.cos(a) * 4.2, 8.2 + Math.sin(i * 1.7) * 1.2, Math.sin(a) * 3.8 + 1, 1.5, 1.5, 1.5, hairCol, 0.08);
    }
    h.build();
    return h;
  }
  const heads = { talk: makeHead(true, false), quiet: makeHead(false, false), blink: makeHead(false, true) };
  for (const k in heads) head.add(heads[k]);

  // ---- book, held out to her left (-x), pages facing -z
  const book = pivot(torso, -5.2, 7.6, -7.4);
  book.rotation.y = 0.12;
  const cover = V('bookCover');
  cover.wbox(-PAGE_W - 0.3, -PAGE_H / 2 - 0.3, 0, PAGE_W * 2 + 0.6, PAGE_H + 0.6, 0.5, 0x2f6fd6, 0.02);
  cover.wbox(-0.25, -PAGE_H / 2 - 0.3, -0.25, 0.5, PAGE_H + 0.6, 0.25, 0x244f9a, 0);
  cover.build();
  book.add(cover);
  const pages = SPREADS.map((spread, si) => spread.map((fn, side) => {
    const g = V(`page${si}${side}`);
    const x0 = side ? 0.25 : -PAGE_W - 0.25;
    g.wbox(x0, -PAGE_H / 2, -0.25, PAGE_W, PAGE_H, 0.25, (x, y) => {
      const u = (x - x0) / PAGE_W, v = (y + PAGE_H / 2) / PAGE_H;
      if (u < 0.05 || u > 0.95 || v < 0.04 || v > 0.96) return 0xfbf6e8; // white margin
      return fn(u, v);
    }, 0.03);
    g.build({ castShadow: false });
    book.add(g);
    return g;
  }));
  const leafPivot = pivot(book, 0, 0, -0.3);
  const leaf = V('leaf');
  leaf.wbox(0.25, -PAGE_H / 2, -0.25, PAGE_W, PAGE_H, 0.25, 0xfbf6e8, 0.02);
  leaf.build({ castShadow: false });
  leafPivot.add(leaf);

  // ---- arms. Left holds the book from below; right turns pages and gestures.
  const lArm = V('teacherLeftArm');
  lArm.cap(-4.6, 10.6, 0, -6.4, 5.4, -3.0, 1.45, CARDI);
  lArm.cap(-6.4, 5.4, -3.0, -5.6, 3.3, -7.0, 1.3, (x, y, z) => (z < -6.2 ? CARDI_DARK : CARDI));
  lArm.ell(-5.4, 3.4, -7.6, 0.9, 1.0, 0.9, SK);
  lArm.build();
  torso.add(lArm);
  const rShoulder = pivot(torso, 4.6, 10.6, 0);
  const rArm = V('teacherRightArm');
  rArm.cap(0, 0, 0, 0.8, -5.0, -2.4, 1.45, CARDI);
  rArm.cap(0.8, -5.0, -2.4, -1.6, -6.2, -6.0, 1.3, (x, y, z) => (z < -5.3 ? CARDI_DARK : CARDI));
  rArm.ell(-1.9, -6.2, -6.6, 0.95, 0.9, 1.0, SK);
  rArm.build();
  rShoulder.add(rArm);

  function spreadAt(t) {
    if (t < FIRST_FLIP) return { cur: 0, k: -1 };
    const n = Math.floor((t - FIRST_FLIP) / FLIP_EVERY);
    const local = t - FIRST_FLIP - n * FLIP_EVERY;
    return { cur: (n + 1) % SPREADS.length, k: local < FLIP_LEN ? local / FLIP_LEN : -1 }; // flip n turns to spread n+1
  }
  function update(time) {
    const t = loop ? ((time % loop) + loop) % loop : time;
    const b = Math.sin(t * lw(1.2));
    torso.scale.set(1 + b * 0.01, 1 + b * 0.006, 1 + b * 0.015);
    // page turning: during a flip the next spread's right page is already underneath
    const { cur, k } = spreadAt(t);
    const flipping = k >= 0;
    const prev = flipping ? (cur + SPREADS.length - 1) % SPREADS.length : cur;
    pages.forEach(([L, Rp], i) => {
      L.visible = flipping ? i === (k > 0.5 ? cur : prev) : i === cur;
      Rp.visible = i === cur;
    });
    leaf.visible = flipping;
    leafPivot.rotation.y = flipping ? Math.PI * (k * k * (3 - 2 * k)) * 0.98 : 0;
    // right hand: reach for the page corner around each flip, otherwise talk with it
    const sinceFlip = t < FIRST_FLIP ? 99 : (t - FIRST_FLIP) % FLIP_EVERY;
    const toFlip = FLIP_EVERY - sinceFlip;
    const reach = t < FIRST_FLIP ? Math.max(0, 1 - (FIRST_FLIP - t) / 0.6)
      : sinceFlip < FLIP_LEN ? 1 - sinceFlip / FLIP_LEN : Math.max(0, 1 - toFlip / 0.6);
    rShoulder.rotation.x = 0.15 + reach * 0.75 + (1 - reach) * Math.max(0, Math.sin(t * lw(2.1))) * 0.35;
    rShoulder.rotation.y = reach * 0.55;
    rShoulder.rotation.z = (1 - reach) * Math.sin(t * lw(1.4)) * 0.12;
    book.position.y = 7.6 + Math.sin(t * lw(0.9)) * 0.15;
    // reading aloud: glance at the book, then out to the kids
    const glance = (Math.sin(t * lw(0.8)) + 1) / 2;
    head.rotation.y = 0.15 + glance * 0.45 - Math.sin(t * lw(0.37)) * 0.3;
    head.rotation.x = -0.12 + Math.sin(t * lw(1.6)) * 0.04;
    head.rotation.z = Math.sin(t * lw(0.7)) * 0.07;
    const syll = Math.sin(t * lw(13)) + Math.sin(t * lw(7.3)) * 0.6;
    const pausing = (t % TALK) > TALK - 0.7;
    const blink = t % BLINK > BLINK - 0.25;
    heads.blink.visible = blink;
    heads.talk.visible = !blink && !pausing && syll > 0.15;
    heads.quiet.visible = !blink && !heads.talk.visible;
  }

  return { root, update, head };
}

// ------------------------------------------------------------------ walking grown-up
// Power-walking after a kid on a bike. Faces and walks toward -z; root sits on the ground
// under the feet. `look` is a PARENT_LOOKS key or a whole look object.
// opts.speed: ground speed (units/s) so the stride matches the ground going by.
// opts.chaser: the kid's backpack, sweat, and the odd "wait!" reach.
// opts.lead: right hand held out for a dog lead. opts.calm: a rested face.
const LEG = 19.8; // thigh pivot to sole
const sm = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const bump = (x, a, b, ramp = 0.35) => sm((x - a) / ramp) * (1 - sm((x - b + ramp) / ramp)); // 0..1..0 over [a, b]

export function buildWalker(look = 'dad', { speed = 30, chaser = true, lead = false, calm = false, phase = 0, loop = 0 } = {}) {
  const lw = loopW(loop), lp = loopP(loop);
  const L = typeof look === 'object' ? look : PARENT_LOOKS[look] || PARENT_LOOKS.dad;
  const SK = L.skin ?? SKIN_BASE;
  const TOP = L.top, TOP_DARK = L.topDark;
  const pantsColor = (x, y, z) => L.pantsFn?.(x, y, z) ?? L.pants;
  const root = new THREE.Group();
  root.name = 'walker';
  const hips = pivot(root, 0, LEG + 0.4, 0);

  const pelvis = V('walkerPelvis');
  pelvis.ell(0, 0, 0.3, 4.6, 2.4, 2.8, pantsColor);
  pelvis.build();
  hips.add(pelvis);

  const legs = [];
  for (const s of [-1, 1]) {
    const thigh = pivot(hips, s * 2.3, -0.4, 0);
    const tv = V('walkerThigh');
    tv.cap(0, 0, 0, 0, -9, 0, 2, pantsColor);
    tv.build();
    thigh.add(tv);
    const shin = pivot(thigh, 0, -9, 0);
    const sv = V('walkerShin');
    sv.cap(0, 0, 0, 0, -8.6, 0, 1.7, pantsColor);
    addShoe(sv, L, s, SK, true);
    sv.build();
    shin.add(sv);
    legs.push({ s, thigh, shin });
  }

  const torso = pivot(hips, 0, 1, 0);
  const tVox = V('walkerTorso');
  const sweaty = shadeOf(TOP, 0.78);
  tVox.ell(0, 6, 0, 5.2, 6.6, 2.8, (x, y, z) => {
    if (chaser && z > 1.6 && inE(x, y, 0, 8.4, 2.4, 2.8)) return sweaty; // sweat patch between the shoulders
    return L.topFn?.(x, y, z, L) ?? TOP;
  });
  for (const s of [-1, 1]) tVox.ell(s * 4.4, 10.6, 0, 1.9, 1.9, 1.9, TOP);
  if (L.hood) tVox.cap(-3.5, 11.2, 2, 3.5, 11.2, 2, 1.3, TOP_DARK);
  else tVox.cap(-2, 12.2, -0.6, 2, 12.2, -0.6, 0.6, TOP_DARK, 0.02);
  if (chaser) {
    // the kid's tiny unicorn backpack, slung off one shoulder
    const BAG = 0xc79bff, BAG_DARK = 0xa97ee6;
    tVox.ell(1.2, 6.6, 3.9, 2.3, 2.7, 1.3, (x, y, z) => {
      if (z > 4.6) {
        if (inE(x, y, 0.4, 7.2, 0.3, 0.3) || inE(x, y, 2.0, 7.2, 0.3, 0.3)) return 0x2a2033; // eyes
        if (inE(x, y, 1.2, 5.6, 0.9, 0.35)) return 0xff8fc8;                                  // blush/smile
      }
      return y < 4.5 ? BAG_DARK : BAG;
    }, 0.03);
    tVox.cap(1.2, 9.2, 4.2, 1.2, 10.9, 3.6, 0.35, 0xffe066, 0); // horn
    tVox.ell(-0.4, 9.0, 4.0, 0.5, 0.7, 0.4, 0xff8fc8, 0);        // ears
    tVox.ell(2.8, 9.0, 4.0, 0.5, 0.7, 0.4, 0xff8fc8, 0);
    tVox.cap(2.2, 8.9, 4.2, 3.6, 12.2, 0.6, 0.32, BAG_DARK, 0);  // strap over the right shoulder
    tVox.cap(3.6, 12.2, 0.6, 3.3, 6.0, -2.9, 0.32, BAG_DARK, 0);
  }
  tVox.build();
  torso.add(tVox);

  const head = pivot(torso, 0, 12, 0);
  const headOpen = makeParentHead(L, false, false, calm), headClosed = makeParentHead(L, true, false, calm);
  head.add(headOpen, headClosed);
  if (chaser) {
    const sweat = V('sweat');
    sweat.ell(3.55, 7.0, -2.5, 0.3, 0.5, 0.3, 0xcfefff, 0);
    sweat.ell(-2.3, 8.3, -3.5, 0.28, 0.42, 0.28, 0xcfefff, 0);
    sweat.ell(-3.7, 5.6, -1.8, 0.25, 0.4, 0.25, 0xcfefff, 0);
    sweat.build({ castShadow: false });
    head.add(sweat);
  }

  const short = (L.sleeve ?? 9) < 6;
  const arms = [];
  let hand;
  for (const s of [-1, 1]) {
    const sh = pivot(torso, s * 4.6, 10.4, 0);
    sh.rotation.z = s * 0.1;
    const up = V('walkerUpperArm');
    up.cap(0, 0, 0, 0, -5, 0, 1.45, (x, y) => (short && y < -2.2 ? SK : TOP));
    if (short) up.cap(0, 0, 0, 0, -2.0, 0, 1.75, (x, y) => (y < -1.6 ? TOP_DARK : TOP));
    up.build();
    sh.add(up);
    const elbow = pivot(sh, 0, -5, 0);
    const fore = V('walkerForearm');
    fore.cap(0, 0, 0, 0, -4.4, 0, 1.2, (x, y) => (short ? SK : y < -3.8 ? TOP_DARK : TOP));
    fore.ell(0, -5.1, -0.1, 0.95, 1.1, 0.9, SK);
    fore.build();
    elbow.add(fore);
    if (s > 0) hand = pivot(elbow, 0, -5.6, 0);
    arms.push({ s, sh, elbow });
  }

  const P = lp(speed > 20 ? 1.0 : 1.35); // seconds per stride cycle (two steps)
  const A = Math.asin(Math.min(0.5, (speed * P) / (4 * LEG))); // swing amplitude that covers `speed`
  const legAngle = (p) => (p < 0.5 ? A * (1 - 4 * p) : -A + 2 * A * sm((p - 0.5) * 2));
  function update(time) {
    const t = time + phase;
    const cyc = t / P;
    let stance = 0;
    const angles = {};
    for (const { s, thigh, shin } of legs) {
      const p = (((cyc + (s > 0 ? 0.5 : 0)) % 1) + 1) % 1;
      const a = legAngle(p);
      thigh.rotation.x = a;
      shin.rotation.x = p < 0.5 ? -0.06 : -Math.sin(Math.PI * (p - 0.5) * 2) * 1.15;
      if (p < 0.5) stance = a;
      angles[s] = a;
    }
    hips.position.y = LEG * Math.cos(stance) + 0.4;
    const w = Math.sin(cyc * Math.PI * 2);
    hips.rotation.y = w * 0.09;
    hips.rotation.z = Math.cos(cyc * Math.PI * 4) * 0.02;
    torso.rotation.y = -w * 0.14;
    torso.rotation.x = (speed > 20 ? -0.17 : -0.04) + Math.cos(cyc * Math.PI * 4) * 0.015;
    torso.scale.z = 1 + Math.sin(t * lw(8.5)) * (chaser ? 0.025 : 0.01); // puffing
    const reach = chaser ? bump(t % lp(7.5), 3.1, 4.7) : 0; // "wait for me!"
    for (const { s, sh, elbow } of arms) {
      const swing = -angles[s] * 1.5;
      if (lead && s > 0) {
        sh.rotation.x = 0.55 + Math.sin(t * lw(2)) * 0.05;
        elbow.rotation.x = 0.55;
      } else if (s > 0) {
        sh.rotation.x = swing + (1.55 - swing) * reach;
        elbow.rotation.x = (speed > 20 ? 1.3 : 0.35) * (1 - reach) + 0.15 * reach;
      } else {
        sh.rotation.x = swing;
        elbow.rotation.x = speed > 20 ? 1.3 + Math.sin(cyc * Math.PI * 2) * 0.1 : 0.35;
      }
    }
    head.rotation.y = -torso.rotation.y * 0.8 - hips.rotation.y;
    head.rotation.x = (speed > 20 ? 0.16 : 0.04) - reach * 0.12 + Math.cos(cyc * Math.PI * 4) * 0.02;
    const closed = (t % lp(3.3)) > lp(3.3) - 0.18;
    headOpen.visible = !closed;
    headClosed.visible = closed;
  }

  return { root, update, head, hand };
}

// ------------------------------------------------------------------ kid on a bike
// A pedal bike with training wheels and streamers, kid in a helmet. Faces/rides toward -z,
// root on the ground. update(t, dist): dist = ground distance travelled (drives wheels + pedals).
// opts.loop / opts.loopDist: seconds and ground distance per loop, for a seamless loop.
export function buildBikeKid(look = 'girl', { loop = 0, loopDist = 0 } = {}) {
  const lw = loopW(loop), lp = loopP(loop);
  const L = { ...(typeof look === 'object' ? { ...TODDLER_LOOKS.girl, ...look } : TODDLER_LOOKS[look] || TODDLER_LOOKS.girl), grin: true };
  const SK = L.skin ?? SKIN_BASE, SKS = shadeOf(SK);
  const FRAME = L.bike, ACC = L.bikeAcc;
  const root = new THREE.Group();
  root.name = 'bikeKid';
  const rig = pivot(root, 0, 0, 0); // lean + wobble

  const WR = 4.2, RZ = 5.6, FZ = -5.6;
  const BB = { y: 3.6, z: 0.4 };
  const fr = V('bikeFrame');
  const tube = (a, b, r = 0.45, c = FRAME) => fr.cap(...a, ...b, r, c, 0.02);
  for (const s of [-1, 1]) {
    tube([s * 0.9, WR, RZ], [s * 0.45, BB.y, BB.z]);          // chainstays
    tube([s * 0.9, WR, RZ], [s * 0.4, 9.7, 2.9]);             // seatstays
    tube([s * 0.9, WR, FZ], [s * 0.45, 9.0, -4.7], 0.42);     // fork
    tube([s * 0.9, WR, RZ], [s * 3.4, 1.7, 6.8], 0.3, 0xd8d8d8); // training wheel brackets
    tube([s * 0.4, 9.7, 2.9], [s * 0.6, 4.6, RZ + 0.2], 0.3, 0xd8d8d8);
  }
  tube([0, BB.y, BB.z], [0, 10, 3.0], 0.5);                   // seat tube
  tube([0, BB.y, BB.z], [0, 9.0, -4.7], 0.55);                // down tube
  tube([0, 9.0, -4.7], [0, 11.8, -4.1], 0.6);                 // head tube
  tube([0, 7.0, 2.0], [0, 10.6, -4.3], 0.45);                 // low step-through top tube
  tube([0, 10, 3.0], [0, 10.9, 3.2], 0.35, 0xcccccc);         // seat post
  fr.ell(0, 11.2, 3.5, 1.4, 0.55, 2.3, (x, y, z) => (Math.abs(x) < 0.3 ? ACC : 0x2a2a2e), 0.02); // saddle
  tube([0, 11.8, -4.1], [0, 13.4, -3.6], 0.42, 0xcccccc);     // stem
  for (const s of [-1, 1]) {
    tube([0, 13.4, -3.6], [s * 2.6, 14.6, -2.1], 0.36, 0xd8d8d8); // riser bars
    fr.cap(s * 2.6, 14.6, -2.1, s * 4.0, 14.9, -1.7, 0.55, ACC, 0.02); // grips
  }
  // chain guard
  fr.fill(1.0, 2.0, -1.8, 1.4, 5.4, 6.6, (x, y, z) => inE(z, y, 2.2, 3.7, 4.2, 1.6), FRAME, 0.03);
  // a little basket on the front with a flower in it
  fr.fill(-2.2, 9.6, -9.6, 2.2, 12.6, -6.6, (x, y, z) =>
    Math.abs(x) > 1.8 || z < -9.2 || z > -7.0 || y < 10.0, (x, y) => ((Math.floor(x * 2) + Math.floor(y * 2)) % 2 ? 0xffffff : 0xeeeeee), 0.02);
  fr.cap(0.6, 11, -8, 0.9, 13.6, -8.4, 0.18, 0x4caf50, 0);
  fr.ell(0.9, 13.9, -8.4, 0.7, 0.7, 0.5, 0xffd23f, 0);
  fr.ell(0.9, 13.9, -8.75, 0.3, 0.3, 0.3, 0xff7a5c, 0);
  fr.build();
  rig.add(fr);

  function wheel(name, r, w, beads) {
    const g = V(name);
    g.fill(-w / 2, -r, -r, w / 2, r, r, (x, y, z) => Math.hypot(y, z) <= r, (x, y, z) => {
      const d = Math.hypot(y, z), a = Math.atan2(z, y);
      if (d > r - 0.9) return Math.sin(a * 24) > 0.6 ? 0x3a3a40 : 0x26262a; // knobbly tyre
      if (d > r - 1.3) return FRAME;                                          // rim
      if (d < 0.7) return 0xd8d8d8;                                            // hub
      for (let k = 0; k < 5; k++) {
        const ak = (k / 5) * Math.PI * 2;
        if (Math.abs(d * Math.sin(a - ak)) < 0.32 && Math.cos(a - ak) > 0) {
          if (beads && k % 2 === 0 && Math.abs(d - r * 0.55) < 0.45) return [0xffd23f, 0x3fd0ff, 0xff3fa4][k / 2]; // spoke beads
          return 0xffffff;
        }
      }
      return null;
    }, 0.02);
    g.build();
    return g;
  }
  const rear = pivot(rig, 0, WR, RZ), front = pivot(rig, 0, WR, FZ);
  rear.add(wheel('rearWheel', WR, 1.2, true));
  front.add(wheel('frontWheel', WR, 1.2, true));
  const trainers = [-1, 1].map((s) => {
    const p = pivot(rig, s * 3.4, 1.7, 6.8);
    p.add(wheel('trainingWheel', 1.7, 0.6, false));
    return p;
  });

  const crank = pivot(rig, 0, BB.y, BB.z);
  const cv = V('crank');
  cv.fill(0.6, -1.7, -1.7, 1.0, 1.7, 1.7, (x, y, z) => Math.hypot(y, z) <= 1.7, (x, y, z) => (Math.hypot(y, z) > 1.3 ? 0x9a9aa0 : ACC), 0.02);
  for (const s of [-1, 1]) {
    cv.cap(s * 1.2, 0, 0, s * 1.2, s * 1.8, 0, 0.28, 0x9a9aa0, 0);
    cv.wbox(s > 0 ? 1.2 : -2.6, s * 1.8 - 0.3, -0.7, 1.4, 0.6, 1.4, 0x2a2a2e, 0);
  }
  cv.build();
  crank.add(cv);

  // streamers off the grips
  const streamers = [-1, 1].map((s) => {
    const p = pivot(rig, s * 4.1, 14.9, -1.7);
    const g = V('streamers');
    [0xff3fa4, 0xffffff, 0x3fd0ff, 0xffd23f].forEach((c, i) =>
      g.cap(0, 0, 0, s * (0.6 + i * 0.25), -1.2 - i * 0.4, 3.2 + i * 0.3, 0.14, c, 0));
    g.build({ castShadow: false });
    p.add(g);
    return p;
  });

  // ---- the kid
  const HIP = new THREE.Vector3(0, 11.9, 3.2);
  const pel = V('bikeKidPelvis');
  pel.ell(0, 11.9, 3.3, 2.5, 1.5, 2.1, L.legs[0]);
  pel.build();
  rig.add(pel);
  const torso = pivot(rig, HIP.x, HIP.y, HIP.z);
  torso.rotation.x = -0.32;
  const tv = V('bikeKidTorso');
  tv.ell(0, 3.3, 0, 2.8, 3.6, 2.1, (x, y) => (Math.floor(y / 0.75) % 2 ? L.tee[0] : L.tee[1]));
  tv.build();
  torso.add(tv);
  const head = pivot(torso, 0, 6.3, 0.2);
  head.scale.setScalar(0.88);
  head.add(makeToddlerHead(L, SK, SKS));
  const hm = V('helmet');
  const HEL = L.helmet;
  hm.ell(0, 4.4, 0.2, 4.65, 4.65, 4.55, (x, y, z) => {
    if (y < 5.1 + Math.max(0, -z - 2) * 0.25) return null; // sits above the brows at the front
    if (Math.abs(x) < 0.5 || Math.abs(Math.abs(x) - 2.2) < 0.35) return y > 7.2 ? 0x2a2a2e : 0xffffff; // vents + stripes
    return HEL;
  }, 0.03);
  hm.cap(-2.6, 6.2, -4.4, 2.6, 6.2, -4.4, 0.45, shadeOf(HEL, 0.8), 0); // peak
  for (const s of [-1, 1]) hm.cap(s * 3.9, 4.8, -0.4, s * 2.0, 0.4, -1.8, 0.16, 0x2a2a2e, 0); // chin strap
  hm.build();
  head.add(hm);

  // arms to the grips (built in torso space so they lean with it)
  root.updateMatrixWorld(true);
  const armV = V('bikeKidArms');
  for (const s of [-1, 1]) {
    const sh = new THREE.Vector3(s * 2.9, 5.8, 0);
    const grip = torso.worldToLocal(new THREE.Vector3(s * 3.3, 14.8, -1.8));
    const el = sh.clone().lerp(grip, 0.5).add(new THREE.Vector3(s * 0.9, -0.5, 0.4));
    armV.cap(sh.x, sh.y, sh.z, el.x, el.y, el.z, 0.95, (x, y, z) => (Math.hypot(x - sh.x, y - sh.y, z - sh.z) < 1.5 ? L.tee[0] : SK));
    armV.cap(el.x, el.y, el.z, grip.x, grip.y, grip.z, 0.85, SK);
    armV.ell(grip.x, grip.y + 0.2, grip.z, 0.9, 0.9, 0.9, SK);
  }
  armV.build();
  torso.add(armV);

  // legs: two-bone IK to the pedals
  const L1 = 5, L2 = 5;
  const legs = [-1, 1].map((s) => {
    const thigh = pivot(rig, s * 1.4, 11.6, 3.0);
    const t1 = V('bikeKidThigh');
    t1.cap(0, 0, 0, 0, -L1, 0, 1.15, L.legs[s > 0 ? 1 : 0]);
    t1.build();
    thigh.add(t1);
    const shin = pivot(thigh, 0, -L1, 0);
    const t2 = V('bikeKidShin');
    t2.cap(0, 0, 0, 0, -4.4, 0, 1.0, L.legs[s > 0 ? 1 : 0]);
    t2.ell(0, -5.0, -0.5, 1.0, 0.8, 1.55, (x, y) => (y < -5.5 ? L.shoe : 0xffffff)); // trainers
    t2.build();
    shin.add(t2);
    return { s, thigh, shin };
  });

  // over one loop, turn each wheel/crank a whole number of times
  const turns = (r) => (loop && loopDist ? (Math.max(1, Math.round(loopDist / r / (2 * Math.PI))) * 2 * Math.PI) / (loopDist / r) : 1);
  const kW = turns(WR), kT = turns(1.7), kC = turns(WR * 1.9);
  function update(t, dist) {
    rear.rotation.x = front.rotation.x = (-dist / WR) * kW;
    for (const p of trainers) p.rotation.x = (-dist / 1.7) * kT;
    const c = (dist / (WR * 1.9)) * kC;
    crank.rotation.x = -c;
    for (const { s, thigh, shin } of legs) {
      const py = BB.y + s * 1.8 * Math.cos(c) + 0.9, pz = BB.z - s * 1.8 * Math.sin(c) + 0.2;
      const dy = py - 11.6, dz = pz - 3.0;
      const d = Math.min(L1 + L2 - 0.01, Math.hypot(dy, dz));
      const ad = Math.atan2(-dz, -dy);
      const beta = Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d));
      const kappa = Math.acos((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2));
      thigh.rotation.x = ad + beta;
      shin.rotation.x = -(Math.PI - kappa);
    }
    rig.rotation.z = Math.sin(t * lw(1.7)) * 0.035 + Math.sin(t * lw(4.1)) * 0.01;
    rig.position.y = Math.abs(Math.sin(t * lw(6.3))) * 0.12; // bumpy path
    for (const [i, p] of streamers.entries()) {
      p.rotation.x = Math.sin(t * lw(17) + i) * 0.12;
      p.rotation.y = Math.sin(t * lw(13) + i * 2) * 0.2;
    }
    // glances back at the grown-up, giggling
    const back = bump(t % lp(8.5), 5.0, 7.0, 0.45);
    torso.rotation.y = -back * 0.35;
    torso.rotation.x = -0.32 + Math.sin(t * lw(3)) * 0.02 + back * 0.1;
    head.rotation.y = -back * 1.15 + Math.sin(t * lw(0.8)) * 0.08;
    head.rotation.x = 0.28 - back * 0.1 + Math.sin(t * lw(9)) * 0.03 * back;
    head.rotation.z = Math.sin(t * lw(1.3)) * 0.06;
  }

  return { root, update, head };
}

// ------------------------------------------------------------------ dogs
const DOGS = {
  lab: { coat: 0xd9a95a, dark: 0xbf8f45, belly: 0xe8c483, body: [2.7, 3.0, 7], h: 10.5, legR: 1.0, head: 2.6, snout: [1.4, 1.15, 2.1], ears: 'flop', tail: 'otter', tongue: true },
  sausage: { coat: 0x7a3a18, dark: 0x5e2a10, belly: 0xc7834a, body: [1.65, 1.9, 6.5], h: 4.6, legR: 0.75, head: 1.85, snout: [0.9, 0.8, 1.9], ears: 'long', tail: 'thin' },
  westie: { coat: 0xf4f2ec, dark: 0xe2ded4, belly: 0xffffff, body: [2.1, 2.4, 4.0], h: 5.8, legR: 0.85, head: 2.5, snout: [1.1, 1.0, 1.1], ears: 'prick', tail: 'carrot', fluffy: true, tongue: true },
};

// faces -z, root on the ground. update(t, speed): speed = ground speed, 0 = standing.
export function buildDog(kind = 'lab', { phase = 0, collar = 0xe64545, loop = 0 } = {}) {
  const lw = loopW(loop);
  const D = DOGS[kind] || DOGS.lab;
  const [bw, bh, bl] = D.body;
  const root = new THREE.Group();
  root.name = `dog-${kind}`;
  const bodyPivot = pivot(root, 0, D.h, 0);
  const coat = (x, y, z) => (y < -bh * 0.45 ? D.belly : Math.sin(x * 3 + z * 2) > 0.85 ? D.dark : D.coat);
  const jit = D.fluffy ? 0.1 : 0.05;
  const b = V('dogBody');
  b.ell(0, 0, 0, bw, bh, bl, coat, jit);
  if (D.fluffy) for (let i = 0; i < 18; i++) b.ell((rand() - 0.5) * bw * 1.6, (rand() - 0.3) * bh * 1.4, (rand() - 0.5) * bl * 1.6, 0.9, 0.9, 0.9, D.coat, 0.12); // tufts
  b.build();
  bodyPivot.add(b);

  // head + neck
  const neck = pivot(bodyPivot, 0, bh * 0.45, -bl * 0.82);
  const hv = V('dogHead');
  const HR = D.head;
  hv.cap(0, -bh * 0.4, bl * 0.12, 0, HR * 0.6, -HR * 0.2, HR * 0.72, D.coat, jit);
  const hy = HR * 0.9, hz = -HR * 0.4;
  hv.ell(0, hy, hz, HR, HR * 0.92, HR, (x, y, z) => {
    for (const s of [-1, 1]) if (z < hz - HR * 0.55 && inE(x, y, s * HR * 0.42, hy + HR * 0.25, 0.32, 0.32)) return 0x1a1410; // eyes
    return D.coat;
  }, jit);
  const [sx, sy, sz] = D.snout;
  const snz = hz - HR * 0.7 - sz * 0.6;
  hv.ell(0, hy - HR * 0.3, snz, sx, sy, sz, (x, y) => (y < hy - HR * 0.3 - sy * 0.4 ? D.belly : D.coat), jit * 0.6);
  hv.ell(0, hy - HR * 0.15, snz - sz * 0.92, sx * 0.45, sy * 0.4, 0.4, 0x1a1410, 0); // nose
  if (D.tongue) hv.ell(0, hy - HR * 0.3 - sy * 1.0, snz - sz * 0.4, sx * 0.4, 0.5, sz * 0.45, 0xff6f8a, 0);
  hv.cap(-bw * 0.7, -bh * 0.05, bl * 0.1, bw * 0.7, -bh * 0.05, bl * 0.1, 0.35, collar, 0); // collar
  hv.build();
  neck.add(hv);
  const ears = [-1, 1].map((s) => {
    const p = pivot(neck, s * HR * 0.72, hy + HR * 0.55, hz + 0.2);
    const e = V('dogEar');
    if (D.ears === 'prick') e.cap(0, 0, 0, s * 0.3, 1.6, 0.1, 0.55, D.coat, jit);
    else if (D.ears === 'long') e.ell(s * 0.5, -1.6, 0, 0.5, 1.8, 1.1, D.dark, 0.03);
    else e.ell(s * 0.6, -1.0, 0.1, 0.55, 1.6, 1.25, D.dark, 0.03);
    e.build();
    p.add(e);
    return p;
  });

  const tail = pivot(bodyPivot, 0, bh * 0.5, bl * 0.92);
  const tv = V('dogTail');
  if (D.tail === 'carrot') tv.cap(0, 0, 0, 0, 2.6, 1.0, 0.65, D.coat, jit);
  else if (D.tail === 'thin') tv.cap(0, 0, 0, 0, 1.4, 3.6, 0.35, D.coat, 0.03);
  else tv.cap(0, 0, 0, 0, 1.5, 5.4, 0.7, D.coat, 0.03);
  tv.build();
  tail.add(tv);

  const legLen = D.h - bh * 0.3;
  const legs = [];
  for (const fz of [-1, 1]) for (const s of [-1, 1]) {
    const p = pivot(bodyPivot, s * bw * 0.55, -bh * 0.3, fz * bl * 0.66);
    const l = V('dogLeg');
    l.cap(0, 0, 0, 0, -legLen + D.legR, 0, D.legR, (x, y) => (y > -legLen * 0.35 ? D.coat : D.fluffy ? D.coat : D.dark), jit);
    l.ell(0, -legLen + D.legR * 0.8, -D.legR * 0.5, D.legR * 1.1, D.legR * 0.8, D.legR * 1.5, D.dark, 0.03); // paw
    l.build();
    p.add(l);
    legs.push({ p, front: fz < 0, s });
  }

  function update(time, speed = 0) {
    const t = time + phase;
    if (speed < 1) { // standing, tail going
      for (const { p } of legs) p.rotation.x = 0;
      bodyPivot.position.y = D.h + Math.sin(t * lw(2)) * 0.05;
      tail.rotation.y = Math.sin(t * lw(11)) * 0.6;
      tail.rotation.x = -0.3;
      return;
    }
    const gallop = speed > 25;
    const stride = legLen * (gallop ? 3.4 : 1.6);
    const ph = (t * speed / stride) * Math.PI * 2;
    const A = gallop ? 0.75 : 0.45;
    for (const { p, front, s } of legs) {
      const off = gallop ? (front ? 0 : Math.PI * 0.9) + (s > 0 ? 0.35 : 0) : (front === (s > 0) ? 0 : Math.PI); // gallop pairs / trot diagonals
      p.rotation.x = Math.sin(ph + off) * A;
    }
    bodyPivot.rotation.x = gallop ? Math.sin(ph + 0.6) * 0.12 : 0;
    bodyPivot.position.y = D.h + (gallop ? Math.max(0, Math.sin(ph)) * legLen * 0.25 : Math.abs(Math.sin(ph)) * 0.2);
    neck.rotation.x = gallop ? -Math.sin(ph + 0.6) * 0.15 : Math.sin(ph * 2) * 0.04;
    tail.rotation.y = Math.sin(t * (gallop ? 7 : 10)) * 0.45;
    tail.rotation.x = gallop ? 0.35 : -0.15;
    for (const [i, e] of ears.entries()) e.rotation.x = (D.ears === 'prick' ? 0 : Math.sin(ph + i) * 0.35 + (gallop ? 0.4 : 0));
  }

  return { root, update, neck };
}
