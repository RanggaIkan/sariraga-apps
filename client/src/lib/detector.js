// client/src/lib/detector.js
// Two interchangeable YOLO11n inference engines with the same output format:
//   server  -> FastAPI AI microservice (VITE_AI_SERVICE_URL), e.g. exposed via Cloudflare Tunnel
//   browser -> onnxruntime-web running the same ONNX model locally (fallback, works on Vercel alone)
// Output: [{ category, confidence, bbox: [x1, y1, x2, y2] }] in source-canvas pixels.
import * as ort from 'onnxruntime-web';

// AI server URL: build-time env, overridable at runtime with ?ai=https://xxx.trycloudflare.com
// (remembered in localStorage; ?ai=off clears it). Quick-tunnel URLs change on restart, so no redeploy needed.
function resolveAiUrl() {
  let url = import.meta.env.VITE_AI_SERVICE_URL || '';
  try {
    const param = new URLSearchParams(window.location.search).get('ai');
    if (param === 'off') localStorage.removeItem('sariraga.aiUrl');
    else if (param) localStorage.setItem('sariraga.aiUrl', param);
    url = localStorage.getItem('sariraga.aiUrl') || url;
  } catch {
    /* storage unavailable: use build-time value */
  }
  return url.replace(/\/$/, '');
}
export const AI_SERVICE_URL = resolveAiUrl();

const BROWSER_MODEL_URL = '/models/sariraga_yolo11n.onnx';
const BROWSER_MODEL_NAME = 'SariRaga YOLO11n (WaRP)';
const BROWSER_CLASSES = ['botol', 'kaleng', 'kardus']; // model idx -> category
const SIZE = 640;

ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;

// ---------- server engine ----------
export async function checkServer() {
  if (!AI_SERVICE_URL) return null;
  try {
    const res = await fetch(`${AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(4000) });
    const json = await res.json();
    return json.status === 'healthy' ? json : null;
  } catch {
    return null;
  }
}

async function detectServer(canvas, conf) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
  const form = new FormData();
  form.append('file', blob, 'frame.jpg');
  const res = await fetch(`${AI_SERVICE_URL}/api/detect?annotated=false&conf=${conf}`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`AI service HTTP ${res.status}`);
  const json = await res.json();
  return { detections: json.detections, inferenceMs: json.inference_ms };
}

// ---------- browser engine ----------
let sessionPromise = null;
function getSession() {
  sessionPromise ??= ort.InferenceSession.create(BROWSER_MODEL_URL, { executionProviders: ['wasm'] }).catch((e) => {
    sessionPromise = null;
    throw e;
  });
  return sessionPromise;
}
export const warmupBrowser = () => getSession();

const prepCanvas = document.createElement('canvas');
prepCanvas.width = prepCanvas.height = SIZE;
const prepCtx = prepCanvas.getContext('2d', { willReadFrequently: true });

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]), y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area = (r) => (r[2] - r[0]) * (r[3] - r[1]);
  return inter / (area(a) + area(b) - inter + 1e-6);
}

async function detectBrowser(canvas, conf) {
  const session = await getSession();
  const { width: w, height: h } = canvas;
  const scale = Math.min(SIZE / w, SIZE / h);
  const nw = Math.round(w * scale), nh = Math.round(h * scale);
  const padX = Math.floor((SIZE - nw) / 2), padY = Math.floor((SIZE - nh) / 2);
  prepCtx.fillStyle = 'rgb(114,114,114)';
  prepCtx.fillRect(0, 0, SIZE, SIZE);
  prepCtx.drawImage(canvas, padX, padY, nw, nh);
  const { data } = prepCtx.getImageData(0, 0, SIZE, SIZE);

  const area = SIZE * SIZE;
  const input = new Float32Array(3 * area);
  for (let i = 0; i < area; i++) {
    input[i] = data[i * 4] / 255;
    input[i + area] = data[i * 4 + 1] / 255;
    input[i + 2 * area] = data[i * 4 + 2] / 255;
  }

  const t0 = performance.now();
  const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
  const inferenceMs = Math.round(performance.now() - t0);
  const o = out[session.outputNames[0]];
  const [, rows, n] = o.dims; // [1, 4 + classes, 8400]
  const d = o.data;

  const cands = [];
  for (let i = 0; i < n; i++) {
    let best = 0, cls = 0;
    for (let c = 4; c < rows; c++) {
      const s = d[c * n + i];
      if (s > best) { best = s; cls = c - 4; }
    }
    if (best < conf) continue;
    const cx = d[i], cy = d[n + i], bw = d[2 * n + i], bh = d[3 * n + i];
    cands.push({
      cls,
      confidence: best,
      bbox: [
        Math.max(0, (cx - bw / 2 - padX) / scale),
        Math.max(0, (cy - bh / 2 - padY) / scale),
        Math.min(w, (cx + bw / 2 - padX) / scale),
        Math.min(h, (cy + bh / 2 - padY) / scale),
      ],
    });
  }
  cands.sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  for (const c of cands) {
    if (kept.every((k) => k.cls !== c.cls || iou(k.bbox, c.bbox) < 0.45)) kept.push(c);
    if (kept.length >= 50) break;
  }
  return {
    inferenceMs,
    detections: kept.map((k) => ({
      category: BROWSER_CLASSES[k.cls],
      confidence: Math.round(k.confidence * 1000) / 1000,
      bbox: k.bbox.map(Math.round),
    })),
  };
}

// ---------- public API ----------
export async function detect(engine, canvas, conf = 0.25) {
  return engine === 'server' ? detectServer(canvas, conf) : detectBrowser(canvas, conf);
}

export function engineModelName(engine, serverHealth) {
  return engine === 'server' ? serverHealth?.model || 'server' : BROWSER_MODEL_NAME;
}
