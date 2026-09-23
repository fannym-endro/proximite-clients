import { NextRequest, NextResponse } from "next/server";
import { aggregateSearches } from "@/lib/searches";
import { saveSearches } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function adminCode() {
  return process.env.ADMIN_CODE || process.env.ACCESS_CODE || "";
}

export async function POST(req: NextRequest) {
  let payload: { url?: string; code?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "corps invalide" }, { status: 400 });
  }

  const code = adminCode();
  if (!code) return NextResponse.json({ error: "ADMIN_CODE non défini." }, { status: 403 });
  if (payload.code !== code) {
    return NextResponse.json({ error: "code d'accès admin invalide" }, { status: 401 });
  }
  if (!payload.url) return NextResponse.json({ error: "url manquante" }, { status: 400 });

  try {
    const res = await fetch(payload.url, { cache: "no-store" });
    if (!res.ok) throw new Error(`lecture du fichier: HTTP ${res.status}`);
    const text = await res.text();
    const agg = aggregateSearches(text);
    await saveSearches(agg);
    return NextResponse.json({
      ok: true,
      totalSearches: agg.totalSearches,
      distinctPostalCodes: Object.keys(agg.byCp).length,
      coveredFrom: agg.coveredFrom,
      coveredTo: agg.coveredTo,
      updatedAt: agg.updatedAt,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
