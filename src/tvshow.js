import * as THREE from 'three';

// "Bloopy Babies": an original, aggressively cheerful pixel-art kids' show.
// Drawn at 96x54 to a 2D canvas every frame and shown with nearest filtering.

const W = 96, H = 54;
const PINK = '#ff3fa4', SKY = '#3fd0ff', YEL = '#ffe23f', GRN = '#4cff6a',
  ORA = '#ff8a1f', PUR = '#a64dff', RED = '#ff3b3b', WHITE = '#ffffff', INK = '#1a1030';
const SEG = 3; // seconds per segment

export function createTVShow() {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;

  const avg = new THREE.Color(1, 1, 1);
  let frame = 0;

  // ---------- drawing helpers ----------
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const circle = (x, y, r, c) => {
    ctx.fillStyle = c;
    // pixel-perfect filled circle
    for (let j = -r; j <= r; j++) {
      const half = Math.floor(Math.sqrt(r * r - j * j + r * 0.8));
      ctx.fillRect(Math.round(x - half), Math.round(y + j), half * 2 + 1, 1);
    }
  };
  const text = (s, x, y, size, fill, stroke = INK) => {
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  };
  const googly = (x, y, t, r = 2) => {
    circle(x, y, r, WHITE);
    rect(x + Math.round(Math.sin(t * 9 + x) * (r - 1)) - 0, y + Math.round(Math.cos(t * 7 + y) * (r - 1)), 1 + (r > 2 ? 1 : 0), 1 + (r > 2 ? 1 : 0), INK);
  };
  const note = (x, y, c) => { rect(x, y, 2, 2, c); rect(x + 1, y - 5, 1, 5, c); rect(x + 2, y - 5, 2, 1, c); };
  const star = (x, y, c, s = 1) => { rect(x - s, y, s * 2 + 1, 1, c); rect(x, y - s, 1, s * 2 + 1, c); };

  function logo(t) {
    // watermelon-slice badge + show name, bottom-left, always on screen
    const bob = Math.round(Math.sin(t * 6));
    rect(2, 44 + bob, 13, 1, '#2bb34a');
    for (let i = 0; i < 6; i++) rect(2 + i, 43 - i + bob, 13 - i * 2, 1, i === 0 ? '#9fef7a' : RED);
    rect(6, 41 + bob, 1, 1, INK); rect(9, 42 + bob, 1, 1, INK);
    text('BLOOPY!', 36, 47 + bob, 8, YEL, PINK);
  }

  // ---------- segments ----------
  function babySeg(t) {
    // spinning sunburst
    rect(0, 0, W, H, SKY);
    ctx.save();
    ctx.translate(48, 30);
    ctx.rotate(t * 1.5);
    ctx.fillStyle = '#8fe8ff';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(80, -12); ctx.lineTo(80, 12); ctx.fill();
    }
    ctx.restore();
    const bounce = Math.round(Math.abs(Math.sin(t * 5)) * -3);
    const cx = 48, cy = 28 + bounce;
    circle(cx, cy, 17, '#ffcfa8');
    circle(cx - 17, cy + 1, 3, '#ffbf92'); circle(cx + 17, cy + 1, 3, '#ffbf92'); // ears
    // single curl of hair
    rect(cx - 1, cy - 18, 3, 2, '#c9822b'); rect(cx + 2, cy - 20, 2, 2, '#c9822b'); rect(cx, cy - 21, 2, 1, '#c9822b');
    // huge shiny eyes
    for (const ex of [cx - 7, cx + 7]) {
      circle(ex, cy - 3, 5, WHITE);
      circle(ex + Math.round(Math.sin(t * 3)), cy - 2, 3, '#3a2a8a');
      rect(ex - 1 + Math.round(Math.sin(t * 3)), cy - 4, 2, 2, WHITE);
    }
    // cheeks
    circle(cx - 11, cy + 5, 2, '#ff8fb0'); circle(cx + 11, cy + 5, 2, '#ff8fb0');
    // singing mouth
    const open = 1 + Math.round(Math.abs(Math.sin(t * 11)) * 4);
    rect(cx - 4, cy + 6, 9, open + 1, '#8a1f3a');
    rect(cx - 2, cy + 6 + open - 1, 5, 2, '#ff6f8f');
    rect(cx - 3, cy + 6, 7, 1, WHITE);
    // bouncing music notes
    for (let i = 0; i < 4; i++) {
      const nx = (i % 2 ? 80 : 6) + i * 2, ny = 16 + i * 6 + Math.round(Math.sin(t * 6 + i) * 3);
      note(nx, ny, [PINK, YEL, PUR, ORA][i]);
    }
  }

  function fruitSeg(t) {
    ctx.fillStyle = `hsl(${(t * 220) % 360}, 95%, 62%)`;
    ctx.fillRect(0, 0, W, H);
    rect(0, 40, W, 14, '#2fd65a');
    for (let x = 0; x < W; x += 4) rect(x + ((t * 20) | 0) % 4, 39, 2, 1, '#1fae46');
    const fruits = [
      (x, y) => { // watermelon slice
        for (let i = 0; i < 6; i++) rect(x - 7 + i, y + i, 15 - i * 2, 1, i === 0 ? GRN : RED);
        rect(x - 7, y - 1, 15, 1, '#1f9e3a'); googly(x - 3, y + 2, t); googly(x + 3, y + 2, t);
      },
      (x, y) => { // banana
        for (let i = 0; i < 12; i++) rect(x - 6 + i, y + Math.round(Math.abs(i - 6) ** 2 / 9) - 3, 2, 3, YEL);
        googly(x - 1, y - 2, t); googly(x + 3, y - 2, t);
      },
      (x, y) => { // apple
        circle(x, y, 6, RED); rect(x, y - 9, 1, 3, '#6b3a1a'); rect(x + 1, y - 9, 3, 2, GRN);
        googly(x - 2, y - 1, t); googly(x + 2, y - 1, t); rect(x - 2, y + 3, 5, 1, INK);
      },
      (x, y) => { // orange
        circle(x, y, 5, ORA); rect(x, y - 6, 2, 1, GRN);
        googly(x - 2, y - 1, t); googly(x + 2, y - 1, t); rect(x - 1, y + 2, 3, 1, INK);
      },
    ];
    fruits.forEach((f, i) => {
      const x = 14 + i * 22;
      const y = 34 - Math.round(Math.abs(Math.sin(t * 6 + i * 0.9)) * 18);
      f(x, y);
    });
    text('YUM YUM!', 48, 7 + Math.round(Math.sin(t * 8)), 9, WHITE, PINK);
  }

  function rainbowSeg(t) {
    rect(0, 0, W, H, '#7fe0ff');
    const slide = Math.min(1, t / 0.8);
    const colors = [RED, ORA, YEL, GRN, SKY, PUR];
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W * slide, H); ctx.clip();
    for (let i = 0; i < colors.length; i++) {
      circle(48, 58, 44 - i * 4, colors[i]);
    }
    circle(48, 58, 20, '#7fe0ff');
    ctx.restore();
    // clouds
    for (const [x, y] of [[10 + ((t * 8) % 20), 44], [78 - ((t * 6) % 16), 46]]) {
      circle(x, y, 5, WHITE); circle(x + 6, y + 1, 4, WHITE); circle(x - 6, y + 1, 4, WHITE);
    }
    for (let i = 0; i < 10; i++) {
      if (Math.sin(t * 10 + i * 3) > 0) star((i * 37) % W, (i * 13) % 30 + 2, i % 2 ? YEL : WHITE, 1 + (i % 2));
    }
    const s = 10 + Math.round(Math.abs(Math.sin(t * 7)) * 3);
    text('YAAAY!', 48, 26, s, YEL, PINK);
  }

  function countSeg(t) {
    const off = (t * 30) | 0;
    for (let y = 0; y < H; y += 6) for (let x = 0; x < W; x += 6)
      rect(x, y, 6, 6, (((x + off) / 6 + y / 6) | 0) % 2 ? '#ffd6ec' : '#fff27a');
    const n = Math.min(3, 1 + Math.floor(t));
    const local = t - (n - 1);
    const pop = 18 + Math.round(Math.max(0, 1 - local * 3) * 10);
    text(String(n), 48, 24, pop, [PINK, SKY, GRN][n - 1], INK);
    // n bouncing ducklings
    for (let i = 0; i < n; i++) {
      const x = 48 + (i - (n - 1) / 2) * 16, y = 44 - Math.round(Math.abs(Math.sin(t * 8 + i)) * 3);
      circle(x, y, 4, YEL); circle(x + 3, y - 4, 3, YEL);
      rect(x + 6, y - 4, 2, 1, ORA); rect(x + 4, y - 5, 1, 1, INK);
    }
    // scrolling banner
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, 9); ctx.clip();
    rect(0, 0, W, 9, PUR);
    text('COUNT WITH ME!  COUNT WITH ME!', 96 - ((t * 40) % 150) + 30, 5, 7, WHITE, PUR);
    ctx.restore();
  }

  const segs = [babySeg, fruitSeg, rainbowSeg, countSeg];

  function update(t) {
    const idx = Math.floor(t / SEG) % segs.length;
    const local = t % SEG;
    segs[idx](local);
    if (idx !== 2) logo(t);
    // hard white flash on cuts, like the real thing
    if (local < 0.08) rect(0, 0, W, H, WHITE);
    texture.needsUpdate = true;

    // average colour drives the room-lighting flicker
    if (frame++ % 3 === 0) {
      const d = ctx.getImageData(0, 0, W, H).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 16) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 16;
      avg.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
    }
  }

  return { texture, update, color: avg, canvas };
}
