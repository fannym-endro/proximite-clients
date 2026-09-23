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
const COL_DETAILS = ["cadeau contre achat (gwp)"];

function deburr(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
    const findCols = (names: string[]) =>
      header
        .map((h, i) => (names.includes(h) ? i : -1))
        .filter((i) => i >= 0);

    const iDate = findCol(COL_DATE);
    const iLabel = findCol(COL_LABEL);
    const iDetails = findCols(COL_DETAILS);
    if (iDate < 0 || iLabel < 0) return NextResponse.json({ configured: false });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const inDays = (dt: Date, n: number) => {
      const diff = (dt.getTime() - today.getTime()) / 86400000;
      return diff >= 0 && diff <= n;
    };

    type Row = { dt: Date; label: string; details: string[] };
    const enCours: Row[] = [];
    const aVenir: Row[] = [];

    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const dt = parseDate(cells[iDate] || "");
      if (!dt) continue;
      const label = (cells[iLabel] || "").trim();
      const details = iDetails
        .map((i) => (cells[i] || "").trim())
        .filter(Boolean);
      if (!label && details.length === 0) continue;

      const diff = (dt.getTime() - today.getTime()) / 86400000;
      if (diff >= -3 && diff <= 0) {
        enCours.push({ dt, label: label || details[0], details: label ? details : details.slice(1) });
      } else if (inDays(dt, 30)) {
        aVenir.push({ dt, label: label || details[0], details: label ? details : details.slice(1) });
      }
    }

    // Dédoublonnage par libellé, en gardant la 1re occurrence.
    const dedupe = (arr: Row[]) => {
      const seen = new Set<string>();
      const out: Row[] = [];
      for (const x of arr) {
        const k = x.label.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(x);
      }
      return out;
    };

    return NextResponse.json({
      configured: true,
      enCours: dedupe(enCours).map((x) => ({
        date: fmt(x.dt),
        label: x.label,
        details: x.details,
      })),
      aVenir: dedupe(aVenir)
        .sort((a, b) => a.dt.getTime() - b.dt.getTime())
        .slice(0, 6)
        .map((x) => ({ date: fmt(x.dt), label: x.label, details: x.details })),
    });
  } catch {
    return NextResponse.json({ configured: false });
  }
}
