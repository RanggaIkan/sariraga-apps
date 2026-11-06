// client/src/components/CommandCenter.jsx — Smart Stream Command Center
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Cctv, Image, Pause, Play, Save, ScanLine, Upload, Video } from 'lucide-react';
import { CATEGORIES, valuate } from '../../api/_lib/categories.js';
import { detect, engineModelName, AI_SERVICE_URL } from '../lib/detector.js';
import { formatIdr, postLog } from '../lib/api.js';
import { SAMPLES } from '../lib/samples.js';

const SOURCES = [
  { id: 'simulasi', label: 'Simulasi Konveyor', icon: Video },
  { id: 'webcam', label: 'Webcam', icon: Camera },
  { id: 'upload', label: 'Upload / Sampel', icon: Upload },
  { id: 'cctv', label: 'CCTV Server', icon: Cctv },
];
const MAX_W = 800;
const AUTO_LOG_MS = 5000;

// ---- conveyor simulation: sample photos travel across a belt rendered on a canvas ----
function useConveyorImages() {
  const [imgs, setImgs] = useState([]);
  useEffect(() => {
    let alive = true;
    Promise.all(
      SAMPLES.filter((s) => s.conveyor).map(
        (s) => new Promise((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = s.src;
        })
      )
    ).then((list) => alive && setImgs(list.filter(Boolean)));
    return () => { alive = false; };
  }, []);
  return imgs;
}

// Simulated top-down conveyor camera: a strip of real waste-pile photos scrolls under the camera.
function drawConveyor(ctx, imgs, t) {
  const W = 800, H = 450;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, W, H);
  if (!imgs.length) return;
  const widths = imgs.map((img) => Math.round((img.width / img.height) * H));
  const total = widths.reduce((a, b) => a + b, 0);
  let x = -((t * 0.05) % total);
  for (let pass = 0; pass < 2 && x < W; pass++) {
    imgs.forEach((img, i) => {
      if (x < W && x + widths[i] > 0) ctx.drawImage(img, x, 0, widths[i], H);
      x += widths[i];
    });
  }
}

function drawDetections(ctx, detections) {
  ctx.lineWidth = 3;
  ctx.font = '600 14px Inter, system-ui, sans-serif';
  for (const d of detections) {
    const cat = CATEGORIES[d.category];
    const [x1, y1, x2, y2] = d.bbox;
    ctx.strokeStyle = cat.color;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    const text = `${cat.label} ${(d.confidence * 100).toFixed(0)}%`;
    const tw = ctx.measureText(text).width + 10;
    const ty = Math.max(y1, 22);
    ctx.fillStyle = cat.color;
    ctx.fillRect(x1, ty - 22, tw, 22);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x1 + 5, ty - 6);
  }
}

export default function CommandCenter({ engine, setEngine, serverHealth, onLogged }) {
  const [source, setSource] = useState('simulasi');
  const [running, setRunning] = useState(true);
  const [conf, setConf] = useState(0.25);
  const [autoLog, setAutoLog] = useState(false);
  const [detections, setDetections] = useState([]);
  const [perf, setPerf] = useState({ fps: 0, ms: 0 });
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState({ logs: 0, items: 0, value: 0 });
  const [hasStill, setHasStill] = useState(false);

  const displayRef = useRef(null);
  const frameRef = useRef(document.createElement('canvas'));
  const videoRef = useRef(null);
  const stillRef = useRef(null); // last uploaded/sample image
  const lastLogRef = useRef(0);
  const stateRef = useRef({});
  const conveyorImgs = useConveyorImages();
  stateRef.current = { engine, conf, autoLog, running, source, conveyorImgs, perfMs: perf.ms };

  const showToast = (msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  };

  // Render analysed frame + boxes onto the visible canvas.
  const paint = useCallback((dets) => {
    const frame = frameRef.current, disp = displayRef.current;
    if (!disp || !frame.width) return;
    disp.width = frame.width;
    disp.height = frame.height;
    const ctx = disp.getContext('2d');
    ctx.drawImage(frame, 0, 0);
    drawDetections(ctx, dets);
  }, []);

  const saveLog = useCallback(async (dets, src) => {
    if (!dets.length) return showToast('Belum ada objek terdeteksi untuk dicatat', 'warn');
    setSaving(true);
    try {
      const disp = displayRef.current;
      const thumb = document.createElement('canvas');
      const s = 320 / disp.width;
      thumb.width = 320;
      thumb.height = Math.round(disp.height * s);
      thumb.getContext('2d').drawImage(disp, 0, 0, thumb.width, thumb.height);
      const { engine: eng } = stateRef.current;
      const row = await postLog({
        source: src,
        engine: eng,
        model: engineModelName(eng, serverHealth),
        inference_ms: stateRef.current.perfMs,
        items: dets,
        snapshot: thumb.toDataURL('image/jpeg', 0.7),
      });
      setSession((p) => ({ logs: p.logs + 1, items: p.items + row.total_items, value: p.value + row.total_value_idr }));
      showToast(`Tercatat: ${row.total_items} item • ${formatIdr(row.total_value_idr)} • +${row.points} poin`);
      onLogged?.();
    } catch (e) {
      showToast(`Gagal mencatat: ${e.message}`, 'err');
    } finally {
      setSaving(false);
    }
  }, [onLogged, serverHealth]);
  const saveLogRef = useRef(saveLog);
  saveLogRef.current = saveLog;

  // Live loop for simulation / webcam: grab frame -> detect -> paint (sequential, adapts to latency).
  useEffect(() => {
    if (source !== 'simulasi' && source !== 'webcam') return;
    let stop = false;
    let stream = null;
    const frame = frameRef.current;
    const fctx = frame.getContext('2d', { willReadFrequently: true });
    setDetections([]);
    setError('');

    async function setupWebcam() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } catch (e) {
        setError(`Webcam tidak dapat diakses: ${e.message}`);
        stop = true;
      }
    }

    async function loop() {
      if (source === 'webcam') await setupWebcam();
      let lastT = performance.now();
      while (!stop) {
        const st = stateRef.current;
        if (!st.running) { await new Promise((r) => setTimeout(r, 150)); continue; }
        if (source === 'simulasi') {
          frame.width = 800; frame.height = 450;
          drawConveyor(fctx, st.conveyorImgs, performance.now());
        } else {
          const v = videoRef.current;
          if (!v?.videoWidth) { await new Promise((r) => setTimeout(r, 100)); continue; }
          const s = Math.min(1, MAX_W / v.videoWidth);
          frame.width = Math.round(v.videoWidth * s);
          frame.height = Math.round(v.videoHeight * s);
          fctx.drawImage(v, 0, 0, frame.width, frame.height);
        }
        try {
          const { detections: dets, inferenceMs } = await detect(st.engine, frame, st.conf);
          if (stop) break;
          const now = performance.now();
          setPerf({ fps: Math.round(1000 / (now - lastT)), ms: Math.round(inferenceMs) });
          lastT = now;
          setDetections(dets);
          setError('');
          paint(dets);
          if (st.autoLog && dets.length && now - lastLogRef.current > AUTO_LOG_MS) {
            lastLogRef.current = now;
            saveLogRef.current(dets, source);
          }
        } catch (e) {
          setError(`Inferensi gagal (${st.engine}): ${e.message}`);
          await new Promise((r) => setTimeout(r, 1000));
        }
        await new Promise((r) => requestAnimationFrame(r));
      }
    }
    loop();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [source, paint]);

  // Single image (upload or sample): detect once and log automatically.
  const runStill = useCallback(async (img, autoSave = true) => {
    stillRef.current = img;
    setHasStill(true);
    const frame = frameRef.current;
    const s = Math.min(1, MAX_W / img.naturalWidth);
    frame.width = Math.round(img.naturalWidth * s);
    frame.height = Math.round(img.naturalHeight * s);
    frame.getContext('2d').drawImage(img, 0, 0, frame.width, frame.height);
    setError('');
    try {
      const t0 = performance.now();
      const { detections: dets, inferenceMs } = await detect(stateRef.current.engine, frame, stateRef.current.conf);
      setPerf({ fps: 0, ms: Math.round(inferenceMs ?? performance.now() - t0) });
      setDetections(dets);
      paint(dets);
      if (autoSave && dets.length) await saveLog(dets, 'upload');
    } catch (e) {
      setError(`Inferensi gagal: ${e.message}`);
    }
  }, [paint, saveLog]);

  const loadStill = (src) => {
    const img = new window.Image();
    img.onload = () => runStill(img);
    img.src = src;
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (file) loadStill(URL.createObjectURL(file));
    e.target.value = '';
  };

  // Re-run still image when engine / threshold changes (without logging again).
  useEffect(() => {
    if (source === 'upload' && stillRef.current) runStill(stillRef.current, false);
  }, [engine, conf]); // eslint-disable-line react-hooks/exhaustive-deps

  const frameVal = valuate(detections);
  const counts = detections.reduce((acc, d) => ({ ...acc, [d.category]: (acc[d.category] || 0) + 1 }), {});
  const live = source === 'simulasi' || source === 'webcam';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <section className="xl:col-span-2 card p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-emerald-400" /> Smart Stream Command Center
            </h2>
            <p className="text-xs text-slate-400">Deteksi & klasifikasi sampah real-time dengan YOLO11n (model tim SariRaga)</p>
          </div>
          {live && (
            <button onClick={() => setRunning((r) => !r)} className="btn-secondary">
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? 'Jeda' : 'Lanjut'}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {SOURCES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setSource(id); setDetections([]); stillRef.current = null; setHasStill(false); }}
              disabled={id === 'cctv' && !serverHealth}
              title={id === 'cctv' && !serverHealth ? 'Butuh AI server (FastAPI) online' : ''}
              className={`tab ${source === id ? 'tab-active' : ''}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        <div className="relative rounded-lg bg-slate-950 border border-slate-800 overflow-hidden aspect-video flex items-center justify-center">
          {source === 'cctv' ? (
            <img src={`${AI_SERVICE_URL}/video_feed`} alt="CCTV stream teranotasi dari AI server" className="w-full h-full object-contain" />
          ) : (
            <canvas ref={displayRef} className="w-full h-full object-contain" />
          )}
          <video ref={videoRef} className="hidden" playsInline muted />
          {source === 'upload' && !hasStill && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 p-6 text-center">
              <Image className="h-10 w-10" />
              <p className="text-sm">Unggah foto sampah atau pilih gambar sampel di bawah</p>
            </div>
          )}
          {live && (
            <div className="absolute top-3 left-3 flex gap-2 text-[11px] font-mono">
              <span className="chip bg-black/60">{engine === 'server' ? 'FastAPI' : 'Browser'} • {perf.ms} ms</span>
              <span className="chip bg-black/60">{perf.fps} FPS</span>
              <span className="chip bg-red-600/80 flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />LIVE</span>
            </div>
          )}
          {error && <div className="absolute bottom-3 inset-x-3 text-xs bg-red-950/90 border border-red-800 text-red-200 rounded-md px-3 py-2">{error}</div>}
        </div>

        {source === 'upload' && (
          <div className="space-y-3">
            <label className="btn-primary w-fit cursor-pointer">
              <Upload className="h-4 w-4" /> Unggah Foto Sampah
              <input type="file" accept="image/*" onChange={onFile} className="hidden" />
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {SAMPLES.map((s) => (
                <button key={s.src} onClick={() => loadStill(s.src)} className="rounded-md overflow-hidden border border-slate-800 hover:border-emerald-500 transition aspect-square" title={s.caption}>
                  <img src={s.src} alt={s.caption} className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500">Gambar sampel: Wikimedia Commons (lisensi CC, lihat README). Hasil upload otomatis dicatat ke log.</p>
          </div>
        )}
        {source === 'cctv' && (
          <p className="text-xs text-slate-400">Stream MJPEG dari kamera yang terpasang di mesin AI server, dianotasi langsung oleh FastAPI + OpenCV.</p>
        )}
      </section>

      <aside className="flex flex-col gap-6">
        <section className="card p-4 sm:p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Mesin AI</h3>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setEngine('server')} disabled={!serverHealth} className={`tab justify-center ${engine === 'server' ? 'tab-active' : ''}`}>
              Server (FastAPI)
            </button>
            <button onClick={() => setEngine('browser')} className={`tab justify-center ${engine === 'browser' ? 'tab-active' : ''}`}>
              Browser (ONNX)
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Model: {engineModelName(engine, serverHealth)}
            {!serverHealth && ' — AI server offline, inferensi berjalan di browser.'}
          </p>
          <label className="block text-xs text-slate-300">
            Ambang kepercayaan: <span className="font-mono text-emerald-400">{Math.round(conf * 100)}%</span>
            <input type="range" min="0.1" max="0.8" step="0.05" value={conf} onChange={(e) => setConf(Number(e.target.value))} className="w-full accent-emerald-500 mt-1" />
          </label>
        </section>

        <section className="card p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Deteksi Frame Ini</h3>
            <span className="text-xs text-slate-400">{detections.length} objek</span>
          </div>
          <ul className="space-y-1.5">
            {Object.entries(counts).map(([cat, n]) => (
              <li key={cat} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-slate-200">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORIES[cat].color }} />
                  {CATEGORIES[cat].label}
                </span>
                <span className="font-mono text-slate-300">×{n}</span>
              </li>
            ))}
            {!detections.length && <li className="text-xs text-slate-500">Belum ada objek di atas ambang kepercayaan.</li>}
          </ul>
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
            <p className="text-[11px] uppercase tracking-wide text-emerald-300">Estimasi Waste-to-Wealth</p>
            <p className="text-xl font-bold text-emerald-400">{formatIdr(frameVal.total_value_idr)}</p>
            <p className="text-xs text-slate-400">{frameVal.total_weight_kg} kg • {frameVal.points} poin</p>
          </div>
          <button onClick={() => saveLog(detections, source)} disabled={saving || !detections.length || source === 'cctv'} className="btn-primary w-full justify-center">
            <Save className="h-4 w-4" /> {saving ? 'Menyimpan…' : 'Catat ke Log'}
          </button>
          {live && (
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={autoLog} onChange={(e) => setAutoLog(e.target.checked)} className="accent-emerald-500" />
              Auto-catat tiap {AUTO_LOG_MS / 1000} detik saat ada objek
            </label>
          )}
        </section>

        <section className="card p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Sesi Ini</h3>
          <div className="grid grid-cols-3 text-center">
            <div><p className="text-lg font-bold text-white">{session.logs}</p><p className="text-[11px] text-slate-500">log</p></div>
            <div><p className="text-lg font-bold text-white">{session.items}</p><p className="text-[11px] text-slate-500">item</p></div>
            <div><p className="text-lg font-bold text-emerald-400">{formatIdr(session.value)}</p><p className="text-[11px] text-slate-500">nilai</p></div>
          </div>
        </section>
      </aside>

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg border ${
          toast.kind === 'err' ? 'bg-red-950 border-red-800 text-red-100' : toast.kind === 'warn' ? 'bg-amber-950 border-amber-800 text-amber-100' : 'bg-emerald-950 border-emerald-700 text-emerald-100'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
