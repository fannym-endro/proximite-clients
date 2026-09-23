import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentBulkOperation,
  startBulkQuery,
  CUSTOMERS_QUERY,
  ordersQuery,
  fetchBulkText,
} from "@/lib/shopify";
import { aggregateCustomers } from "@/lib/customers";
import { aggregateOrders } from "@/lib/orders";
import { getCounts, saveCounts, getProducts, saveProducts } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  if (req.nextUrl.searchParams.get("secret") === secret) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  }

  try {
    const current = await getCurrentBulkOperation();
    let ingested: string | null = null;
    let ingestInfo: Record<string, unknown> | null = null;

    // 1) Ingérer une opération terminée, selon son type (clients ou commandes).
    if (current?.status === "COMPLETED" && current.url) {
      const q = current.query || "";
      if (q.includes("customers")) {
        const stored = await getCounts();
        if (!stored || new Date(current.createdAt) > new Date(stored.updatedAt)) {
          const text = await fetchBulkText(current.url);
          const { counts, totalCustomers } = aggregateCustomers(text);
          const payload = {
            updatedAt: new Date().toISOString(),
            totalCustomers,
            distinctPostalCodes: Object.keys(counts).length,
            counts,
          };
          await saveCounts(payload);
          ingested = "customers";
          ingestInfo = { totalCustomers, distinctPostalCodes: payload.distinctPostalCodes };
        }
      } else if (q.includes("orders")) {
        const stored = await getProducts();
        if (!stored || new Date(current.createdAt) > new Date(stored.updatedAt)) {
          const text = await fetchBulkText(current.url);
          const agg = aggregateOrders(text);
          const payload = { updatedAt: new Date().toISOString(), ...agg };
          await saveProducts(payload);
          ingested = "orders";
          ingestInfo = {
            coveredFrom: agg.coveredFrom,
            coveredTo: agg.coveredTo,
            distinctProducts: Object.keys(agg.titles).length,
          };
        }
      }
    }

    // 2) Si rien ne tourne, lancer le jeu de données le plus ancien.
    const isRunning = current?.status === "RUNNING" || current?.status === "CREATED";
    let started: string | null = null;
    if (!isRunning) {
      const [counts, products] = await Promise.all([getCounts(), getProducts()]);
      const custAt = counts ? new Date(counts.updatedAt).getTime() : 0;
      const prodAt = products ? new Date(products.updatedAt).getTime() : 0;
      // on relance en priorité celui qui n'a jamais tourné, sinon le plus ancien
      const startOrders = prodAt < custAt;
      const op = await startBulkQuery(startOrders ? ordersQuery(400) : CUSTOMERS_QUERY);
      started = op
        ? `${startOrders ? "orders" : "customers"}:${op.id}`
        : "extraction déjà en cours";
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
    return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}
