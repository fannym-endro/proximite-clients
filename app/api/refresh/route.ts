import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentBulkOperation,
  startBulkOperation,
  aggregateFromBulkUrl,
} from "@/lib/shopify";
import { getCounts, saveCounts } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // pas de secret configuré (dev)
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true; // cron Vercel
  if (req.nextUrl.searchParams.get("secret") === secret) return true; // manuel
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  try {
    const current = await getCurrentBulkOperation();
    let ingested = false;
    let ingestInfo: Record<string, unknown> | null = null;

    // 1) Si une opération est terminée et pas encore ingérée, on l'ingère.
    if (current?.status === "COMPLETED" && current.url) {
      const stored = await getCounts();
      const isNewer =
        !stored || new Date(current.createdAt) > new Date(stored.updatedAt);
      if (isNewer) {
        const { counts, totalCustomers } = await aggregateFromBulkUrl(current.url);
        const payload = {
          updatedAt: new Date().toISOString(),
          totalCustomers,
          distinctPostalCodes: Object.keys(counts).length,
          counts,
        };
        await saveCounts(payload);
        ingested = true;
        ingestInfo = {
          totalCustomers,
          distinctPostalCodes: payload.distinctPostalCodes,
        };
      }
    }

    // 2) Si rien n'est en cours, on lance une nouvelle extraction pour la prochaine fois.
    const isRunning =
      current?.status === "RUNNING" || current?.status === "CREATED";
    let started: string | null = null;
    if (!isRunning) {
      const op = await startBulkOperation();
      started = op.id;
    }

    return NextResponse.json({
      ok: true,
      current: current
        ? { status: current.status, createdAt: current.createdAt, objectCount: current.objectCount }
        : null,
      ingested,
      ingestInfo,
      startedNewOperation: started,
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
