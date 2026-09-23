"use client";

import { useEffect, useState } from "react";
import { upload } from "@vercel/blob/client";

export default function Admin() {
  const [code, setCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);

  useEffect(() => {
    const s = localStorage.getItem("endro_admin_code");
    if (s) setCode(s);
  }, []);

  async function run() {
    if (!file) {
      setStatus("Choisir le fichier CSV exporté depuis Stockist.");
      return;
    }
    if (!code) {
      setStatus("Renseigner le code d'accès admin.");
      return;
    }
    setBusy(true);
    setStatus("Envoi du fichier…");
    setDone(null);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/searches/upload-url",
        clientPayload: code,
      });
      setStatus("Traitement des recherches…");
      const res = await fetch("/api/searches/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: blob.url, code }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "échec de l'ingestion");
      localStorage.setItem("endro_admin_code", code);
      setDone(data);
      setStatus(null);
    } catch (err: any) {
      setStatus("Erreur : " + (err?.message ?? String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <header className="dash-header">
        <span className="brand">Endro</span>
        <h1 className="dash-title">Administration</h1>
      </header>

      <section className="card-section">
        <h2 className="section-title">Mettre à jour les recherches Stockist</h2>
        <p className="lede">
          Une fois par mois, exporter le tableur des recherches depuis la page
          Analytics de Stockist, puis le déposer ici. Les recherches par zone sont
          recalculées immédiatement.
        </p>

        <div className="controls">
          <div>
            <label htmlFor="admincode">Code d&apos;accès admin</label>
            <input
              id="admincode"
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="file">Fichier CSV Stockist</label>
            <input
              id="file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button className="go" onClick={run} disabled={busy}>
            {busy ? "En cours…" : "Mettre à jour"}
          </button>
        </div>

        {status && <div className="msg">{status}</div>}
        {done && (
          <div className="msg">
            {new Intl.NumberFormat("fr-FR").format(done.totalSearches)} recherches
            rattachées, sur {done.distinctPostalCodes} codes postaux, période{" "}
            {done.coveredFrom} → {done.coveredTo}. Recherches à jour.
          </div>
        )}
      </section>
    </main>
  );
}
