"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const SearchesMap = dynamic(() => import("./SearchesMap"), { ssr: false });

/* ---------- utilitaires ---------- */
function formatFr(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
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
function haversineKm(a: number, b: number, x: number, y: number) {
  const R = 6371,
    r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(x - a),
    dLon = r(y - b);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(r(a)) * Math.cos(r(x)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const RADII = [5, 10, 20, 30, 50];

function Maj({ iso }: { iso: string | null }) {
  return <p className="maj">Dernière mise à jour : {formatDate(iso)}</p>;
}

/* ---------- encart animations ---------- */
type Anim = { date: string; label: string; details: string[] };
type AnimResp =
  | { configured: false }
  | { configured: true; enCours: Anim[]; aVenir: Anim[] };

function Animations() {
  const [data, setData] = useState<AnimResp | null>(null);
  useEffect(() => {
    fetch("/api/animations").then((r) => r.json()).then(setData).catch(() => setData({ configured: false }));
  }, []);
  if (!data || data.configured === false) return null;
  if (data.enCours.length === 0 && data.aVenir.length === 0) return null;
  return (
    <section className="anim-panel">
      <h2 className="section-title">Animations en cours</h2>
      {data.enCours.length > 0 ? (
        <ul className="anim-list">
          {data.enCours.map((a, i) => (
            <li key={i} className="anim-row live">
              <span className="anim-dot" aria-hidden />
              <div>
                <div className="anim-label">{a.label}</div>
                {a.details.length > 0 && <div className="anim-details">{a.details.join(" · ")}</div>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="anim-empty">Aucune animation active aujourd&apos;hui.</p>
      )}
      {data.aVenir.length > 0 && (
        <div className="anim-next">
          <h3>À venir</h3>
          <ul className="anim-list">
            {data.aVenir.map((a, i) => (
              <li key={i} className="anim-row">
                <span className="anim-date">{a.date}</span>
                <div>
                  <div className="anim-label">{a.label}</div>
                  {a.details.length > 0 && <div className="anim-details">{a.details.join(" · ")}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------- section proximité clients ---------- */
type NearbyEntry = { cp: string; count: number; km: number };
function Proximite({ code }: { code: string }) {
  const [cp, setCp] = useState("");
  const [km, setKm] = useState(10);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState<string | null>(null);

  async function search() {
    const clean = cp.replace(/\D/g, "");
    if (clean.length < 4) {
      setError("Saisir un code postal à 5 chiffres.");
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    setNotReady(null);
    try {
      const p = new URLSearchParams({ cp: clean, km: String(km) });
      if (code) p.set("code", code);
      const res = await fetch(`/api/proximite?${p}`);
      const data = await res.json();
      if ("error" in data) {
        setError(data.error);
        setResult(null);
      } else if (data.ready === false) {
        setNotReady(data.message);
        setResult(null);
      } else setResult(data);
    } catch {
      setError("Serveur momentanément indisponible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card-section">
      <h2 className="section-title">Nombre de clients / prospect BtoC autour d&apos;un code postal</h2>
      <p className="lede">
        Saisir le code postal du point de vente prospecté pour obtenir le nombre de clients du site
        Endro résidant dans le rayon choisi.
      </p>
      <div className="controls">
        <div className="row">
          <div>
            <label htmlFor="cp1">Code postal</label>
            <input id="cp1" type="text" inputMode="numeric" placeholder="16430" value={cp} maxLength={5}
              onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && search()} />
          </div>
          <div>
            <label>Rayon</label>
            <div className="radiuspicker">
              {RADII.map((r) => (
                <button key={r} type="button" className="chip" aria-pressed={km === r} onClick={() => setKm(r)}>
                  {r} km
                </button>
              ))}
            </div>
          </div>
        </div>
        <button className="go" onClick={search} disabled={loading}>
          {loading ? "Recherche…" : "Rechercher"}
        </button>
      </div>
      {error && <div className="msg error">{error}</div>}
      {notReady && <div className="msg">{notReady}</div>}
      {result && (
        <div className="result">
          <div className="bignum">{formatFr(result.count)}</div>
          <p className="caption">
            client{result.count > 1 ? "s" : ""} à moins de <strong>{result.km} km</strong> du{" "}
            <strong>{result.cp}</strong>.
          </p>
          {result.nearby?.length > 0 && (
            <div className="nearby">
              <h2>Répartition par code postal</h2>
              <ul>
                {result.nearby.map((e: NearbyEntry) => (
                  <li key={e.cp}>
                    <span className="cp">{e.cp}</span>
                    <span className="dist">{e.km} km</span>
                    <span className="n">{formatFr(e.count)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Maj iso={result.updatedAt} />
        </div>
      )}
    </section>
  );
}

/* ---------- section produits ---------- */
function Produits({ code }: { code: string }) {
  const [period, setPeriod] = useState<string>("365");
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const p = new URLSearchParams();
    if (custom && from && to) {
      p.set("from", from);
      p.set("to", to);
    } else p.set("period", period);
    if (code) p.set("code", code);
    const res = await fetch(`/api/produits?${p}`);
    const d = await res.json();
    if (d.error) {
      setMsg(d.error);
      setData(null);
    } else if (d.ready === false) {
      setMsg(d.message);
      setData(null);
    } else {
      setMsg(null);
      setData(d);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, custom, from, to]);

  return (
    <section className="card-section">
      <h2 className="section-title">Produits</h2>
      <div className="periodpicker">
        {["30", "90", "365"].map((d) => (
          <button key={d} type="button" className="chip" aria-pressed={!custom && period === d}
            onClick={() => { setCustom(false); setPeriod(d); }}>
            {d} j
          </button>
        ))}
        <button type="button" className="chip" aria-pressed={custom} onClick={() => setCustom(true)}>
          Dates précises
        </button>
        {custom && (
          <span className="daterange">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>→</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </span>
        )}
      </div>

      {msg && <div className="msg">{msg}</div>}

      {data && (
        <div className="prod-grid">
          <div>
            <h3 className="sub">Top produits</h3>
            <ol className="ranklist">
              {data.topProducts.map((p: any, i: number) => (
                <li key={i}>{p.title}</li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="sub">Top 100 des produits vendus ensemble</h3>
            <ol className="ranklist pairs">
              {data.topPairs.map((p: any, i: number) => (
                <li key={i}>
                  <span>{p.a}</span>
                  <span className="plus">+</span>
                  <span>{p.b}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      {data && <Maj iso={data.updatedAt} />}
    </section>
  );
}

/* ---------- section recherches Stockist ---------- */
function Recherches({ code }: { code: string }) {
  const [data, setData] = useState<any>(null);
  const [cp, setCp] = useState("");
  const [km, setKm] = useState(10);
  const [focus, setFocus] = useState<any>(null);
  const [zoneTotal, setZoneTotal] = useState<any>(null);

  useEffect(() => {
    const p = new URLSearchParams();
    if (code) p.set("code", code);
    fetch(`/api/searches?${p}`).then((r) => r.json()).then(setData).catch(() => {});
  }, [code]);

  function locate() {
    const clean = cp.replace(/\D/g, "");
    if (clean.length !== 5 || !data) return;
    const self = data.zones.find((z: any) => z.cp === clean);
    // centre : le code postal cherché s'il est dans les zones, sinon on cherche ses coords
    const center = self || data.zones.find((z: any) => z.cp === clean);
    if (!center) {
      setZoneTotal({ cp: clean, km, n: 0, noResult: 0, missing: true });
      return;
    }
    let n = 0, noResult = 0;
    for (const z of data.zones) {
      if (haversineKm(center.lat, center.lng, z.lat, z.lng) <= km) {
        n += z.n;
        noResult += z.noResult;
      }
    }
    setZoneTotal({ cp: clean, km, n, noResult });
    setFocus({ lat: center.lat, lng: center.lng, km });
  }

  return (
    <section className="card-section">
      <h2 className="section-title">Recherches store locator par zone</h2>
      <p className="lede">
        Où les visiteurs cherchent un point de vente Endro. Les zones en rouge concentrent beaucoup de
        recherches sans résultat à proximité — des zones blanches à prospecter.
      </p>

      <div className="controls">
        <div className="row">
          <div>
            <label htmlFor="cp2">Code postal</label>
            <input id="cp2" type="text" inputMode="numeric" placeholder="35000" value={cp} maxLength={5}
              onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && locate()} />
          </div>
          <div>
            <label>Rayon</label>
            <div className="radiuspicker">
              {RADII.map((r) => (
                <button key={r} type="button" className="chip" aria-pressed={km === r} onClick={() => setKm(r)}>
                  {r} km
                </button>
              ))}
            </div>
          </div>
        </div>
        <button className="go" onClick={locate}>Rechercher</button>
      </div>

      {zoneTotal && (
        <div className="msg">
          {zoneTotal.missing
            ? `Aucune recherche rattachée au ${zoneTotal.cp}.`
            : `${formatFr(zoneTotal.n)} recherche${zoneTotal.n > 1 ? "s" : ""} à moins de ${zoneTotal.km} km du ${zoneTotal.cp}${zoneTotal.noResult ? ` · dont ${formatFr(zoneTotal.noResult)} sans résultat` : ""}.`}
        </div>
      )}

      {data && data.zones && (
        <>
          <SearchesMap zones={data.zones} focus={focus} />
          <div className="nearby">
            <h2>Zones les plus recherchées</h2>
            <ul className="searchtable">
              <li className="head">
                <span className="cp">Code postal</span>
                <span className="city">Ville</span>
                <span className="n">Recherches</span>
                <span className="nr">Sans résultat</span>
              </li>
              {data.zones.slice(0, 60).map((z: any) => (
                <li key={z.cp}>
                  <span className="cp">{z.cp}</span>
                  <span className="city">{z.city}</span>
                  <span className="n">{formatFr(z.n)}</span>
                  <span className="nr">{formatFr(z.noResult)}</span>
                </li>
              ))}
            </ul>
          </div>
          <Maj iso={data.updatedAt} />
        </>
      )}
    </section>
  );
}

/* ---------- page ---------- */
export default function Page() {
  const [code, setCode] = useState("");
  useEffect(() => {
    const s = localStorage.getItem("endro_access_code");
    if (s) setCode(s);
  }, []);

  return (
    <main className="wrap">
      <header className="dash-header">
        <span className="brand">Endro</span>
        <h1 className="dash-title">DASHBOARD BTOC DP</h1>
      </header>

      <Animations />
      <Proximite code={code} />
      <Produits code={code} />
      <Recherches code={code} />

      <details className="codegate">
        <summary>Code d&apos;accès</summary>
        <input type="text" placeholder="code d'équipe" value={code}
          onChange={(e) => { setCode(e.target.value); localStorage.setItem("endro_access_code", e.target.value); }} />
      </details>
    </main>
  );
}
