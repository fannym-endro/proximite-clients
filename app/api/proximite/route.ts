import { NextRequest, NextResponse } from "next/server";
import { getCounts } from "@/lib/storage";
import { countWithinRadius, getCentroid, normalizeCp } from "@/lib/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const accessCode = process.env.ACCESS_CODE;
  if (accessCode && sp.get("code") !== accessCode) {
    return NextResponse.json({ error: "code d'accès invalide" }, { status: 401 });
  }

  const cp = normalizeCp(sp.get("cp") || "");
  if (cp.length !== 5) {
    return NextResponse.json(
      { error: "Entre un code postal à 5 chiffres." },
      { status: 400 }
    );
  }
  if (!getCentroid(cp)) {
    return NextResponse.json(
      { error: `Code postal ${cp} introuvable dans le référentiel français.` },
      { status: 404 }
    );
  }

  let km = Number(sp.get("km") || "10");
  if (!Number.isFinite(km)) km = 10;
  km = Math.min(200, Math.max(1, km));

  const data = await getCounts();
  if (!data) {
    return NextResponse.json({
      ready: false,
      message:
        "Les données ne sont pas encore chargées. Lance un premier rafraîchissement.",
    });
  }

  const { total, nearby } = countWithinRadius(cp, km, data.counts);

  return NextResponse.json({
    ready: true,
    cp,
    km,
    count: total,
    updatedAt: data.updatedAt,
    totalCustomers: data.totalCustomers,
    nearby: nearby.slice(0, 15),
  });
}
