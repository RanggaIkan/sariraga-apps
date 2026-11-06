// client/api/_lib/waste.js
// Shared business logic for Vercel Functions (/api/*) and the local Express server.
import { createClient } from '@supabase/supabase-js';

import { CATEGORIES, IDR_PER_POINT, valuate } from './categories.js';

export { CATEGORIES, IDR_PER_POINT, valuate };

const SOURCES = new Set(['webcam', 'upload', 'simulasi', 'cctv']);
const MAX_SNAPSHOT_CHARS = 300_000;

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase =
  process.env.SUPABASE_URL && SUPABASE_KEY
    ? createClient(process.env.SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
    : null;
export const storageMode = supabase ? 'supabase' : 'memory';

// Fallback store when Supabase env vars are not set (resets on restart).
const memory = [];
let memoryId = 0;

export function parseDetectionPayload(body) {
  if (!body || typeof body !== 'object') throw new Error('Body JSON wajib diisi');
  const items = Array.isArray(body.items) ? body.items.slice(0, 100) : [];
  const clean = items
    .filter((it) => it && CATEGORIES[it.category])
    .map((it) => ({
      category: it.category,
      confidence: Math.min(1, Math.max(0, Number(it.confidence) || 0)),
      bbox: Array.isArray(it.bbox) ? it.bbox.slice(0, 4).map((n) => Math.round(Number(n) || 0)) : null,
    }));
  if (clean.length === 0) throw new Error('Tidak ada objek terdeteksi untuk dicatat');
  const snapshot =
    typeof body.snapshot === 'string' && body.snapshot.startsWith('data:image/') && body.snapshot.length <= MAX_SNAPSHOT_CHARS
      ? body.snapshot
      : null;
  return {
    source: SOURCES.has(body.source) ? body.source : 'upload',
    engine: String(body.engine || 'unknown').slice(0, 40),
    model: String(body.model || 'unknown').slice(0, 60),
    inference_ms: Number(body.inference_ms) || null,
    items: clean,
    snapshot,
    ...valuate(clean),
  };
}

export async function insertDetection(row) {
  if (!supabase) {
    const saved = { id: ++memoryId, created_at: new Date().toISOString(), ...row };
    memory.unshift(saved);
    memory.length = Math.min(memory.length, 500);
    return saved;
  }
  const { data, error } = await supabase.from('detection_logs').insert(row).select().single();
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export async function listDetections(limit = 20) {
  if (!supabase) return memory.slice(0, limit);
  const { data, error } = await supabase
    .from('detection_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

async function recentRowsForStats() {
  const cols = 'id, created_at, source, items, total_items, total_weight_kg, total_value_idr, points';
  if (!supabase) return memory;
  const { data, error } = await supabase
    .from('detection_logs')
    .select(cols)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

// Aggregate composition + Waste-to-Wealth valuation + 24h hourly trend.
export async function computeStats() {
  const rows = await recentRowsForStats();
  const perCat = Object.fromEntries(
    Object.entries(CATEGORIES).map(([id, c]) => [
      id,
      { id, label: c.label, color: c.color, count: 0, weightKg: 0, valueIdr: 0, pricePerKgIdr: c.pricePerKgIdr, avgWeightKg: c.avgWeightKg },
    ])
  );
  const now = Date.now();
  const hourly = Array.from({ length: 24 }, (_, i) => {
    const t = new Date(now - (23 - i) * 3600_000);
    t.setMinutes(0, 0, 0);
    return { ts: t.toISOString(), items: 0, valueIdr: 0 };
  });
  let totalItems = 0;
  let totalLogs = 0;
  let todayItems = 0;
  // "Today" in Bali time (WITA, UTC+8) regardless of where the function runs.
  const baliDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Makassar' });
  const todayStr = baliDay(now);

  for (const r of rows) {
    totalLogs += 1;
    const ts = new Date(r.created_at).getTime();
    const hoursAgo = Math.floor((now - ts) / 3600_000);
    for (const it of r.items || []) {
      const c = perCat[it.category];
      if (!c) continue;
      c.count += 1;
      totalItems += 1;
      if (hoursAgo >= 0 && hoursAgo < 24) {
        hourly[23 - hoursAgo].items += 1;
        hourly[23 - hoursAgo].valueIdr += c.avgWeightKg * c.pricePerKgIdr;
      }
      if (baliDay(ts) === todayStr) todayItems += 1;
    }
  }
  let totalWeightKg = 0;
  let totalValueIdr = 0;
  for (const c of Object.values(perCat)) {
    c.weightKg = Math.round(c.count * c.avgWeightKg * 1000) / 1000;
    c.valueIdr = Math.round(c.weightKg * c.pricePerKgIdr);
    totalWeightKg += c.weightKg;
    totalValueIdr += c.valueIdr;
  }
  return {
    storage: storageMode,
    generatedAt: new Date().toISOString(),
    totalLogs,
    totalItems,
    todayItems,
    totalWeightKg: Math.round(totalWeightKg * 1000) / 1000,
    totalValueIdr,
    totalPoints: Math.floor(totalValueIdr / IDR_PER_POINT),
    idrPerPoint: IDR_PER_POINT,
    categories: Object.values(perCat),
    hourly,
  };
}

export function sendError(res, err, status = 500) {
  res.status(status).json({ status: 'error', message: err.message || String(err) });
}
