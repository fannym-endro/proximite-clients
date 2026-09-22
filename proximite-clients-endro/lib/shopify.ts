import { normalizeCp, getCentroid } from "@/lib/geo";

const DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

function endpoint() {
  return `https://${DOMAIN}/admin/api/${VERSION}/graphql.json`;
}

async function adminGraphql<T = any>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": TOKEN,
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Shopify HTTP ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
  }
  return json.data as T;
}

// Requête bulk : le code postal + le pays de chaque client.
const BULK_QUERY = `
  {
    customers {
      edges {
        node {
          id
          defaultAddress { zip countryCodeV2 }
        }
      }
    }
  }
`;

export type BulkOp = {
  id: string;
  status: string; // CREATED | RUNNING | COMPLETED | FAILED | CANCELED ...
  errorCode: string | null;
  objectCount: string;
  url: string | null;
  type: string; // QUERY | MUTATION
  createdAt: string;
};

export async function getCurrentBulkOperation(): Promise<BulkOp | null> {
  const data = await adminGraphql<{ currentBulkOperation: BulkOp | null }>(`
    {
      currentBulkOperation(type: QUERY) {
        id status errorCode objectCount url type createdAt
      }
    }
  `);
  return data.currentBulkOperation;
}

export async function startBulkOperation(): Promise<BulkOp> {
  const data = await adminGraphql<{
    bulkOperationRunQuery: {
      bulkOperation: BulkOp | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    `
    mutation bulkRun($q: String!) {
      bulkOperationRunQuery(query: $q) {
        bulkOperation { id status errorCode objectCount url type createdAt }
        userErrors { field message }
      }
    }
  `,
    { q: BULK_QUERY }
  );
  const { bulkOperation, userErrors } = data.bulkOperationRunQuery;
  if (userErrors?.length) {
    throw new Error(`bulkOperationRunQuery: ${JSON.stringify(userErrors)}`);
  }
  if (!bulkOperation) throw new Error("bulkOperationRunQuery: aucune opération renvoyée");
  return bulkOperation;
}

// Télécharge le JSONL du bulk terminé et agrège les clients par code postal.
export async function aggregateFromBulkUrl(url: string): Promise<{
  counts: Record<string, number>;
  totalCustomers: number;
}> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Téléchargement JSONL: HTTP ${res.status}`);
  const text = await res.text();

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
    // On ne compte que les codes postaux connus (France métro + DOM du référentiel).
    if (!getCentroid(cp)) continue;
    counts[cp] = (counts[cp] || 0) + 1;
    total += 1;
  }
  return { counts, totalCustomers: total };
}
