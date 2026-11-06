// client/src/App.jsx
import React, { useEffect, useState } from 'react';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const AI_SERVICE_URL = import.meta.env.VITE_AI_SERVICE_URL || 'http://localhost:8000';

export default function App() {
  const [streamActive, setStreamActive] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [aiOnline, setAiOnline] = useState(false);
  const [detectionResult, setDetectionResult] = useState(null);
  const [wasteMetrics, setWasteMetrics] = useState([
    { id: 'botol', label: 'Botol Plastik (PET)', count: 42, weightKg: 1.26, pricePerKgIdr: 4500, subtotalIdr: 5670 },
    { id: 'kardus', label: 'Kardus / Kertas', count: 18, weightKg: 3.60, pricePerKgIdr: 2500, subtotalIdr: 9000 },
    { id: 'kaca', label: 'Kaca / Beling', count: 9, weightKg: 2.25, pricePerKgIdr: 1500, subtotalIdr: 3375 },
  ]);

  // Fetch stats from Backend (Port 5000) & check AI health (Port 8000)
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/stats`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.data?.categories) {
          setWasteMetrics(json.data.categories);
          setBackendOnline(true);
        }
      })
      .catch(() => setBackendOnline(false));

    fetch(`${AI_SERVICE_URL}/health`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.status === 'healthy') setAiOnline(true);
      })
      .catch(() => setAiOnline(false));
  }, []);

  const handleTestDetectFrame = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${AI_SERVICE_URL}/api/detect`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setDetectionResult(data);
    } catch (err) {
      console.error('AI Detect error:', err);
    }
  };

  const totalValue = wasteMetrics.reduce(
    (acc, item) => acc + (item.subtotalIdr ?? item.weightKg * item.pricePerKgIdr),
    0
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-950 text-lg">
              SR
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">
                SariRaga
              </h1>
              <p className="text-xs text-slate-400">
                Smart AI Recycling &amp; Garbage Analytics — AIWIC 2026
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${
                backendOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${backendOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              API (5000): {backendOnline ? 'Connected' : 'Fallback Mode'}
            </span>
            <span
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${
                aiOnline
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${aiOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              AI Node (8000): {aiOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto w-full px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
        {/* Card 1: Live CCTV Stream & Frame Upload Test */}
        <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">
                Live CCTV Stream
              </h2>
              <p className="text-xs text-slate-400">
                Real-time YOLOv8 Waste Detection Feed ({AI_SERVICE_URL}/video_feed)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition">
                Test POST /api/detect
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleTestDetectFrame}
                  className="hidden"
                />
              </label>
              <button
                onClick={() => setStreamActive(!streamActive)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
              >
                {streamActive ? 'Pause Stream' : 'Resume Stream'}
              </button>
            </div>
          </div>

          <div className="relative flex-1 min-h-[360px] rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center">
            {streamActive ? (
              <img
                src={`${AI_SERVICE_URL}/video_feed`}
                alt="Live AI Stream"
                className="w-full h-full object-cover z-10"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            ) : null}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs uppercase tracking-widest text-slate-500 mb-1">
                [ Stream Endpoint: {AI_SERVICE_URL}/video_feed ]
              </span>
              <p className="text-sm text-slate-400">
                {streamActive
                  ? 'Waiting for FastAPI OpenCV Multipart Stream...'
                  : 'Stream Paused'}
              </p>
            </div>
          </div>

          {detectionResult && (
            <div className="mt-4 p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
              <p className="font-semibold text-emerald-400 mb-1">
                POST /api/detect Response ({detectionResult.count} objek terdeteksi):
              </p>
              <pre className="text-slate-300 overflow-x-auto">
                {JSON.stringify(detectionResult.detections, null, 2)}
              </pre>
            </div>
          )}
        </section>

        {/* Card 2: Waste-to-Wealth Estimator */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white">
                Waste-to-Wealth Estimator
              </h2>
              <p className="text-xs text-slate-400">
                Valuasi Ekonomi Sampah Terdeteksi
              </p>
            </div>

            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mb-5">
              <span className="text-xs text-emerald-300 uppercase font-medium">
                Total Estimasi Nilai Ekonomi
              </span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                Rp {totalValue.toLocaleString('id-ID')}
              </p>
            </div>

            <div className="space-y-3">
              {wasteMetrics.map((item) => (
                <div
                  key={item.id || item.label}
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      {item.label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.count} unit • {item.weightKg} kg
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-400">
                      Rp {(item.subtotalIdr ?? item.weightKg * item.pricePerKgIdr).toLocaleString('id-ID')}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      @Rp {item.pricePerKgIdr.toLocaleString('id-ID')}/kg
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
            <span>Sync: API Port 5000</span>
            <span>Database: Supabase PostgreSQL</span>
          </div>
        </section>
      </main>
    </div>
  );
}
