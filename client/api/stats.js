// client/api/stats.js — Vercel Function (also mounted by server/server.js)
// GET /api/stats -> waste composition, Waste-to-Wealth valuation, 24h trend
import { CATEGORIES, computeStats, storageMode } from './_lib/waste.js';

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ status: 'success', data: await computeStats() });
  } catch (err) {
    // Still expose the price table so the UI can valuate locally if the DB is unreachable.
    return res.status(500).json({ status: 'error', message: err.message, storage: storageMode, categories: CATEGORIES });
  }
}
