import { put, list } from "@vercel/blob";
import seed from "@/data/searches_seed.json";
import type { ProductsData } from "@/lib/orders";

async function readBlobJson<T>(path: string): Promise<T | null> {
  try {
    const { blobs } = await list({ prefix: path });
    const blob = blobs.find((b) => b.pathname === path);
    if (!blob) return null;
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function writeBlobJson(path: string, data: unknown): Promise<void> {
  await put(path, JSON.stringify(data), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

// --- Clients par code postal ---
export type CountsPayload = {
  updatedAt: string;
  totalCustomers: number;
  distinctPostalCodes: number;
  counts: Record<string, number>;
};

let countsCache: { at: number; data: CountsPayload } | null = null;

export async function saveCounts(p: CountsPayload) {
  await writeBlobJson("data/counts.json", p);
  countsCache = { at: Date.now(), data: p };
}
export async function getCounts(): Promise<CountsPayload | null> {
  if (countsCache && Date.now() - countsCache.at < 60_000) return countsCache.data;
  const data = await readBlobJson<CountsPayload>("data/counts.json");
  if (data) countsCache = { at: Date.now(), data };
  return data;
}

// --- Produits (commandes Shopify) ---
let productsCache: { at: number; data: ProductsData } | null = null;

export async function saveProducts(p: ProductsData) {
  await writeBlobJson("data/products.json", p);
  productsCache = { at: Date.now(), data: p };
}
export async function getProducts(): Promise<ProductsData | null> {
  if (productsCache && Date.now() - productsCache.at < 60_000) return productsCache.data;
  const data = await readBlobJson<ProductsData>("data/products.json");
  if (data) productsCache = { at: Date.now(), data };
  return data;
}

// --- Recherches Stockist par zone ---
export type SearchesPayload = {
  updatedAt: string | null;
  coveredFrom: string | null;
  coveredTo: string | null;
  totalSearches: number;
  byCp: Record<string, { n: number; noResult: number; city: string }>;
};

let searchesCache: { at: number; data: SearchesPayload } | null = null;

export async function saveSearches(p: SearchesPayload) {
  await writeBlobJson("data/searches.json", p);
  searchesCache = { at: Date.now(), data: p };
}
export async function getSearches(): Promise<SearchesPayload> {
  if (searchesCache && Date.now() - searchesCache.at < 60_000) return searchesCache.data;
  const data = await readBlobJson<SearchesPayload>("data/searches.json");
  if (data) {
    searchesCache = { at: Date.now(), data };
    return data;
  }
  // Repli sur le jeu de données initial embarqué (premier export fourni).
  const s = seed as SearchesPayload;
  const withDate: SearchesPayload = { ...s, updatedAt: s.updatedAt || s.coveredTo };
  return withDate;
}
