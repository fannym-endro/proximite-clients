import { parseCsv } from "@/lib/csv";
import { getCentroid, nearestCp } from "@/lib/geo";
import type { SearchesPayload } from "@/lib/storage";

function deburr(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

// Agrège l'export Stockist (recherches) en comptage par code postal.
export function aggregateSearches(text: string): SearchesPayload {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { updatedAt: new Date().toISOString(), coveredFrom: null, coveredTo: null, totalSearches: 0, byCp: {} };
  }
  const header = rows[0].map(deburr);
  const idx = (name: string) => header.indexOf(deburr(name));
  const iTs = idx("Timestamp");
  const iLat = idx("Query latitude");
  const iLng = idx("Query longitude");
  const iCity = idx("Query city");
  const iCp = idx("Query postal code");
  const iResults = idx("Results found");

  const byCp: Record<string, { n: number; noResult: number; city: string }> = {};
  let total = 0;
  let dmin: string | null = null;
  let dmax: string | null = null;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const ts = iTs >= 0 ? (row[iTs] || "").slice(0, 10) : "";
    if (ts) {
      if (!dmin || ts < dmin) dmin = ts;
      if (!dmax || ts > dmax) dmax = ts;
    }
    const results = iResults >= 0 ? parseInt((row[iResults] || "0").trim() || "0", 10) : 0;

    let cp: string | null = null;
    const rawCp = iCp >= 0 ? (row[iCp] || "").trim() : "";
    if (rawCp.length === 5 && /^\d{5}$/.test(rawCp) && getCentroid(rawCp)) {
      cp = rawCp;
    } else {
      const la = iLat >= 0 ? parseFloat(row[iLat]) : NaN;
      const lo = iLng >= 0 ? parseFloat(row[iLng]) : NaN;
      if (!isNaN(la) && !isNaN(lo)) cp = nearestCp(la, lo);
    }
    if (!cp) continue;

    total += 1;
    const e = (byCp[cp] ||= { n: 0, noResult: 0, city: "" });
    e.n += 1;
    if (!isNaN(results) && results === 0) e.noResult += 1;
    if (!e.city && iCity >= 0) e.city = (row[iCity] || "").trim();
  }

  return {
    updatedAt: new Date().toISOString(),
    coveredFrom: dmin,
    coveredTo: dmax,
    totalSearches: total,
    byCp,
  };
}
