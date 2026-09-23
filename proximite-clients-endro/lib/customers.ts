import { normalizeCp, getCentroid } from "@/lib/geo";

// Agrège le JSONL clients (une ligne par client) en un comptage par code postal.
export function aggregateCustomers(text: string): {
  counts: Record<string, number>;
  totalCustomers: number;
} {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    let node: any;
    try {
      node = JSON.parse(l);
    } catch {
      continue;
    }
    const addr = node?.defaultAddress;
    if (!addr || !addr.zip) continue;
    const cp = normalizeCp(String(addr.zip));
    if (cp.length !== 5) continue;
    if (!getCentroid(cp)) continue;
    counts[cp] = (counts[cp] || 0) + 1;
    total += 1;
  }
  return { counts, totalCustomers: total };
}
