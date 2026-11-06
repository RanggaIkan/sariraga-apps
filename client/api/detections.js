// client/api/detections.js — Vercel Function (also mounted by server/server.js)
// GET  /api/detections?limit=20  -> recent detection logs (with visual evidence snapshot)
// POST /api/detections           -> store one detection event + server-side Waste-to-Wealth valuation
import { insertDetection, listDetections, parseDetectionPayload, sendError } from './_lib/waste.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 20));
      return res.status(200).json({ status: 'success', data: await listDetections(limit) });
    }
    if (req.method === 'POST') {
      let row;
      try {
        row = parseDetectionPayload(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
      } catch (err) {
        return sendError(res, err, 400);
      }
      return res.status(201).json({ status: 'success', data: await insertDetection(row) });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  } catch (err) {
    return sendError(res, err);
  }
}
