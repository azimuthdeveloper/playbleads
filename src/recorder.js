// Records the WebGL canvas to a video file using MediaRecorder.
import { defragmentMp4, addWebmDuration } from './fixduration.js';

// MediaRecorder's files report a ~0s duration in their header (Facebook then shows
// the video as about a second long). Rewrite them so the header has the real length.
async function withDuration(blob, ms) {
  try {
    const b = new Uint8Array(await blob.arrayBuffer());
    if (blob.type.includes('mp4')) {
      const r = defragmentMp4(b);
      if (r) return new Blob([r.head, ...r.chunks.map(([s, e]) => blob.slice(s, e))], { type: 'video/mp4' });
    } else {
      const r = addWebmDuration(b, ms);
      if (r) return new Blob([r.head, blob.slice(r.rest)], { type: 'video/webm' });
    }
    console.warn('Could not fix the video duration header; saving the file as recorded.');
  } catch (err) {
    console.warn('Could not fix the video duration header; saving the file as recorded.', err);
  }
  return blob;
}
export function pickMime({ preferMp4 = false } = {}) {
  const mp4 = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4'];
  const types = [
    ...(preferMp4 ? mp4 : []),
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}

export function startRecording(canvas, filename, { fps = 60, preferMp4 = false } = {}) {
  const mimeType = pickMime({ preferMp4 });
  if (preferMp4 && !mimeType.includes('mp4')) console.warn('This browser cannot record MP4; saving WebM (convert it before posting to Instagram).');
  const stream = canvas.captureStream(fps);
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 24_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((resolve) => {
    rec.onstop = async () => {
      const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
      const blob = await withDuration(new Blob(chunks, { type: mimeType || 'video/webm' }), performance.now() - startedAt);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      stream.getTracks().forEach((tr) => tr.stop());
      resolve(blob);
    };
  });
  let startedAt = performance.now();
  rec.onstart = () => (startedAt = performance.now());
  rec.start(250);
  return { stop: () => rec.state !== 'inactive' && rec.stop(), done };
}
