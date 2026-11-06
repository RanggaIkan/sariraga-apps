// client/src/App.jsx
import { useEffect, useState } from 'react';
import { LayoutDashboard, Recycle, ScanLine } from 'lucide-react';
import CommandCenter from './components/CommandCenter.jsx';
import Dashboard from './components/Dashboard.jsx';
import { checkServer, warmupBrowser } from './lib/detector.js';

const NAV = [
  { id: 'command', label: 'Command Center', short: 'Deteksi', icon: ScanLine },
  { id: 'dashboard', label: 'Dashboard', short: 'Dashboard', icon: LayoutDashboard },
];

function Logo({ className = '' }) {
  return (
    <div className={`flex items-center justify-center rounded-2xl bg-[#F5EBC9] text-ink ${className}`}>
      <Recycle className="h-5 w-5" strokeWidth={2.4} />
    </div>
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
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-[92px] flex-col items-center bg-ink py-6">
        <Logo className="h-12 w-12" />
        <nav className="mt-12 flex w-full flex-col gap-2" aria-label="Navigasi utama">
          {NAV.map(({ id, short, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={active ? 'page' : undefined}
                title={label}
                className={`relative mx-auto flex w-[76px] flex-col items-center gap-1.5 rounded-2xl py-3 text-[11px] font-medium transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-ink-faint hover:text-white'
                }`}
              >
                {active && <span className="absolute -left-2 top-3 bottom-3 w-[3px] rounded-full bg-white" />}
                <Icon className="h-5 w-5" />
                {short}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-[92px] flex min-h-screen flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 pt-4">
          <Logo className="h-10 w-10" />
          <div>
            <p className="text-base font-bold leading-tight">SariRaga</p>
            <p className="text-xs text-ink-soft">Smart AI Recycling &amp; Garbage Analytics</p>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pt-6 pb-8 sm:px-8 lg:pt-10 lg:pb-10">
          {tab === 'command' ? (
            <CommandCenter
              engine={engine}
              setEngine={setEngine}
              serverHealth={serverHealth}
              checking={checking}
              browserReady={browserReady}
              onLogged={() => setRefreshKey((k) => k + 1)}
            />
          ) : (
            <Dashboard refreshKey={refreshKey} />
          )}
        </main>

        <footer className="mx-auto w-full max-w-[1320px] px-4 pb-28 text-xs text-ink-faint sm:px-8 lg:pb-8">
          Tim SariRaga, FTI UKSW. AI Web Innovation Challenge Bali DigiFest 2026.
        </footer>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="lg:hidden fixed inset-x-4 bottom-4 z-30 flex gap-1 rounded-full bg-ink p-1.5 shadow-lg" aria-label="Navigasi utama">
        {NAV.map(({ id, short, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-current={tab === id ? 'page' : undefined}
            className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors ${
              tab === id ? 'bg-white text-ink' : 'text-ink-faint'
            }`}
          >
            <Icon className="h-4 w-4" /> {short}
          </button>
        ))}
      </nav>
    </div>
  );
}
