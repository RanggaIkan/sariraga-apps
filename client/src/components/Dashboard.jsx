// client/src/components/Dashboard.jsx — Visual Metrics Dashboard + Waste-to-Wealth valuation
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Coins, Database, Download, Layers, RefreshCw, Weight } from 'lucide-react';
import { CATEGORIES } from '../../api/_lib/categories.js';
import { fetchLogs, fetchStats, formatIdr } from '../lib/api.js';

const SOURCE_LABEL = { webcam: 'Webcam', upload: 'Upload', simulasi: 'Simulasi', cctv: 'CCTV' };
const tooltipStyle = { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 };

function Kpi({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className={`mt-1 text-2xl font-bold ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

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

  if (!stats) {
    return (
      <div className="card p-8 text-center text-sm text-slate-400">
        {error ? `Gagal memuat data dari Core API: ${error}` : 'Memuat data…'}
      </div>
    );
  }

  const pieData = stats.categories.filter((c) => c.count > 0);
  const hourly = stats.hourly.map((h) => ({
    hour: new Date(h.ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    items: h.items,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Visual Metrics Dashboard</h2>
          <p className="text-xs text-slate-400">
            Agregat {stats.totalLogs} log deteksi • diperbarui {new Date(stats.generatedAt).toLocaleTimeString('id-ID')}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Muat ulang
          </button>
          <button onClick={() => exportCsv(stats, logs)} className="btn-primary" disabled={!logs.length}>
            <Download className="h-4 w-4" /> Ekspor Laporan (CSV)
          </button>
        </div>
      </div>

      {stats.storage === 'memory' && (
        <div className="text-xs rounded-lg border border-amber-700 bg-amber-950/50 text-amber-200 px-3 py-2">
          Mode demo: Supabase belum dikonfigurasi di server, data hanya tersimpan sementara di memori.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Layers} label="Total item terdeteksi" value={stats.totalItems.toLocaleString('id-ID')} sub={`${stats.todayItems} hari ini (WITA)`} />
        <Kpi icon={Weight} label="Estimasi berat" value={`${stats.totalWeightKg.toLocaleString('id-ID')} kg`} sub="bobot rata-rata per item" />
        <Kpi icon={Coins} label="Estimasi nilai jual" value={formatIdr(stats.totalValueIdr)} sub="harga acuan bank sampah" accent />
        <Kpi icon={Database} label="Poin sirkuler" value={stats.totalPoints.toLocaleString('id-ID')} sub={`1 poin = Rp ${stats.idrPerPoint}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="card p-5">
          <h3 className="text-sm font-semibold text-white mb-2">Komposisi Sampah</h3>
          {pieData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={pieData} dataKey="count" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="none">
                  {pieData.map((c) => <Cell key={c.id} fill={CATEGORIES[c.id]?.color} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: '#e2e8f0' }} formatter={(v, n) => [`${v} item`, n]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-slate-500 py-20 text-center">Belum ada data. Catat deteksi dari Command Center.</p>
          )}
          <ul className="space-y-1 mt-2">
            {stats.categories.map((c) => (
              <li key={c.id} className="flex justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORIES[c.id]?.color }} /> {c.label}
                </span>
                <span className="text-slate-400 font-mono">
                  {c.count} ({stats.totalItems ? Math.round((c.count / stats.totalItems) * 100) : 0}%)
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-2">Tren Volume Deteksi (24 jam terakhir)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={hourly}>
              <CartesianGrid stroke="#1e293b" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 11 }} interval={2} />
              <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 11 }} width={30} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: '#1e293b' }} formatter={(v) => [`${v} item`, 'Terdeteksi']} />
              <Bar dataKey="items" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="card p-5 overflow-x-auto">
        <h3 className="text-sm font-semibold text-white mb-3">Waste-to-Wealth Estimator</h3>
        <table className="w-full text-sm min-w-[560px]">
          <thead className="text-xs text-slate-400 text-left">
            <tr className="border-b border-slate-800">
              <th className="py-2">Kategori</th>
              <th className="text-right">Item</th>
              <th className="text-right">Bobot/item</th>
              <th className="text-right">Est. berat</th>
              <th className="text-right">Harga acuan</th>
              <th className="text-right">Est. nilai</th>
            </tr>
          </thead>
          <tbody>
            {stats.categories.map((c) => (
              <tr key={c.id} className="border-b border-slate-800/60">
                <td className="py-2 text-slate-200">{c.label}</td>
                <td className="text-right font-mono">{c.count}</td>
                <td className="text-right font-mono text-slate-400">{c.avgWeightKg} kg</td>
                <td className="text-right font-mono">{c.weightKg} kg</td>
                <td className="text-right font-mono text-slate-400">{formatIdr(c.pricePerKgIdr)}/kg</td>
                <td className="text-right font-mono text-emerald-400">{formatIdr(c.valueIdr)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2">Total</td>
              <td className="text-right font-mono">{stats.totalItems}</td>
              <td />
              <td className="text-right font-mono">{stats.totalWeightKg} kg</td>
              <td />
              <td className="text-right font-mono text-emerald-400">{formatIdr(stats.totalValueIdr)}</td>
            </tr>
          </tbody>
        </table>
        <p className="text-[11px] text-slate-500 mt-2">
          Estimasi memakai bobot rata-rata per item dan harga acuan yang dapat disesuaikan per bank sampah (belum terhubung timbangan load-cell).
        </p>
      </section>

      <section className="card p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Riwayat Deteksi (bukti visual)</h3>
        {logs.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {logs.slice(0, 24).map((l) => (
              <article key={l.id} className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden">
                {l.snapshot ? (
                  <img src={l.snapshot} alt={`Bukti deteksi #${l.id}`} className="w-full aspect-video object-cover" loading="lazy" />
                ) : (
                  <div className="w-full aspect-video bg-slate-900" />
                )}
                <div className="p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-400">
                    <span>#{l.id} • {SOURCE_LABEL[l.source] || l.source}</span>
                    <span>{new Date(l.created_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries((l.items || []).reduce((a, i) => ({ ...a, [i.category]: (a[i.category] || 0) + 1 }), {})).map(([cat, n]) => (
                      <span key={cat} className="chip" style={{ background: `${CATEGORIES[cat]?.color}33`, color: CATEGORIES[cat]?.color }}>
                        {CATEGORIES[cat]?.label || cat} ×{n}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">{l.engine} • maks. {Math.round(Math.max(...(l.items || []).map((i) => i.confidence), 0) * 100)}%</span>
                    <span className="text-emerald-400 font-semibold">{formatIdr(l.total_value_idr)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Belum ada log deteksi.</p>
        )}
      </section>
    </div>
  );
}
