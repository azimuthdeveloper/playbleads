import * as THREE from 'three';
import { VoxGroup } from './voxel.js';

// Layout (voxel units, x right, y up, z toward the viewer):
//   back wall z=-31, left wall x=-41, floor y=-1
//   TV on a stand against the back wall, screen centre (0, 18, -24.9)
//   couch at z 9..24, toddler near z -6

export const TV_SCREEN = { x: 0, y: 18, z: -24.9, w: 28, h: 16 };

export function buildRoom(scene) {
  const room = new THREE.Group();
  scene.add(room);

  // ---------- floor: wooden planks ----------
  const floor = new VoxGroup('floor');
  floor.boxFn(-40, -1, -30, 80, 1, 54, (x, y, z) => {
    const plank = Math.floor((z + 30) / 3);
    const seam = (x + plank * 7) % 13 === 0;
    if (seam) return 0x5a3a22;
    return plank % 2 ? 0x9a6a42 : 0x8c5e3a;
  }, 0.06);
  floor.build({ castShadow: false });
  room.add(floor);

  // ---------- rug under the toddler ----------
  const rug = new VoxGroup('rug');
  rug.boxFn(-18, 0, -18, 36, 1, 24, (x, y, z) => {
    const edge = x === -18 || x === 17 || z === -18 || z === 5;
    if (edge) return 0xe8d9b0;
    const ring = Math.max(Math.abs(x + 0.5) / 18, Math.abs(z + 6.5) / 12);
    return ring > 0.8 ? 0x2f6f73 : ring > 0.55 ? 0xc85a4a : 0x3b8a8f;
  }, 0.04);
  rug.position.y = -0.8; // rug sits almost flush, just raised off the planks
  rug.build({ castShadow: false });
  room.add(rug);

  // ---------- back wall with wallpaper stripes + skirting ----------
  const back = new VoxGroup('backWall');
  back.boxFn(-41, -1, -31, 82, 42, 1, (x, y) => {
    if (y < 2) return 0xeae2d2; // skirting
    return Math.floor((x + 41) / 3) % 2 ? 0x6f86a8 : 0x6880a2;
  }, 0.03);
  // a framed picture (crayon drawing taped up)
  back.box(20, 20, -30, 12, 9, 1, 0x3a2a1a);
  back.boxFn(21, 21, -30, 10, 7, 1, (x, y) => {
    if (y === 21 && x > 22 && x < 29) return 0x3fae4a; // grass
    if (x === 28 && y === 26) return 0xffd83a; // sun
    if ((x === 24 || x === 25) && y > 21 && y < 25) return 0xe04a4a; // house
    return 0xf6f2e6;
  }, 0.02);
  back.build({ castShadow: false });
  room.add(back);

  // ---------- left wall with a night window ----------
  const left = new VoxGroup('leftWall');
  left.boxFn(-41, -1, -30, 1, 42, 54, (x, y, z) => {
    if (y < 2) return 0xeae2d2;
    return Math.floor((z + 30) / 3) % 2 ? 0x6f86a8 : 0x6880a2;
  }, 0.03);
  left.remove(-41, 14, -10, 1, 16, 16); // window hole
  // frame
  left.box(-41, 13, -11, 2, 1, 18, 0xf2efe6);
  left.box(-41, 30, -11, 2, 1, 18, 0xf2efe6);
  left.box(-41, 13, -11, 2, 18, 1, 0xf2efe6);
  left.box(-41, 13, 6, 2, 18, 1, 0xf2efe6);
  left.box(-41, 21, -10, 1, 1, 16, 0xf2efe6); // mullion
  left.box(-41, 14, -2, 1, 16, 1, 0xf2efe6);
  // curtains
  left.box(-40, 12, -15, 1, 20, 4, 0xb8443f);
  left.box(-40, 12, 7, 1, 20, 4, 0xb8443f);
  left.build();
  room.add(left);

  // night sky behind the window
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 30),
    new THREE.MeshBasicMaterial({ color: 0x1c2a5a })
  );
  sky.rotation.y = Math.PI / 2;
  sky.position.set(-48, 22, -2);
  room.add(sky);
  const moon = new VoxGroup('moon');
  moon.sphere(0, 0, 0, 2.2, 0xfff6c8, 0.02);
  moon.position.set(-47, 26, -6);
  moon.build({ emissive: true, castShadow: false, receiveShadow: false });
  room.add(moon);

  // ---------- TV stand + TV ----------
  const stand = new VoxGroup('tvStand');
  stand.box(-16, 0, -29, 32, 1, 8, 0x3b2a20);
  stand.box(-16, 7, -29, 32, 1, 8, 0x4a3426);
  stand.box(-16, 1, -29, 1, 6, 8, 0x4a3426);
  stand.box(15, 1, -29, 1, 6, 8, 0x4a3426);
  stand.box(-1, 1, -29, 2, 6, 8, 0x4a3426);
  stand.box(-15, 1, -29, 14, 6, 1, 0x2c1f18);
  stand.box(1, 1, -29, 14, 6, 1, 0x2c1f18);
  // DVDs / game boxes on the shelf
  for (let i = 0; i < 9; i++) stand.box(-14 + i, 1, -27, 1, 4, 3, [0xd64545, 0x3f7fd6, 0xf2c94c, 0x55b86a][i % 4]);
  stand.box(4, 1, -26, 6, 2, 4, 0x222222); // console box
  stand.set(9, 2, -23, 0x55ff55, 0); // power LED
  stand.build();
  room.add(stand);

  const tv = new VoxGroup('tv');
  tv.box(-15, 9, -28, 30, 18, 3, 0x161618, 0.02); // bezel
  tv.box(-3, 8, -27, 6, 1, 2, 0x161618, 0.02); // foot
  tv.box(-15, 9, -25, 30, 1, 1, 0x222226, 0.02);
  tv.build();
  room.add(tv);

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(TV_SCREEN.w, TV_SCREEN.h),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })
  );
  screen.position.set(TV_SCREEN.x, TV_SCREEN.y, TV_SCREEN.z);
  room.add(screen);

  // ---------- couch ----------
  const couch = new VoxGroup('couch');
  const fabric = 0x7a4e8c, fabricDark = 0x5f3a6e, cushion = 0x8b5a9e;
  couch.box(-24, 0, 10, 2, 2, 2, 0x2a1d14);
  couch.box(22, 0, 10, 2, 2, 2, 0x2a1d14);
  couch.box(-24, 0, 22, 2, 2, 2, 0x2a1d14);
  couch.box(22, 0, 22, 2, 2, 2, 0x2a1d14);
  couch.box(-24, 2, 9, 48, 4, 16, fabricDark); // base
  couch.boxFn(-20, 6, 9, 40, 3, 11, (x) => (x === -7 || x === 6 ? fabricDark : cushion)); // seat cushions
  couch.box(-24, 6, 20, 48, 14, 5, fabric); // back
  couch.boxFn(-20, 9, 18, 40, 10, 2, (x) => (x === -7 || x === 6 ? fabricDark : cushion)); // back cushions
  couch.box(-24, 6, 9, 4, 7, 16, fabric); // arms
  couch.box(20, 6, 9, 4, 7, 16, fabric);
  couch.box(-24, 13, 9, 4, 1, 16, fabricDark);
  couch.box(20, 13, 9, 4, 1, 16, fabricDark);
  // stuff on the couch: a remote and a crumpled blanket
  couch.box(12, 9, 11, 1, 1, 3, 0x1a1a1a);
  couch.set(12, 10, 11, 0xd03030, 0);
  couch.boxFn(-19, 9, 10, 8, 2, 7, (x, y, z) => ((x + z) % 3 === 0 ? 0xe9a23b : y === 10 && (x + z) % 2 ? null : 0xf2c14e));
  couch.build();
  room.add(couch);

  // ---------- side table with cold coffee ----------
  const side = new VoxGroup('sideTable');
  side.box(-32, 0, 14, 1, 10, 1, 0x4a3426);
  side.box(-27, 0, 14, 1, 10, 1, 0x4a3426);
  side.box(-32, 0, 19, 1, 10, 1, 0x4a3426);
  side.box(-27, 0, 19, 1, 10, 1, 0x4a3426);
  side.box(-33, 10, 13, 7, 1, 8, 0x5a3e2c);
  side.box(-31, 11, 15, 2, 3, 2, 0xe8e8e8); // mug
  side.set(-29, 12, 15, 0xe8e8e8);
  side.set(-31, 13, 15, 0x3a2414, 0);
  side.box(-30, 11, 18, 3, 1, 2, 0xf4f0e8); // stack of unopened mail
  side.set(-29, 12, 18, 0xffffff);
  side.build();
  room.add(side);

  // ---------- floor lamp ----------
  const lamp = new VoxGroup('lamp');
  lamp.box(28, 0, 20, 4, 1, 4, 0x222222);
  lamp.box(29, 1, 21, 2, 26, 2, 0x333333);
  lamp.build();
  room.add(lamp);
  const shade = new VoxGroup('lampShade');
  shade.boxFn(26, 26, 18, 8, 6, 8, (x, y, z, i, j, k) => {
    const inset = j > 3 ? 1 : 0;
    if (i < inset || i > 7 - inset || k < inset || k > 7 - inset) return null;
    return 0xffd9a0;
  }, 0.02);
  shade.build({ emissive: true, castShadow: false });
  room.add(shade);

  // ---------- toys scattered on the floor ----------
  const toys = new VoxGroup('toys');
  const blocks = [
    [-12, -12, 0xe64545], [-9, -14, 0x3f7fd6], [-10, -11, 0xf2c94c],
    [14, -2, 0x55b86a], [16, 2, 0xe64545], [-15, 3, 0xf28c28],
  ];
  for (const [x, z, c] of blocks) toys.box(x, 0, z, 2, 2, 2, c, 0.03);
  toys.box(-10, 2, -12, 2, 2, 2, 0x9b59b6, 0.03); // stacked block
  toys.sphere(10, 2, -14, 2, 0xff5c8a, 0.03); // ball
  toys.boxFn(8, 2, -14, 5, 1, 1, (x) => (x % 2 ? 0xffffff : null), 0); // ball stripe
  // sippy cup
  toys.box(7, 0, -9, 2, 3, 2, 0x8fd3ff, 0.02);
  toys.box(7, 3, -9, 2, 1, 2, 0xff7aa8, 0.02);
  toys.set(8, 4, -9, 0xff7aa8, 0.02);
  // stacking rings
  toys.box(-6, 0, 2, 3, 1, 3, 0xe64545);
  toys.box(-6, 1, 2, 3, 1, 3, 0xf2c94c);
  toys.box(-5, 2, 3, 1, 3, 1, 0x3f7fd6);
  // crushed snack pouch + crumbs
  toys.box(20, 0, -4, 3, 1, 2, 0xff9f1c);
  for (const [x, z] of [[18, -6], [22, -1], [19, -2], [5, 0], [-2, -14]]) toys.set(x, 0, z, 0xe7c26b, 0.1);
  // laundry basket beside the couch
  toys.boxFn(26, 0, 4, 8, 6, 7, (x, y, z, i, j, k) => {
    const wall = i === 0 || i === 7 || k === 0 || k === 6 || j === 0;
    if (wall) return (i + j + k) % 2 ? 0xd8cfb8 : 0xc9bea3;
    if (j > 3) return [0xf06292, 0x64b5f6, 0xffffff, 0x81c784][(i * 3 + k) % 4];
    return null;
  });
  toys.box(27, 6, 5, 4, 2, 4, 0x64b5f6);
  toys.box(29, 6, 7, 4, 1, 3, 0xf06292);
  toys.build();
  room.add(toys);

  return { room, screen };
}
