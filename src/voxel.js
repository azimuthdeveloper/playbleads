import * as THREE from 'three';

// Deterministic RNG so the per-voxel colour jitter is identical every run.
let seed = 1337;
export function rand() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const tmpColor = new THREE.Color();
const tmpMatrix = new THREE.Matrix4();

/**
 * A group of unit voxels. Add voxels with box()/set()/sphere(), then build()
 * turns them into one InstancedMesh (interior voxels are culled).
 * Coordinates are integer cells; cell (x,y,z) spans [x, x+1] on each axis.
 */
export class VoxGroup extends THREE.Group {
  constructor(name = '', res = 1) {
    super();
    this.name = name;
    this.res = res; // world size of one voxel
    this.cells = new Map();
  }

  // ---- world-space shape rasterisers (for fine-res groups) ----
  // color: a value, or fn(x,y,z) => color|null, in world units local to the group
  fill(x0, y0, z0, x1, y1, z1, inside, color, jitter = 0.04) {
    const r = this.res;
    for (let i = Math.floor(x0 / r); i <= Math.ceil(x1 / r); i++)
      for (let j = Math.floor(y0 / r); j <= Math.ceil(y1 / r); j++)
        for (let k = Math.floor(z0 / r); k <= Math.ceil(z1 / r); k++) {
          const x = (i + 0.5) * r, y = (j + 0.5) * r, z = (k + 0.5) * r;
          if (!inside(x, y, z)) continue;
          const c = typeof color === 'function' ? color(x, y, z) : color;
          if (c != null) this.set(i, j, k, c, jitter);
        }
    return this;
  }

  ell(cx, cy, cz, rx, ry, rz, color, jitter) {
    return this.fill(cx - rx, cy - ry, cz - rz, cx + rx, cy + ry, cz + rz,
      (x, y, z) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1, color, jitter);
  }

  cap(ax, ay, az, bx, by, bz, rad, color, jitter) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L2 = dx * dx + dy * dy + dz * dz || 1;
    return this.fill(Math.min(ax, bx) - rad, Math.min(ay, by) - rad, Math.min(az, bz) - rad,
      Math.max(ax, bx) + rad, Math.max(ay, by) + rad, Math.max(az, bz) + rad, (x, y, z) => {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2));
        const px = ax + dx * t - x, py = ay + dy * t - y, pz = az + dz * t - z;
        return px * px + py * py + pz * pz <= rad * rad;
      }, color, jitter);
  }

  wbox(x, y, z, w, h, d, color, jitter) {
    return this.fill(x, y, z, x + w, y + h, z + d,
      (px, py, pz) => px >= x && px < x + w && py >= y && py < y + h && pz >= z && pz < z + d, color, jitter);
  }

  set(x, y, z, color, jitter = 0.05) {
    const c = new THREE.Color(color);
    if (jitter) {
      const j = 1 + (rand() * 2 - 1) * jitter;
      c.multiplyScalar(j);
    }
    this.cells.set(`${x},${y},${z}`, { x, y, z, c });
    return this;
  }

  box(x, y, z, w, h, d, color, jitter = 0.05) {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++)
        for (let k = 0; k < d; k++) this.set(x + i, y + j, z + k, color, jitter);
    return this;
  }

  // Colour picker per cell: fn(x,y,z) => color | null (null = skip)
  boxFn(x, y, z, w, h, d, fn, jitter = 0.05) {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++)
        for (let k = 0; k < d; k++) {
          const col = fn(x + i, y + j, z + k, i, j, k);
          if (col != null) this.set(x + i, y + j, z + k, col, jitter);
        }
    return this;
  }

  sphere(cx, cy, cz, r, color, jitter = 0.05) {
    const R = Math.ceil(r);
    for (let x = -R; x <= R; x++)
      for (let y = -R; y <= R; y++)
        for (let z = -R; z <= R; z++)
          if (x * x + y * y + z * z <= r * r) this.set(cx + x, cy + y, cz + z, color, jitter);
    return this;
  }

  remove(x, y, z, w = 1, h = 1, d = 1) {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++)
        for (let k = 0; k < d; k++) this.cells.delete(`${x + i},${y + j},${z + k}`);
    return this;
  }

  build({ emissive = false, castShadow = true, receiveShadow = true } = {}) {
    const has = (x, y, z) => this.cells.has(`${x},${y},${z}`);
    const visible = [];
    for (const v of this.cells.values()) {
      const { x, y, z } = v;
      if (has(x + 1, y, z) && has(x - 1, y, z) && has(x, y + 1, z) &&
          has(x, y - 1, z) && has(x, y, z + 1) && has(x, y, z - 1)) continue;
      visible.push(v);
    }
    const mat = emissive
      ? new THREE.MeshBasicMaterial({ color: 0xffffff })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
    const mesh = new THREE.InstancedMesh(unitBox, mat, visible.length);
    visible.forEach((v, i) => {
      const r = this.res;
      tmpMatrix.makeScale(r, r, r).setPosition((v.x + 0.5) * r, (v.y + 0.5) * r, (v.z + 0.5) * r);
      mesh.setMatrixAt(i, tmpMatrix);
      mesh.setColorAt(i, tmpColor.copy(v.c));
    });
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;
    this.add(mesh);
    this.cells.clear();
    return this;
  }
}
