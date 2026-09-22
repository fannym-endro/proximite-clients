import { put, list } from "@vercel/blob";

const BLOB_PATH = "data/counts.json";

export type CountsPayload = {
  updatedAt: string; // ISO
  totalCustomers: number; // total de clients FR comptés
  distinctPostalCodes: number;
  counts: Record<string, number>; // { "16430": 138, ... }
};

// Petit cache en mémoire (survit entre requêtes sur une instance "chaude").
let cache: { at: number; data: CountsPayload } | null = null;
const TTL_MS = 60_000;

export async function saveCounts(payload: CountsPayload): Promise<void> {
  await put(BLOB_PATH, JSON.stringify(payload), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    // token: process.env.BLOB_READ_WRITE_TOKEN — pris automatiquement
  });
  cache = { at: Date.now(), data: payload };
}

export async function getCounts(): Promise<CountsPayload | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const { blobs } = await list({ prefix: BLOB_PATH });
    const blob = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!blob) return null;
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as CountsPayload;
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return null;
  }
}
