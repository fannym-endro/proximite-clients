// Agrège le JSONL des commandes (commande + lignes produits) en agrégats
// par jour : unités par produit, et co-occurrences de paires de produits.

function shortId(gid: string): string {
  const i = gid.lastIndexOf("/");
  return i >= 0 ? gid.slice(i + 1) : gid;
}

export type ProductsData = {
  updatedAt: string;
  coveredFrom: string | null;
  coveredTo: string | null;
  titles: Record<string, string>;
  unitsByDay: Record<string, Record<string, number>>;
  pairsByDay: Record<string, Record<string, number>>;
};

const MAX_PAIRS_PER_DAY = 1000;

export function aggregateOrders(text: string): Omit<ProductsData, "updatedAt"> {
  const orderDay: Record<string, string> = {};
  const orderProducts: Record<string, Set<string>> = {};
  const titles: Record<string, string> = {};
  const unitsByDay: Record<string, Record<string, number>> = {};
  const pendingUnits: Record<string, Record<string, number>> = {};

  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    let node: any;
    try {
      node = JSON.parse(l);
    } catch {
      continue;
    }

    // Ligne "commande" : possède createdAt.
    if (node.createdAt && node.id && String(node.id).includes("/Order/")) {
      orderDay[node.id] = String(node.createdAt).slice(0, 10);
      continue;
    }

    // Ligne "ligne de commande" : rattachée à une commande via __parentId.
    const parent = node.__parentId;
    const prod = node.product;
    if (parent && prod && prod.id) {
      const pid = shortId(prod.id);
      if (prod.title && !titles[pid]) titles[pid] = prod.title;
      (orderProducts[parent] ||= new Set()).add(pid);
      // unités : on les compte une fois la date connue (2e passe ci-dessous)
      // mais on stocke la quantité provisoirement via une structure parent->pid->qty
      const q = typeof node.quantity === "number" ? node.quantity : 1;
      (pendingUnits[parent] ||= {});
      pendingUnits[parent][pid] = (pendingUnits[parent][pid] || 0) + q;
    }
  }

  // 2e passe : rattacher chaque commande à son jour.
  const pairsByDay: Record<string, Record<string, number>> = {};
  let minDay: string | null = null;
  let maxDay: string | null = null;

  for (const orderId in orderProducts) {
    const day = orderDay[orderId];
    if (!day) continue;
    if (!minDay || day < minDay) minDay = day;
    if (!maxDay || day > maxDay) maxDay = day;

    // unités par produit
    const u = pendingUnits[orderId] || {};
    const dayUnits = (unitsByDay[day] ||= {});
    for (const pid in u) dayUnits[pid] = (dayUnits[pid] || 0) + u[pid];

    // paires (produits distincts de la commande)
    const prods = Array.from(orderProducts[orderId]).sort();
    if (prods.length >= 2) {
      const dayPairs = (pairsByDay[day] ||= {});
      for (let i = 0; i < prods.length; i++) {
        for (let j = i + 1; j < prods.length; j++) {
          const key = prods[i] + "|" + prods[j];
          dayPairs[key] = (dayPairs[key] || 0) + 1;
        }
      }
    }
  }

  // Élagage : on garde les paires les plus fréquentes de chaque jour.
  for (const day in pairsByDay) {
    const entries = Object.entries(pairsByDay[day]);
    if (entries.length > MAX_PAIRS_PER_DAY) {
      entries.sort((a, b) => b[1] - a[1]);
      pairsByDay[day] = Object.fromEntries(entries.slice(0, MAX_PAIRS_PER_DAY));
    }
  }

  return { coveredFrom: minDay, coveredTo: maxDay, titles, unitsByDay, pairsByDay };
}

// Calcule le top produits et le top des paires sur une plage [from, to] (inclus).
export function computeTop(
  data: ProductsData,
  from: string,
  to: string,
  topProducts = 30,
  topPairs = 100
) {
  const units: Record<string, number> = {};
  const pairs: Record<string, number> = {};

  for (const day in data.unitsByDay) {
    if (day < from || day > to) continue;
    const du = data.unitsByDay[day];
    for (const pid in du) units[pid] = (units[pid] || 0) + du[pid];
  }
  for (const day in data.pairsByDay) {
    if (day < from || day > to) continue;
    const dp = data.pairsByDay[day];
    for (const k in dp) pairs[k] = (pairs[k] || 0) + dp[k];
  }

  const products = Object.entries(units)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topProducts)
    .map(([pid]) => ({ title: data.titles[pid] || pid }));

  const pairList = Object.entries(pairs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topPairs)
    .map(([key]) => {
      const [a, b] = key.split("|");
      return { a: data.titles[a] || a, b: data.titles[b] || b };
    });

  return { products, pairs: pairList };
}
