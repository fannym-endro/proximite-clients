import { NextRequest, NextResponse } from "next/server";
import { getProducts } from "@/lib/storage";
import { computeTop } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dayStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  const accessCode = process.env.ACCESS_CODE;
  if (accessCode && sp.get("code") !== accessCode) {
    return NextResponse.json({ error: "code d'accès invalide" }, { status: 401 });
  }

  const data = await getProducts();
  if (!data) {
    return NextResponse.json({
      ready: false,
      message: "Les données produits ne sont pas encore chargées (extraction commandes en cours).",
    });
  }

  // Plage : soit une période prédéfinie (?period=30|90|365), soit ?from=&to=.
  let from = sp.get("from");
  let to = sp.get("to");
  const period = sp.get("period");
  if (!from || !to) {
    const days = period ? parseInt(period, 10) : 365;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (isFinite(days) ? days : 365));
    from = dayStr(start);
    to = dayStr(end);
  }
  // borne sur la couverture réelle
  if (data.coveredFrom && from < data.coveredFrom) from = data.coveredFrom;
  if (data.coveredTo && to > data.coveredTo) to = data.coveredTo;

  const { products, pairs } = computeTop(data, from, to, 30, 20);

  return NextResponse.json({
    ready: true,
    updatedAt: data.updatedAt,
    from,
    to,
    coveredFrom: data.coveredFrom,
    coveredTo: data.coveredTo,
    topProducts: products,
    topPairs: pairs,
  });
}
