"use client";

import { useEffect, useState } from "react";

type NearbyEntry = { cp: string; count: number; km: number };
type ApiOk = {
  ready: true;
  cp: string;
  km: number;
  count: number;
  updatedAt: string;
  totalCustomers: number;
  nearby: NearbyEntry[];
};
type ApiNotReady = { ready: false; message: string };
type ApiErr = { error: string };

const RADII = [5, 10, 20, 30, 50];

function formatFr(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}
function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function Page() {
  const [cp, setCp] = useState("");
  const [km, setKm] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiOk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("endro_access_code");
    if (saved) setCode(saved);
  }, []);

  async function search() {
    const clean = cp.replace(/\D/g, "");
    if (clean.length < 4) {
      setError("Entre un code postal à 5 chiffres.");
      setResult(null);
      setNotReady(null);
      return;
    }
    setLoading(true);
    setError(null);
    setNotReady(null);
    try {
      const params = new URLSearchParams({ cp: clean, km: String(km) });
      if (code) params.set("code", code);
      const res = await fetch(`/api/proximite?${params.toString()}`);
      const data: ApiOk | ApiNotReady | ApiErr = await res.json();

      if (res.status === 401) {
        setNeedCode(true);
        setError("Code d'accès requis ou invalide.");
        setResult(null);
        return;
      }
      if ("error" in data) {
        setError(data.error);
        setResult(null);
        return;
      }
      if (data.ready === false) {
        setNotReady(data.message);
        setResult(null);
        return;
      }
      setResult(data);
      if (code) localStorage.setItem("endro_access_code", code);
    } catch {
      setError("Impossible de contacter le serveur. Réessaie dans un instant.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") search();
  }

  return (
    <main className="wrap">
      <div className="masthead">
        <span className="brand">Endro</span>
        <span className="sep">·</span>
        <span className="kicker">Potentiel client par zone</span>
      </div>

      <h1>Combien de clients autour d&apos;un prospect ?</h1>
      <p className="lede">
        Entre le code postal du point de vente que tu prospectes. Tu obtiens le
        nombre de clients du site Endro qui habitent dans le rayon choisi — de
        quoi chiffrer le potentiel d&apos;un référencement.
      </p>

      <div className="controls">
        <div className="row">
          <div>
            <label htmlFor="cp">Code postal du prospect</label>
            <input
              id="cp"
              type="text"
              inputMode="numeric"
              placeholder="16430"
              value={cp}
              maxLength={5}
              onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))}
              onKeyDown={onKeyDown}
            />
          </div>
          <div>
            <label>Rayon</label>
            <div className="radiuspicker">
              {RADII.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="chip"
                  aria-pressed={km === r}
                  onClick={() => setKm(r)}
                >
                  {r} km
                </button>
              ))}
            </div>
          </div>
        </div>

        <button className="go" onClick={search} disabled={loading}>
          {loading ? "Calcul…" : "Compter les clients"}
        </button>

        <details className="codegate" open={needCode}>
          <summary>Code d&apos;accès</summary>
          <input
            type="text"
            placeholder="code d'équipe"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </details>
      </div>

      {error && <div className="msg error">{error}</div>}
      {notReady && <div className="msg">{notReady}</div>}

      {result && (
        <section className="result">
          <div className="bignum">{formatFr(result.count)}</div>
          <p className="caption">
            client{result.count > 1 ? "s" : ""} Endro à moins de{" "}
            <strong>{result.km} km</strong> du <strong>{result.cp}</strong>.
          </p>

          {result.nearby.length > 0 && (
            <div className="nearby">
              <h2>Répartition par code postal</h2>
              <ul>
                {result.nearby.map((e) => (
                  <li key={e.cp}>
                    <span className="cp">{e.cp}</span>
                    <span className="dist">{e.km} km</span>
                    <span className="n">{formatFr(e.count)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="note">
            Données à jour au {formatDate(result.updatedAt)}. Distances calculées
            depuis le centre de chaque code postal.
          </p>
        </section>
      )}
    </main>
  );
}
