import centroids from "@/data/codes_postaux.json";

// { "16430": [lat, lon], ... } — un centroïde par code postal (moyenne des communes).
const CENTROIDS = centroids as unknown as Record<string, [number, number]>;

export function getCentroid(cp: string): [number, number] | null {
  return CENTROIDS[cp] ?? null;
}

export function normalizeCp(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length === 4) return "0" + digits; // zéro initial parfois perdu
  return digits.slice(0, 5);
}

// Distance à vol d'oiseau en kilomètres (formule de haversine).
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type NearbyEntry = { cp: string; count: number; km: number };

// Somme des clients de tous les codes postaux dont le centroïde
// est dans le rayon demandé autour du code postal cible.
export function countWithinRadius(
  targetCp: string,
  radiusKm: number,
  counts: Record<string, number>
): { total: number; nearby: NearbyEntry[] } {
  const target = getCentroid(targetCp);
  if (!target) return { total: 0, nearby: [] };
  const [tlat, tlon] = target;

  let total = 0;
  const nearby: NearbyEntry[] = [];
  for (const cp in counts) {
    const c = counts[cp];
    if (!c) continue;
    const pt = CENTROIDS[cp];
    if (!pt) continue;
    const km = haversineKm(tlat, tlon, pt[0], pt[1]);
    if (km <= radiusKm) {
      total += c;
      nearby.push({ cp, count: c, km: Math.round(km * 10) / 10 });
    }
  }
  nearby.sort((a, b) => b.count - a.count);
  return { total, nearby };
}
