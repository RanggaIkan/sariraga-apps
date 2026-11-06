// client/api/_lib/categories.js — dependency-free, shared by frontend and API.
// Categories = classes of the SariRaga YOLO11n model (botol_plastik, kaleng_aluminium, kardus).
// Waste-to-Wealth reference table (estimates: average weight per item, average bank sampah buy price).
// Adjust prices here to match the local Bank Sampah price list.
export const CATEGORIES = {
  botol: { label: 'Botol Plastik', color: '#10b981', avgWeightKg: 0.025, pricePerKgIdr: 3500 },
  kaleng: { label: 'Kaleng Aluminium', color: '#f59e0b', avgWeightKg: 0.015, pricePerKgIdr: 10000 },
  kardus: { label: 'Kardus / Karton', color: '#3b82f6', avgWeightKg: 0.05, pricePerKgIdr: 2000 },
};
export const IDR_PER_POINT = 100;

export function valuate(items) {
  const totals = { total_items: 0, total_weight_kg: 0, total_value_idr: 0 };
  for (const it of items) {
    const cat = CATEGORIES[it.category];
    if (!cat) continue;
    totals.total_items += 1;
    totals.total_weight_kg += cat.avgWeightKg;
    totals.total_value_idr += cat.avgWeightKg * cat.pricePerKgIdr;
  }
  totals.total_weight_kg = Math.round(totals.total_weight_kg * 1000) / 1000;
  totals.total_value_idr = Math.round(totals.total_value_idr);
  totals.points = Math.floor(totals.total_value_idr / IDR_PER_POINT);
  return totals;
}
