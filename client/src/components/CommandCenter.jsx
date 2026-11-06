// client/src/components/CommandCenter.jsx: Smart Stream Command Center
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Cctv, ImageUp, Pause, Play, Save, Upload, Video } from 'lucide-react';
import { CATEGORIES, valuate } from '../../api/_lib/categories.js';
import { detect, engineModelName, AI_SERVICE_URL, browserBackend } from '../lib/detector.js';
import { formatIdr, postLog } from '../lib/api.js';
import { SAMPLES } from '../lib/samples.js';
import { CAT_STYLE } from '../lib/categoryStyle.js';

const SOURCES = [
  { id: 'simulasi', label: 'Konveyor', icon: Video },
  { id: 'webcam', label: 'Webcam', icon: Camera },
  { id: 'upload', label: 'Foto', icon: Upload },
  { id: 'cctv', label: 'CCTV', icon: Cctv },
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
  ctx.fillStyle = '#17201C';
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
  ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
  for (const d of detections) {
    const cat = CATEGORIES[d.category];
    const [x1, y1, x2, y2] = d.bbox;
    ctx.strokeStyle = cat.color;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    const text = `${cat.label} ${(d.confidence * 100).toFixed(0)}%`;
    const tw = ctx.measureText(text).width + 12;
    const ty = Math.max(y1, 24);
    ctx.fillStyle = cat.color;
    ctx.fillRect(x1, ty - 24, tw, 24);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, x1 + 6, ty - 7);
  }
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

export default function CommandCenter({ engine, setEngine, serverHealth, checking, browserReady, onLogged }) {
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
      showToast(`Dicatat ke log: ${row.total_items} item, ${formatIdr(row.total_value_idr)}, +${row.points} poin`);
      onLogged?.();
    } catch (e) {
      showToast(`Gagal mencatat ke log: ${e.message}`, 'err');
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
        setError(`Webcam tidak bisa dibuka: ${e.message}. Izinkan akses kamera di browser lalu pilih Webcam lagi.`);
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
          setError(`Deteksi gagal di mesin ${st.engine}: ${e.message}`);
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
      setError(`Deteksi gagal: ${e.message}`);
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

  let engineNote;
  if (checking) engineNote = 'Mencari server AI.';
  else if (engine === 'server') engineNote = `Memakai server AI dengan model ${engineModelName('server', serverHealth)}.`;
  else if (browserReady === null) engineNote = 'Model sedang dimuat di browser ini.';
  else if (browserReady === false) engineNote = 'Model browser gagal dimuat. Muat ulang halaman untuk mencoba lagi.';
  else engineNote = serverHealth
    ? `Deteksi berjalan di browser ini dengan model ${engineModelName('browser')}.`
    : `Server AI tidak terhubung, jadi deteksi berjalan di browser ini dengan model ${engineModelName('browser')}.`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-[34px]">Command Center</h1>
          <p className="muted mt-1 max-w-xl">Arahkan kamera ke tumpukan sampah. SariRaga mengenali botol, kaleng, dan kardus, lalu menghitung nilai jualnya.</p>
        </div>
        <div className="seg max-w-full overflow-x-auto" role="tablist" aria-label="Sumber gambar">
          {SOURCES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={source === id}
              onClick={() => { setSource(id); setDetections([]); stillRef.current = null; setHasStill(false); }}
              disabled={id === 'cctv' && !serverHealth}
              title={id === 'cctv' && !serverHealth ? 'CCTV butuh server AI yang terhubung' : undefined}
              className={`seg-item ${source === id ? 'seg-item-active' : ''}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="card p-3 sm:p-4 xl:col-span-8 xl:self-start">
          <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-ink">
            {source === 'cctv' ? (
              <img src={`${AI_SERVICE_URL}/video_feed`} alt="Rekaman CCTV yang sudah ditandai oleh server AI" className="h-full w-full object-contain" />
            ) : (
              <canvas ref={displayRef} className="h-full w-full object-contain" />
            )}
            <video ref={videoRef} className="hidden" playsInline muted />
            {source === 'upload' && !hasStill && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/70">
                <ImageUp className="h-10 w-10" />
                <p className="text-sm">Unggah foto sampah atau pilih salah satu contoh di bawah.</p>
              </div>
            )}
            {error && (
              <div className="absolute inset-x-3 bottom-3 rounded-xl bg-white px-4 py-3 text-sm text-red-700 shadow-lg">{error}</div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 px-2 pt-4 pb-1">
            {source === 'cctv' ? (
              <p className="muted">Rekaman langsung dari kamera di mesin server AI, ditandai oleh FastAPI dan OpenCV.</p>
            ) : (
              <div className="flex gap-8">
                <Stat label="Mesin" value={engine === 'server' ? 'Server AI' : browserBackend === 'webgpu' ? 'Browser (GPU)' : 'Browser (CPU)'} />
                <Stat label="Waktu proses" value={`${perf.ms} ms`} />
                {live && <Stat label="Kecepatan" value={`${perf.fps} FPS`} />}
              </div>
            )}
            {live && (
              <button onClick={() => setRunning((r) => !r)} className="btn-secondary">
                {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {running ? 'Jeda' : 'Lanjutkan'}
              </button>
            )}
          </div>

          {source === 'upload' && (
            <div className="space-y-3 px-2 pt-3 pb-1">
              <label className="btn-primary w-fit cursor-pointer">
                <Upload className="h-4 w-4" /> Unggah foto
                <input type="file" accept="image/*" onChange={onFile} className="sr-only" />
              </label>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {SAMPLES.map((s) => (
                  <button key={s.src} onClick={() => loadStill(s.src)} className="aspect-square overflow-hidden rounded-xl border border-line transition-colors hover:border-brand" title={s.caption}>
                    <img src={s.src} alt={s.caption} className="h-full w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-faint">Foto contoh dari Wikimedia Commons (lisensi CC, rincian di README). Hasil unggahan langsung dicatat ke log.</p>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-5 xl:col-span-4">
          <section className="card p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="card-title">Terdeteksi di frame ini</h2>
              <span className="text-sm text-ink-soft">{detections.length} objek</span>
            </div>
            <ul className="mt-4 space-y-2">
              {Object.entries(CATEGORIES).map(([id, cat]) => {
                const st = CAT_STYLE[id];
                const Icon = st.icon;
                const n = counts[id] || 0;
                return (
                  <li key={id} className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: st.bg, color: st.tone }}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className={`flex-1 text-sm ${n ? 'text-ink' : 'text-ink-faint'}`}>{cat.label}</span>
                    <span className={`text-lg font-bold ${n ? 'text-ink' : 'text-ink-faint'}`}>{n}</span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 rounded-2xl bg-sky p-4">
              <p className="text-sm text-ink-soft">Estimasi nilai jual</p>
              <p className="mt-0.5 text-3xl font-bold tracking-tight">{formatIdr(frameVal.total_value_idr)}</p>
              <p className="mt-1 text-sm text-ink-soft">{frameVal.total_weight_kg} kg, {frameVal.points} poin</p>
            </div>
            <button onClick={() => saveLog(detections, source)} disabled={saving || !detections.length || source === 'cctv'} className="btn-primary mt-4 w-full">
              <Save className="h-4 w-4" /> {saving ? 'Menyimpan' : 'Catat ke log'}
            </button>
            {live && (
              <div className="mt-4 flex items-center justify-between gap-3">
                <span id="autolog-label" className="text-sm text-ink-soft">Catat otomatis tiap {AUTO_LOG_MS / 1000} detik</span>
                <button
                  role="switch"
                  aria-checked={autoLog}
                  aria-labelledby="autolog-label"
                  onClick={() => setAutoLog((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${autoLog ? 'bg-brand' : 'bg-line'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${autoLog ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            )}
          </section>

          <section className="card space-y-5 p-5">
            <div>
              <h2 className="card-title">Mesin AI</h2>
              <div className="seg mt-3 grid w-full grid-cols-2">
                <button onClick={() => setEngine('browser')} className={`seg-item ${engine === 'browser' ? 'seg-item-active' : ''}`}>Browser</button>
                <button onClick={() => setEngine('server')} disabled={!serverHealth} className={`seg-item ${engine === 'server' ? 'seg-item-active' : ''}`}>Server</button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">{engineNote}</p>
            </div>
            <label className="block">
              <span className="flex items-baseline justify-between text-sm">
                <span className="text-ink-soft">Ambang keyakinan</span>
                <span className="font-semibold">{Math.round(conf * 100)}%</span>
              </span>
              <input type="range" min="0.1" max="0.8" step="0.05" value={conf} onChange={(e) => setConf(Number(e.target.value))} className="mt-2 w-full accent-brand" />
              <span className="text-xs text-ink-faint">Objek dengan keyakinan di bawah ambang tidak ditampilkan.</span>
            </label>
          </section>

          <p className="px-1 text-xs leading-relaxed text-ink-faint">
            Gambar dari kamera hanya dianalisis, tidak disimpan. Yang tersimpan ke log hanyalah thumbnail kecil dan hasil deteksi, dan itu terjadi saat kamu menekan Catat ke log atau menyalakan catat otomatis.
          </p>

          <section className="rounded-card bg-ink p-5 text-white">
            <h2 className="text-base font-semibold">Sesi ini</h2>
            <div className="mt-4 grid grid-cols-[auto_auto_1fr] gap-6">
              <div><p className="text-2xl font-bold">{session.logs}</p><p className="text-xs text-white/60">catatan</p></div>
              <div><p className="text-2xl font-bold">{session.items}</p><p className="text-xs text-white/60">item</p></div>
              <div className="text-right"><p className="text-2xl font-bold text-[#9FE0BF]">{formatIdr(session.value)}</p><p className="text-xs text-white/60">nilai</p></div>
            </div>
          </section>
        </aside>
      </div>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-24 right-4 z-50 max-w-sm rounded-2xl px-4 py-3 text-sm shadow-xl lg:bottom-6 lg:right-6 ${
            toast.kind === 'err' ? 'bg-red-700 text-white' : toast.kind === 'warn' ? 'bg-[#FAEDCD] text-[#5C3D06]' : 'bg-ink text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
