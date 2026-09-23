import { NextRequest, NextResponse } from "next/server";
import { getSearches } from "@/lib/storage";
import { getCentroid, haversineKm, normalizeCp } from "@/lib/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const accessCode = process.env.ACCESS_CODE;
  if (accessCode && sp.get("code") !== accessCode) {
    return NextResponse.json({ error: "code d'accès invalide" }, { status: 401 });
  }

  const data = await getSearches();

  // Liste des zones avec coordonnées (pour la carte et le tableau).
  const zones = Object.entries(data.byCp)
    .map(([cp, v]) => {
      const c = getCentroid(cp);
      return c
        ? {
            cp,
            city: v.city,
            n: v.n,
            noResult: v.noResult,
            lat: c[0],
            lng: c[1],
            samples: (v.samples || []).slice(0, 8),
          }
        : null;
    })
    .filter(Boolean) as {
    cp: string;
    city: string;
    n: number;
    noResult: number;
    lat: number;
    lng: number;
    samples: { d: string; q: string }[];
  }[];
  zones.sort((a, b) => b.n - a.n);

  // Total dans un rayon autour d'un code postal (optionnel).
  let zoneTotal: { cp: string; km: number; n: number; noResult: number } | null = null;
  const cp = normalizeCp(sp.get("cp") || "");
  if (cp.length === 5) {
    const c = getCentroid(cp);
    if (c) {
      let km = Number(sp.get("km") || "10");
      if (!isFinite(km)) km = 10;
      km = Math.min(200, Math.max(1, km));
      let n = 0;
      let noResult = 0;
      for (const z of zones) {
        if (haversineKm(c[0], c[1], z.lat, z.lng) <= km) {
          n += z.n;
          noResult += z.noResult;
        }
      }
      zoneTotal = { cp, km, n, noResult };
    }
  }

  return NextResponse.json({
    updatedAt: data.updatedAt,
    coveredFrom: data.coveredFrom,
    coveredTo: data.coveredTo,
    totalSearches: data.totalSearches,
    zones: zones.slice(0, 2500),
    zoneTotal,
  });
}
