// --- Authentification Shopify (client_credentials grant) + Bulk Operations ---

const SHOP = process.env.SHOPIFY_SHOP!;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;
const VERSION = process.env.SHOPIFY_API_VERSION || "2025-01";

function endpoint() {
  return `https://${SHOP}/admin/api/${VERSION}/graphql.json`;
}

let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Auth Shopify HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const token = json.access_token as string | undefined;
  if (!token) throw new Error(`Auth Shopify : pas de access_token (${JSON.stringify(json)})`);
  const ttl = typeof json.expires_in === "number" ? json.expires_in : 120;
  tokenCache = { token, exp: Date.now() + Math.max(10, ttl - 30) * 1000 };
  return token;
}

async function callGraphql(token: string, query: string, variables?: Record<string, unknown>) {
  return fetch(endpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
}

async function adminGraphql<T = any>(query: string, variables?: Record<string, unknown>): Promise<T> {
  let token = await getAccessToken();
  let res = await callGraphql(token, query, variables);
  if (res.status === 401) {
    tokenCache = null;
    token = await getAccessToken();
    res = await callGraphql(token, query, variables);
  }
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data as T;
}

// --- Requêtes bulk ---

// Clients : code postal (pour le comptage par zone).
export const CUSTOMERS_QUERY = `
  { customers { edges { node { id defaultAddress { zip countryCodeV2 } } } } }
`;

// Commandes des N derniers jours : date + lignes produits (pour top produits et paires).
export function ordersQuery(sinceDays = 400): string {
  const d = new Date();
  d.setDate(d.getDate() - sinceDays);
  const since = d.toISOString().slice(0, 10);
  return `
    {
      orders(query: "created_at:>=${since}") {
        edges {
          node {
            id
            createdAt
            lineItems {
              edges { node { quantity product { id title } } }
            }
          }
        }
      }
    }
  `;
}

export type BulkOp = {
  id: string;
  status: string;
  errorCode: string | null;
  objectCount: string;
  url: string | null;
  type: string;
  query: string | null;
  createdAt: string;
};

export async function getCurrentBulkOperation(): Promise<BulkOp | null> {
  const data = await adminGraphql<{ currentBulkOperation: BulkOp | null }>(`
    { currentBulkOperation(type: QUERY) {
        id status errorCode objectCount url type query createdAt
    } }
  `);
  return data.currentBulkOperation;
}

export async function startBulkQuery(query: string): Promise<BulkOp> {
  const data = await adminGraphql<{
    bulkOperationRunQuery: {
      bulkOperation: BulkOp | null;
      userErrors: { field: string[]; message: string }[];
    };
  }>(
    `
    mutation bulkRun($q: String!) {
      bulkOperationRunQuery(query: $q) {
        bulkOperation { id status errorCode objectCount url type query createdAt }
        userErrors { field message }
      }
    }
  `,
    { q: query }
  );
  const { bulkOperation, userErrors } = data.bulkOperationRunQuery;
  if (userErrors?.length) throw new Error(`bulkOperationRunQuery: ${JSON.stringify(userErrors)}`);
  if (!bulkOperation) throw new Error("bulkOperationRunQuery: aucune opération renvoyée");
  return bulkOperation;
}

export async function fetchBulkText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Téléchargement JSONL: HTTP ${res.status}`);
  return res.text();
}
