import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// URL d'une version publiée en CSV de la Google Sheet des animations
// (File → Partager → Publier sur le web → format CSV). Voir le README :
// publie une vue ne contenant QUE les colonnes calendrier, jamais les colonnes
// financières.
const CSV_URL = process.env.ANIM_CSV_URL;

// Colonnes du planning qu'on cherche à afficher (insensible à la casse/accents).
const COL_DATE = ["date"];
const COL_LABEL = ["animation"];
const COL_GWP = ["cadeau contre achat (gwp)"];
const COL_OFFRE = ["offre speciale"];
// Colonne W « Details » : on y lit la présence de « Choose ».
const COL_CHANNEL = ["details", "detail"];

function deburr(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

// Parseur CSV minimal gérant les champs entre guillemets (valeurs à virgules).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // ignore
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function parseDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  return isNaN(dt.getTime()) ? null : dt;
}

function fmt(dt: Date) {
  return dt.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
  });
}

export async function GET() {
  if (!CSV_URL) return NextResponse.json({ configured: false });

  try {
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ configured: false });
    const rows = parseCsv(await res.text());
    if (rows.length < 2) return NextResponse.json({ configured: false });

    const header = rows[0].map(deburr);
    const findCol = (names: string[]) =>
      header.findIndex((h) => names.includes(h));

    const iDate = findCol(COL_DATE);
    const iLabel = findCol(COL_LABEL);
    const iGwp = findCol(COL_GWP);
    const iOffre = findCol(COL_OFFRE);
    const iChannel = findCol(COL_CHANNEL); // colonne W « Details »
    if (iDate < 0 || iLabel < 0) return NextResponse.json({ configured: false });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inDays = (dt: Date, n: number) => {
      const diff = (dt.getTime() - today.getTime()) / 86400000;
      return diff >= 0 && diff <= n;
    };

    type Extra = { label: string; value: string };
    type Row = { dt: Date; label: string; extras: Extra[]; choose: boolean };
    const enCours: Row[] = [];
    const aVenir: Row[] = [];

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const dt = parseDate(cells[iDate] || "");
      if (!dt) continue;
      const label = (cells[iLabel] || "").trim();
      const gwp = iGwp >= 0 ? (cells[iGwp] || "").trim() : "";
      const offre = iOffre >= 0 ? (cells[iOffre] || "").trim() : "";
      const extras: Extra[] = [];
      if (gwp) extras.push({ label: "GWP", value: gwp });
      if (offre) extras.push({ label: "Offre", value: offre });

      // « Choose » présent dans la colonne Details de la journée ?
      const hasChoose =
        iChannel >= 0 && /choose/.test(deburr(cells[iChannel] || ""));

      if (!label && extras.length === 0 && !hasChoose) continue;

      const baseLabel = label || extras[0]?.value || "";
      // Si la journée n'a que « Choose » (ni animation ni offre), on l'affiche en libellé.
      const finalLabel = baseLabel || "Vente Choose";
      // Badge « Choose » dès qu'il y a déjà un libellé à côté.
      const choose = hasChoose && baseLabel !== "";
      const finalExtras = label ? extras : extras.slice(1);

      const diff = (dt.getTime() - today.getTime()) / 86400000;
      if (diff >= -3 && diff <= 0) {
        enCours.push({ dt, label: finalLabel, extras: finalExtras, choose });
      } else if (inDays(dt, 30)) {
        aVenir.push({ dt, label: finalLabel, extras: finalExtras, choose });
      }
    }

    // Dédoublonnage par libellé : on garde la 1re occurrence, mais on
    // conserve le badge Choose si l'un des jours de cette animation l'avait.
    const dedupe = (arr: Row[]) => {
      const map = new Map<string, Row>();
      for (const x of arr) {
        const k = x.label.toLowerCase();
        const ex = map.get(k);
        if (!ex) map.set(k, { ...x });
        else if (x.choose) ex.choose = true;
      }
      return [...map.values()];
    };

    return NextResponse.json({
      configured: true,
      enCours: dedupe(enCours).map((x) => ({
        date: fmt(x.dt),
        label: x.label,
        extras: x.extras,
        choose: x.choose,
      })),
      aVenir: dedupe(aVenir)
        .sort((a, b) => a.dt.getTime() - b.dt.getTime())
        .slice(0, 6)
        .map((x) => ({
          date: fmt(x.dt),
          label: x.label,
          extras: x.extras,
          choose: x.choose,
        })),
    });
  } catch {
    return NextResponse.json({ configured: false });
  }
}
