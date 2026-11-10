// MediaRecorder writes files that are meant for live streaming, not for upload:
//  - MP4 comes out "fragmented": the header (moov) says the duration is 0 and the
//    real sample index is spread over hundreds of little moof boxes.
//  - WebM has no Duration in its Segment Info at all.
// Sites like Facebook read the header, see ~0s and treat the video as ~1 second long.
// These helpers rewrite the file so the header carries the real duration.
// No DOM use here, so it can be tested from Node.

const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u64 = (b, o) => u32(b, o) * 2 ** 32 + u32(b, o + 4);
const i32 = (b, o) => u32(b, o) | 0;
const type = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

function boxes(b, start, end) {
  const out = [];
  for (let o = start; o + 8 <= end; ) {
    let size = u32(b, o);
    let hdr = 8;
    if (size === 1) { size = u64(b, o + 8); hdr = 16; } else if (size === 0) size = end - o;
    if (size < hdr || o + size > end) break; // truncated tail: stop here
    out.push({ type: type(b, o + 4), start: o, end: o + size, body: o + hdr });
    o += size;
  }
  return out;
}
const child = (b, box, t) => boxes(b, box.body, box.end).find((c) => c.type === t);
const children = (b, box, t) => boxes(b, box.body, box.end).filter((c) => c.type === t);

// ---------- small writer ----------
class W {
  constructor() { this.a = []; }
  u8(v) { this.a.push(v & 255); return this; }
  u16(v) { return this.u8(v >>> 8).u8(v); }
  u32(v) { return this.u8(v >>> 24).u8(v >>> 16).u8(v >>> 8).u8(v); }
  u64(v) { return this.u32(Math.floor(v / 2 ** 32)).u32(v >>> 0); }
  bytes(x) { for (let i = 0; i < x.length; i++) this.a.push(x[i]); return this; }
  get out() { return Uint8Array.from(this.a); }
}
function box(t, ...parts) {
  const len = 8 + parts.reduce((n, p) => n + p.length, 0);
  const w = new W().u32(len);
  for (let i = 0; i < 4; i++) w.u8(t.charCodeAt(i));
  parts.forEach((p) => w.bytes(p));
  return w.out;
}
const full = (t, version, flags, body) => box(t, new W().u8(version).u8(flags >>> 16).u16(flags).out, body);

// Copy a mvhd/mdhd/tkhd box with its duration field replaced.
function withDuration(b, bx, duration) {
  const copy = b.slice(bx.start, bx.end);
  const v = b[bx.body];
  const isTkhd = bx.type === 'tkhd';
  // full-box header (4) + creation + modification [+ track_id + reserved | timescale]
  const off = bx.body - bx.start + 4 + (v === 1 ? 16 : 8) + (isTkhd ? 8 : 4);
  const dv = new DataView(copy.buffer);
  if (v === 1) { dv.setUint32(off, Math.floor(duration / 2 ** 32)); dv.setUint32(off + 4, duration >>> 0); }
  else dv.setUint32(off, Math.min(duration, 0xffffffff));
  return copy;
}
const timescaleOf = (b, bx) => u32(b, bx.body + 4 + (b[bx.body] === 1 ? 16 : 8));

// Rebuild a fragmented MP4 as a plain one with the index up front.
// Returns null when the file is not fragmented (nothing to do), otherwise
// { head: Uint8Array, chunks: [[start, end], ...] } where the output file is
// head followed by those byte ranges of the input, in order.
export function defragmentMp4(b) {
  const top = boxes(b, 0, b.length);
  const ftyp = top.find((x) => x.type === 'ftyp');
  const moov = top.find((x) => x.type === 'moov');
  if (!ftyp || !moov || !top.some((x) => x.type === 'moof')) return null;

  const mvex = child(b, moov, 'mvex');
  const trex = {};
  for (const t of mvex ? children(b, mvex, 'trex') : []) {
    const o = t.body + 4;
    trex[u32(b, o)] = { dur: u32(b, o + 8), size: u32(b, o + 12), flags: u32(b, o + 16) };
  }
  const tracks = {};
  for (const trak of children(b, moov, 'trak')) {
    const tkhd = child(b, trak, 'tkhd');
    const id = u32(b, tkhd.body + 4 + (b[tkhd.body] === 1 ? 16 : 8));
    tracks[id] = { trak, samples: [], chunks: [], hasCts: false, allSync: true, dts: null };
  }

  const chunks = []; // [start, end] of each trun's data, in file order
  for (const moof of top.filter((x) => x.type === 'moof')) {
    for (const traf of children(b, moof, 'traf')) {
      const tfhd = child(b, traf, 'tfhd');
      const fl = u32(b, tfhd.body) & 0xffffff;
      let o = tfhd.body + 4;
      const id = u32(b, o); o += 4;
      const tr = tracks[id];
      const d = trex[id] || { dur: 0, size: 0, flags: 0 };
      let base = moof.start;
      if (fl & 0x1) { base = u64(b, o); o += 8; }
      if (fl & 0x2) o += 4;
      let defDur = d.dur, defSize = d.size, defFlags = d.flags;
      if (fl & 0x8) { defDur = u32(b, o); o += 4; }
      if (fl & 0x10) { defSize = u32(b, o); o += 4; }
      if (fl & 0x20) { defFlags = u32(b, o); o += 4; }
      if (!tr) continue;
      // The fragment's start time is the truth; trun durations can drift from it.
      // Stretch/shrink the previous sample so the next one lands where tfdt says.
      const tfdt = child(b, traf, 'tfdt');
      if (tfdt) {
        const t0 = b[tfdt.body] === 1 ? u64(b, tfdt.body + 4) : u32(b, tfdt.body + 4);
        const prev = tr.samples[tr.samples.length - 1];
        if (prev && tr.dts !== null && t0 > tr.dts - prev.dur) prev.dur = t0 - (tr.dts - prev.dur);
        tr.dts = t0;
      } else if (tr.dts === null) tr.dts = 0;
      let next = base; // data with no data-offset follows the previous run
      for (const trun of children(b, traf, 'trun')) {
        const v = b[trun.body];
        const tf = u32(b, trun.body) & 0xffffff;
        let p = trun.body + 4;
        const n = u32(b, p); p += 4;
        let pos = next;
        if (tf & 0x1) { pos = base + i32(b, p); p += 4; }
        let firstFlags = null;
        if (tf & 0x4) { firstFlags = u32(b, p); p += 4; }
        const runStart = pos;
        for (let i = 0; i < n; i++) {
          const dur = tf & 0x100 ? u32(b, (p += 4) - 4) : defDur;
          const size = tf & 0x200 ? u32(b, (p += 4) - 4) : defSize;
          let flags = tf & 0x400 ? u32(b, (p += 4) - 4) : defFlags;
          let cts = 0;
          if (tf & 0x800) { cts = v === 1 ? i32(b, p) : u32(b, p); p += 4; }
          if (i === 0 && firstFlags !== null) flags = firstFlags;
          const sync = !(flags & 0x10000);
          if (!sync) tr.allSync = false;
          if (cts) tr.hasCts = true;
          tr.samples.push({ dur, size, cts, sync });
          tr.dts += dur;
          pos += size;
        }
        next = pos;
        if (n && pos <= b.length) {
          tr.chunks.push({ index: chunks.length, count: n });
          chunks.push([runStart, pos]);
        } else if (n) { // run points past the end of the file: drop it
          tr.dts -= tr.samples.splice(-n).reduce((t, x) => t + x.dur, 0);
        }
      }
    }
  }

  const mvhd = child(b, moov, 'mvhd');
  const movieScale = timescaleOf(b, mvhd);
  const dataSize = chunks.reduce((n, [s, e]) => n + (e - s), 0);
  const big = dataSize > 0xffffffff - 1e6;

  const build = (chunkOffsets) => {
    let movieDur = 0;
    const traks = [];
    for (const tr of Object.values(tracks)) {
      const mdia = child(b, tr.trak, 'mdia');
      const mdhd = child(b, mdia, 'mdhd');
      const minf = child(b, mdia, 'minf');
      const stbl = child(b, minf, 'stbl');
      const mediaScale = timescaleOf(b, mdhd);
      const s = tr.samples;
      const mediaDur = s.reduce((n, x) => n + x.dur, 0);
      const trackDur = Math.round((mediaDur * movieScale) / mediaScale);
      movieDur = Math.max(movieDur, trackDur);

      const runs = (vals) => { // run-length [count, value]
        const r = [];
        for (const v of vals) r.length && r[r.length - 1][1] === v ? r[r.length - 1][0]++ : r.push([1, v]);
        return r;
      };
      const stts = runs(s.map((x) => x.dur));
      const sttsW = new W().u32(stts.length);
      stts.forEach(([c, v]) => sttsW.u32(c).u32(v));
      const parts = [child(b, stbl, 'stsd') && b.slice(child(b, stbl, 'stsd').start, child(b, stbl, 'stsd').end), full('stts', 0, 0, sttsW.out)];
      if (tr.hasCts) {
        const ctts = runs(s.map((x) => x.cts));
        const w = new W().u32(ctts.length);
        ctts.forEach(([c, v]) => w.u32(c).u32(v));
        parts.push(full('ctts', 1, 0, w.out));
      }
      if (!tr.allSync) {
        const keys = s.map((x, i) => (x.sync ? i + 1 : 0)).filter(Boolean);
        const w = new W().u32(keys.length);
        keys.forEach((k) => w.u32(k));
        parts.push(full('stss', 0, 0, w.out));
      }
      const stscRuns = [];
      tr.chunks.forEach((c, i) => {
        if (!stscRuns.length || stscRuns[stscRuns.length - 1][1] !== c.count) stscRuns.push([i + 1, c.count]);
      });
      const stsc = new W().u32(stscRuns.length);
      stscRuns.forEach(([first, n]) => stsc.u32(first).u32(n).u32(1));
      parts.push(full('stsc', 0, 0, stsc.out));
      const stsz = new W().u32(0).u32(s.length);
      s.forEach((x) => stsz.u32(x.size));
      parts.push(full('stsz', 0, 0, stsz.out));
      const co = new W().u32(tr.chunks.length);
      tr.chunks.forEach((c) => (big ? co.u64(chunkOffsets[c.index]) : co.u32(chunkOffsets[c.index])));
      parts.push(full(big ? 'co64' : 'stco', 0, 0, co.out));

      const copy = (bx) => b.slice(bx.start, bx.end);
      const minfParts = boxes(b, minf.body, minf.end).map((x) => (x.type === 'stbl' ? box('stbl', ...parts.filter(Boolean)) : copy(x)));
      const mdiaParts = boxes(b, mdia.body, mdia.end).map((x) =>
        x.type === 'mdhd' ? withDuration(b, x, mediaDur) : x.type === 'minf' ? box('minf', ...minfParts) : copy(x));
      const trakParts = boxes(b, tr.trak.body, tr.trak.end)
        .filter((x) => x.type !== 'edts') // edit lists from the recorder carry a zero duration too
        .map((x) => (x.type === 'tkhd' ? withDuration(b, x, trackDur) : x.type === 'mdia' ? box('mdia', ...mdiaParts) : copy(x)));
      traks.push(box('trak', ...trakParts));
    }
    const moovParts = [];
    for (const x of boxes(b, moov.body, moov.end)) {
      if (x.type === 'mvhd') moovParts.push(withDuration(b, x, movieDur));
      else if (x.type === 'trak') { if (traks.length) moovParts.push(...traks.splice(0)); }
      else if (x.type !== 'mvex') moovParts.push(b.slice(x.start, x.end));
    }
    return box('moov', ...moovParts);
  };

  // Lay out: ftyp, moov, mdat. The moov size doesn't depend on the offset values,
  // so build once to measure, then again with the real offsets.
  const ftypBytes = b.slice(ftyp.start, ftyp.end);
  const mdatHdr = big ? 16 : 8;
  const measure = build(chunks.map(() => 0));
  let at = ftypBytes.length + measure.length + mdatHdr;
  const offsets = chunks.map(([s, e]) => ((at += e - s), at - (e - s)));
  const moovBytes = build(offsets);
  const hdr = big
    ? new W().u32(1).bytes([109, 100, 97, 116]).u64(dataSize + 16).out
    : new W().u32(dataSize + 8).bytes([109, 100, 97, 116]).out;
  const head = new Uint8Array(ftypBytes.length + moovBytes.length + hdr.length);
  head.set(ftypBytes, 0);
  head.set(moovBytes, ftypBytes.length);
  head.set(hdr, ftypBytes.length + moovBytes.length);
  return { head, chunks };
}

// ---------- WebM ----------
function readVint(b, o, keepMarker) {
  const first = b[o];
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  let v = keepMarker ? first : first & (0xff >> len);
  for (let i = 1; i < len; i++) v = v * 256 + b[o + i];
  const unknown = !keepMarker && v === 2 ** (7 * len) - 1;
  return { v, len, unknown };
}
const sizeVint8 = (n) => new W().u8(0x01).u8(Math.floor(n / 2 ** 48)).u16(Math.floor(n / 2 ** 32) & 0xffff).u32(n >>> 0).out;

// Put a Duration (in ms of real time) into a MediaRecorder WebM's Segment Info.
// Returns null if the file isn't laid out as expected, otherwise
// { head: Uint8Array, rest: number } where the output is head + input.slice(rest).
export function addWebmDuration(b, durationMs) {
  let o = 0;
  const el = (at) => {
    const id = readVint(b, at, true);
    const sz = readVint(b, at + id.len);
    return { id: id.v, data: at + id.len + sz.len, size: sz.unknown ? Infinity : sz.v, sizeAt: at + id.len, sizeLen: sz.len };
  };
  const ebml = el(o);
  if (ebml.id !== 0x1a45dfa3) return null;
  o = ebml.data + ebml.size;
  const seg = el(o);
  if (seg.id !== 0x18538067) return null;
  for (let p = seg.data; p < Math.min(b.length, seg.data + 4096); ) {
    const e = el(p);
    if (e.id === 0x1549a966 && e.size !== Infinity) {
      let scale = 1e6;
      const kept = [];
      for (let q = e.data; q < e.data + e.size; ) {
        const c = el(q);
        const end = c.data + c.size;
        if (c.id === 0x2ad7b1) { scale = 0; for (let i = c.data; i < end; i++) scale = scale * 256 + b[i]; }
        if (c.id !== 0x4489) kept.push(b.subarray(q, end)); // replace any existing Duration
        q = end;
      }
      const dur = new Uint8Array(11);
      dur.set([0x44, 0x89, 0x88]);
      new DataView(dur.buffer).setFloat64(3, (durationMs * 1e6) / scale);
      const body = [...kept, dur];
      const bodyLen = body.reduce((n, x) => n + x.length, 0);
      const info = new W().u32(0x1549a966).bytes(sizeVint8(bodyLen));
      body.forEach((x) => info.bytes(x));
      const infoBytes = info.out;
      const growth = infoBytes.length - (e.data + e.size - p);
      // Segment header, with its size grown if it was a known size
      const segHead = b.slice(o, seg.data);
      if (seg.size !== Infinity) { // MediaRecorder leaves this unknown; only patch the easy case
        if (seg.sizeLen !== 8) return null;
        segHead.set(sizeVint8(seg.size + growth), seg.sizeAt - o);
      }
      const before = b.subarray(0, o);
      const between = b.subarray(seg.data, p);
      const head = new Uint8Array(before.length + segHead.length + between.length + infoBytes.length);
      let at = 0;
      for (const x of [before, segHead, between, infoBytes]) { head.set(x, at); at += x.length; }
      return { head, rest: e.data + e.size };
    }
    if (e.size === Infinity || e.id === 0x1f43b675) break; // reached the first Cluster
    p = e.data + e.size;
  }
  return null;
}
