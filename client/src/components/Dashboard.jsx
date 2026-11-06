// client/src/components/Dashboard.jsx: Visual Metrics Dashboard + Waste-to-Wealth valuation
import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Info, RefreshCw } from 'lucide-react';
import { CATEGORIES } from '../../api/_lib/categories.js';
import { fetchLogs, fetchStats, formatIdr } from '../lib/api.js';
import { CAT_STYLE } from '../lib/categoryStyle.js';

const SOURCES = {
  simulasi: { label: 'Simulasi', color: '#2F65A6' },
  webcam: { label: 'Webcam', color: '#1F7A55' },
  upload: { label: 'Upload', color: '#9CC3EA' },
  cctv: { label: 'CCTV', color: '#C9D1D8' },
};
const ENGINE_LABEL = { server: 'Server', browser: 'Browser' };
const ROWS_COLLAPSED = 8;

const fmtTime = (d) => new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const fmtNum = (n) => Number(n || 0).toLocaleString('id-ID');

function exportCsv(stats, logs) {
  const lines = [
    ['Laporan Komposisi Sampah SariRaga', new Date().toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }) + ' WITA'],
    [],
    ['Kategori', 'Jumlah item', 'Est. berat (kg)', 'Harga acuan (Rp/kg)', 'Est. nilai (Rp)'],
    ...stats.categories.map((c) => [c.label, c.count, c.weightKg, c.pricePerKgIdr, c.valueIdr]),
    ['TOTAL', stats.totalItems, stats.totalWeightKg, '', stats.totalValueIdr],
    [],
    ['Log ID', 'Waktu', 'Sumber', 'Mesin AI', 'Item', 'Est. nilai (Rp)', 'Poin', 'Rincian'],
    ...logs.map((l) => [
      l.id,
      new Date(l.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Makassar' }),
      l.source,
      l.engine,
      l.total_items,
      l.total_value_idr,
      l.points,
      (l.items || []).map((i) => `${i.category}:${Math.round(i.confidence * 100)}%`).join(' '),
    ]),
  ];
  const csv = lines.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `sariraga-laporan-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Dark rounded tooltip pill, shared by both charts.
function PillTooltip({ active, payload, render }) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white shadow-lg">{render(payload[0].payload)}</div>;
}

function ValueCard({ stats, cumulative }) {
  return (
    <section className="flex flex-col rounded-card bg-sky p-5 lg:col-span-5">
      <p className="text-3xl font-bold tracking-tight sm:text-[34px]">{formatIdr(stats.totalValueIdr)}</p>
      <p className="muted mt-1">Estimasi nilai jual semua sampah tercatat</p>
      <div className="-mx-2 mt-3 min-h-[120px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={cumulative} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2F65A6" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#2F65A6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Tooltip
              cursor={{ stroke: '#2F65A6', strokeDasharray: '3 3' }}
              content={<PillTooltip render={(d) => `${formatIdr(d.value)} sampai ${d.hour}`} />}
            />
            <Area type="monotone" dataKey="value" stroke="#2F65A6" strokeWidth={2} fill="url(#valueFill)" activeDot={{ r: 5, fill: '#2F65A6', stroke: '#fff', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-ink-soft">Akumulasi nilai 24 jam terakhir</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-[#C9DAEC] pt-4">
        <div><dt className="text-xs text-ink-soft">Berat</dt><dd className="font-semibold">{fmtNum(stats.totalWeightKg)} kg</dd></div>
        <div><dt className="text-xs text-ink-soft">Poin sirkuler</dt><dd className="font-semibold">{fmtNum(stats.totalPoints)}</dd></div>
        <div><dt className="text-xs text-ink-soft">Item hari ini</dt><dd className="font-semibold">{fmtNum(stats.todayItems)}</dd></div>
      </dl>
    </section>
  );
}

function CategoryCard({ c, total }) {
  const st = CAT_STYLE[c.id] || { bg: '#EEF1F4', tone: '#56625C' };
  const Icon = st.icon;
  return (
    <article className="flex flex-col justify-between rounded-card p-5 sm:min-h-[188px]" style={{ background: st.bg }}>
      <div>
        <p className="text-3xl font-bold tracking-tight">{fmtNum(c.count)}</p>
        <p className="mt-0.5 font-medium">{c.label}</p>
        <p className="text-sm text-ink-soft">{formatIdr(c.valueIdr)}</p>
      </div>
      <div className="mt-4 flex items-end justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white" style={{ color: st.tone }}>
          {Icon && <Icon className="h-5 w-5" />}
        </span>
        <span className="text-sm font-semibold" style={{ color: st.tone }}>
          {total ? Math.round((c.count / total) * 100) : 0}% dari total
        </span>
      </div>
    </article>
  );
}

function VolumeChart({ hourly }) {
  const [hover, setHover] = useState(null);
  const peak = hourly.reduce((best, h, i) => (h.items > (hourly[best]?.items ?? -1) ? i : best), 0);
  const highlight = hover ?? (hourly[peak]?.items ? peak : null);
  return (
    <section className="card p-5 lg:col-span-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Volume deteksi per jam</h2>
        <span className="text-sm text-ink-soft">24 jam terakhir</span>
      </div>
      <div className="mt-4 h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={hourly}
            margin={{ top: 8, right: 0, bottom: 0, left: -12 }}
            onMouseMove={(s) => setHover(s?.activeTooltipIndex != null ? Number(s.activeTooltipIndex) : null)}
            onMouseLeave={() => setHover(null)}
          >
            <CartesianGrid stroke="#E3E7EB" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="hour" tick={{ fill: '#8A958F', fontSize: 12 }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={28} />
            <YAxis allowDecimals={false} tick={{ fill: '#8A958F', fontSize: 12 }} tickLine={false} axisLine={false} width={40} />
            <Tooltip cursor={false} content={<PillTooltip render={(d) => `${d.items} item pukul ${d.hour}`} />} />
            <Bar dataKey="items" radius={[6, 6, 2, 2]} maxBarSize={28}>
              {hourly.map((h, i) => <Cell key={h.hour + i} fill={i === highlight ? '#1F7A55' : '#E3E7EB'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function ConfidenceGauge({ logs }) {
  const items = logs.flatMap((l) => l.items || []);
  const avg = items.length ? items.reduce((a, i) => a + i.confidence, 0) / items.length : null;
  const pct = avg == null ? 0 : Math.round(avg * 1000) / 10;
  return (
    <section className="card flex flex-col p-5 lg:col-span-4">
      <h2 className="card-title">Keyakinan model</h2>
      <div className="flex flex-1 flex-col justify-center">
      <div className="relative mx-auto mt-6 w-full max-w-[260px]">
        <svg viewBox="0 0 220 122" className="w-full" aria-hidden="true">
          <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="#E3E7EB" strokeWidth="18" strokeLinecap="round" />
          {avg != null && (
            <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="#1F7A55" strokeWidth="18" strokeLinecap="round" pathLength="100" strokeDasharray={`${pct} 100`} />
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className="text-xs text-ink-soft">Rata-rata</p>
          <p className="text-3xl font-bold tracking-tight">{avg == null ? '-' : `${pct.toLocaleString('id-ID')}%`}</p>
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-ink-soft">
        {avg == null
          ? 'Belum ada deteksi. Catat hasil dari Command Center untuk mengisi angka ini.'
          : `Dihitung dari ${fmtNum(items.length)} objek pada ${fmtNum(logs.length)} catatan terakhir.`}
      </p>
      </div>
    </section>
  );
}

function WealthTable({ stats }) {
  return (
    <section className="card flex flex-col p-5 lg:col-span-8">
      <h2 className="card-title">Waste-to-Wealth</h2>
      <p className="muted mt-0.5">Bobot rata-rata per item dikali harga acuan bank sampah.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="bg-canvas text-left text-xs text-ink-soft">
              <th className="rounded-l-xl px-3 py-2.5 font-medium">Kategori</th>
              <th className="px-3 py-2.5 text-right font-medium">Item</th>
              <th className="px-3 py-2.5 text-right font-medium">Bobot/item</th>
              <th className="px-3 py-2.5 text-right font-medium">Est. berat</th>
              <th className="px-3 py-2.5 text-right font-medium">Harga acuan</th>
              <th className="rounded-r-xl px-3 py-2.5 text-right font-medium">Est. nilai</th>
            </tr>
          </thead>
          <tbody>
            {stats.categories.map((c) => (
              <tr key={c.id} className="border-b border-line">
                <td className="px-3 py-3">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORIES[c.id]?.color }} />
                    {c.label}
                  </span>
                </td>
                <td className="px-3 text-right">{fmtNum(c.count)}</td>
                <td className="px-3 text-right text-ink-soft">{c.avgWeightKg} kg</td>
                <td className="px-3 text-right">{c.weightKg} kg</td>
                <td className="px-3 text-right text-ink-soft">{formatIdr(c.pricePerKgIdr)}/kg</td>
                <td className="px-3 text-right font-semibold">{formatIdr(c.valueIdr)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-3 py-3">Total</td>
              <td className="px-3 text-right">{fmtNum(stats.totalItems)}</td>
              <td />
              <td className="px-3 text-right">{stats.totalWeightKg} kg</td>
              <td />
              <td className="px-3 text-right text-brand">{formatIdr(stats.totalValueIdr)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-auto pt-3 text-xs text-ink-faint">Harga acuan bisa disesuaikan per bank sampah. Berat masih estimasi karena belum terhubung timbangan.</p>
    </section>
  );
}

function SourceBreakdown({ logs }) {
  const bySource = logs.reduce((acc, l) => ({ ...acc, [l.source]: (acc[l.source] || 0) + (l.total_items || 0) }), {});
  const entries = Object.entries(SOURCES).filter(([id]) => bySource[id]);
  const total = entries.reduce((a, [id]) => a + bySource[id], 0);
  return (
    <section className="card p-5">
      <h2 className="card-title">Asal deteksi</h2>
      {total ? (
        <>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            {entries.map(([id, s]) => (
              <div key={id}>
                <p className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} /> {s.label}
                </p>
                <p className="text-xl font-bold">{fmtNum(bySource[id])}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex h-9 gap-1 overflow-hidden rounded-xl">
            {entries.map(([id, s]) => (
              <div key={id} title={`${s.label}: ${bySource[id]} item`} style={{ width: `${(bySource[id] / total) * 100}%`, background: s.color }} />
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-faint">Jumlah item dari {fmtNum(logs.length)} catatan terakhir.</p>
        </>
      ) : (
        <p className="muted mt-3">Belum ada catatan.</p>
      )}
    </section>
  );
}

function ExportCard({ onExport, disabled }) {
  return (
    <section className="relative overflow-hidden rounded-card bg-ink p-6 text-white">
      <svg className="pointer-events-none absolute -right-6 -bottom-8 h-40 w-40 text-white/15" viewBox="0 0 160 160" fill="none" aria-hidden="true">
        <rect x="40" y="30" width="90" height="120" rx="14" stroke="currentColor" strokeWidth="1.5" transform="rotate(12 85 90)" />
        <rect x="30" y="40" width="90" height="120" rx="14" stroke="currentColor" strokeWidth="1.5" transform="rotate(4 75 100)" />
      </svg>
      <h2 className="relative max-w-[15rem] text-xl font-bold leading-snug">Bawa rekapnya ke bank sampah</h2>
      <p className="relative mt-2 max-w-[17rem] text-sm text-white/70">Unduh komposisi, nilai, dan riwayat deteksi dalam CSV yang bisa dibuka di Excel.</p>
      <button onClick={onExport} disabled={disabled} className="relative mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-sky px-5 text-sm font-semibold text-ink transition-colors hover:bg-white disabled:opacity-40">
        <Download className="h-4 w-4" /> Unduh CSV
      </button>
    </section>
  );
}

function HistoryTable({ logs }) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? logs : logs.slice(0, ROWS_COLLAPSED);
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="card-title">Riwayat deteksi</h2>
        <span className="text-sm text-ink-soft">{fmtNum(logs.length)} catatan</span>
      </div>
      {logs.length ? (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="bg-canvas text-left text-xs text-ink-soft">
                  <th className="rounded-l-xl px-3 py-2.5 font-medium">Bukti</th>
                  <th className="px-3 py-2.5 font-medium">ID</th>
                  <th className="px-3 py-2.5 font-medium">Waktu</th>
                  <th className="px-3 py-2.5 font-medium">Sumber</th>
                  <th className="px-3 py-2.5 font-medium">Isi</th>
                  <th className="px-3 py-2.5 font-medium">Mesin</th>
                  <th className="px-3 py-2.5 text-right font-medium">Keyakinan maks.</th>
                  <th className="rounded-r-xl px-3 py-2.5 text-right font-medium">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => {
                  const perCat = (l.items || []).reduce((a, i) => ({ ...a, [i.category]: (a[i.category] || 0) + 1 }), {});
                  const maxConf = Math.max(0, ...(l.items || []).map((i) => i.confidence));
                  return (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2.5">
                        {l.snapshot ? (
                          <a href={l.snapshot} target="_blank" rel="noreferrer">
                            <img src={l.snapshot} alt={`Bukti deteksi #${l.id}`} className="h-10 w-16 rounded-lg object-cover" loading="lazy" />
                          </a>
                        ) : (
                          <div className="h-10 w-16 rounded-lg bg-canvas" />
                        )}
                      </td>
                      <td className="px-3 font-semibold">#{l.id}</td>
                      <td className="px-3 text-ink-soft">
                        {new Date(l.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-3">{SOURCES[l.source]?.label || l.source}</td>
                      <td className="px-3">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(perCat).map(([cat, n]) => (
                            <span key={cat} className="pill" style={{ background: CAT_STYLE[cat]?.bg, color: CAT_STYLE[cat]?.tone }}>
                              {n} {CATEGORIES[cat]?.label.split(' ')[0].toLowerCase() || cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3">
                        <span className={`pill border ${l.engine === 'server' ? 'border-[#B9D2EE] text-sky-ink' : 'border-line text-ink-soft'}`}>
                          {ENGINE_LABEL[l.engine] || l.engine}
                        </span>
                      </td>
                      <td className="px-3 text-right">{Math.round(maxConf * 100)}%</td>
                      <td className="px-3 text-right font-semibold">{formatIdr(l.total_value_idr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {logs.length > ROWS_COLLAPSED && (
            <button onClick={() => setShowAll((v) => !v)} className="btn-secondary mt-4">
              {showAll ? 'Tampilkan lebih sedikit' : `Tampilkan semua ${fmtNum(logs.length)} catatan`}
            </button>
          )}
        </>
      ) : (
        <p className="muted mt-3">Belum ada catatan. Buka Command Center, lalu tekan Catat ke log.</p>
      )}
    </section>
  );
}

export default function Dashboard({ refreshKey }) {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([fetchStats(), fetchLogs(100)]);
      setStats(s);
      setLogs(l);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [refreshKey]);

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-[34px]">Dashboard</h1>
        <p className="muted mt-1">
          {stats
            ? `Ringkasan ${fmtNum(stats.totalLogs)} catatan deteksi. Diperbarui pukul ${fmtTime(stats.generatedAt)}.`
            : 'Ringkasan komposisi dan nilai sampah yang tercatat.'}
        </p>
      </div>
      <button onClick={load} className="btn-secondary" disabled={loading}>
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
      </button>
    </div>
  );

  if (!stats) {
    return (
      <div className="space-y-6">
        {header}
        <div className="card p-10 text-center">
          <p className="muted">
            {error
              ? `Data dashboard tidak bisa dimuat (${error}). Periksa koneksi ke Core API, lalu tekan Muat ulang.`
              : 'Memuat data dashboard.'}
          </p>
        </div>
      </div>
    );
  }

  const hourly = stats.hourly.map((h) => ({ hour: fmtTime(h.ts), items: h.items, valueIdr: h.valueIdr || 0 }));
  let running = 0;
  const cumulative = hourly.map((h) => ({ hour: h.hour, value: Math.round((running += h.valueIdr)) }));

  return (
    <div className="space-y-5">
      {header}

      {stats.storage === 'memory' && (
        <p className="flex items-start gap-2 rounded-2xl bg-[#FAEDCD] px-4 py-3 text-sm text-[#5C3D06]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Mode demo: Supabase belum diatur di server, jadi data hanya disimpan sementara di memori.
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <ValueCard stats={stats} cumulative={cumulative} />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 lg:col-span-7">
          {stats.categories.map((c) => <CategoryCard key={c.id} c={c} total={stats.totalItems} />)}
        </div>

        <VolumeChart hourly={hourly} />
        <ConfidenceGauge logs={logs} />

        <WealthTable stats={stats} />
        <div className="flex flex-col gap-5 lg:col-span-4">
          <SourceBreakdown logs={logs} />
          <ExportCard onExport={() => exportCsv(stats, logs)} disabled={!logs.length} />
        </div>
      </div>

      <HistoryTable logs={logs} />
    </div>
  );
}
