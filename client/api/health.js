// client/api/health.js — Vercel Function: GET /api/health
import { storageMode } from './_lib/waste.js';

export default function handler(req, res) {
  res.status(200).json({ status: 'ok', service: 'SariRaga Core API', storage: storageMode });
}
