// client/src/App.jsx
import { useEffect, useState } from 'react';
import { LayoutDashboard, Recycle, ScanLine } from 'lucide-react';
import CommandCenter from './components/CommandCenter.jsx';
import Dashboard from './components/Dashboard.jsx';
import { checkServer, warmupBrowser } from './lib/detector.js';

function StatusChip({ ok, pending, label }) {
  const tone = pending ? 'bg-slate-500/10 text-slate-300 border-slate-600' : ok ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/10 text-amber-300 border-amber-500/30';
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${tone}`}>
      <span className={`h-2 w-2 rounded-full ${pending ? 'bg-slate-400' : ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      {label}
    </span>
  );
}

export default function App() {
  const [tab, setTab] = useState('command');
  const [serverHealth, setServerHealth] = useState(null);
  const [checking, setChecking] = useState(true);
  const [engine, setEngine] = useState('browser');
  const [browserReady, setBrowserReady] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    checkServer().then((h) => {
      setServerHealth(h);
      if (h) setEngine('server');
      setChecking(false);
    });
    warmupBrowser().then(() => setBrowserReady(true), () => setBrowserReady(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500 flex items-center justify-center text-slate-950">
              <Recycle className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">SariRaga</h1>
              <p className="text-[11px] text-slate-400">Smart AI Recycling &amp; Garbage Analytics</p>
            </div>
          </div>
          <nav className="flex gap-2 order-3 sm:order-none w-full sm:w-auto">
            <button onClick={() => setTab('command')} className={`tab flex-1 sm:flex-none justify-center ${tab === 'command' ? 'tab-active' : ''}`}>
              <ScanLine className="h-4 w-4" /> Command Center
            </button>
            <button onClick={() => setTab('dashboard')} className={`tab flex-1 sm:flex-none justify-center ${tab === 'dashboard' ? 'tab-active' : ''}`}>
              <LayoutDashboard className="h-4 w-4" /> Dashboard
            </button>
          </nav>
          <div className="flex flex-wrap gap-2">
            <StatusChip pending={checking} ok={!!serverHealth} label={checking ? 'AI Server: cek…' : serverHealth ? 'AI Server: online' : 'AI Server: offline'} />
            <StatusChip pending={browserReady === null} ok={browserReady} label={browserReady === null ? 'AI Browser: memuat…' : browserReady ? 'AI Browser: siap' : 'AI Browser: gagal'} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 flex-1">
        {tab === 'command' ? (
          <CommandCenter engine={engine} setEngine={setEngine} serverHealth={serverHealth} onLogged={() => setRefreshKey((k) => k + 1)} />
        ) : (
          <Dashboard refreshKey={refreshKey} />
        )}
      </main>

      <footer className="border-t border-slate-800 text-[11px] text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap justify-between gap-2">
          <span>Tim SariRaga — FTI UKSW • AI Web Innovation Challenge Bali DigiFest 2026</span>
          <span>YOLO11n (ONNX) • FastAPI • Vercel Functions • Supabase</span>
        </div>
      </footer>
    </div>
  );
}
