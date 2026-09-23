"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const SearchesMap = dynamic(() => import("./SearchesMap"), { ssr: false });

function formatFr(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n);
}
function formatDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}
function haversineKm(a: number, b: number, x: number, y: number) {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(x - a), dLon = r(y - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(x)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const RADII = [1, 5, 10, 20, 30, 50];

function Maj({ iso }: { iso: string | null }) {
  return <p className="maj">Dernière mise à jour : {formatDate(iso)}</p>;
}

/* ---------- animations ---------- */
type Anim = { date: string; label: string; details: string[] };
type AnimResp = { configured: false } | { configured: true; enCours: Anim[]; aVenir: Anim[] };

function Animations() {
  const [data, setData] = useState<AnimResp | null>(null);
  useEffect(() => {
    fetch("/api/animations").then((r) => r.json()).then(setData).catch(() => setData({ configured: false }));
  }, []);
  if (!data || data.configured === false) return null;
  if (data.enCours.length === 0 && data.aVenir.length === 0) return null;
  const gwp = (a: Anim) => (a.details[0] ? <div className="anim-gwp">GWP : {a.details[0]}</div> : null);
  return (
    <section className="anim-panel">
      <h2 className="section-title">Animations en cours</h2>
      {data.enCours.length > 0 ? (
        <ul className="anim-list">
          {data.enCours.map((a, i) => (
            <li key={i} className="anim-row">
              <span className="anim-dot" aria-hidden />
              <div>
                <div className="anim-label">{a.label}</div>
                {gwp(a)}
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
                  {gwp(a)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------- proximité clients ---------- */
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
    if (clean.length < 4) { setError("Saisir un code postal à 5 chiffres."); setResult(null); return; }
    setLoading(true); setError(null); setNotReady(null);
    try {
      const p = new URLSearchParams({ cp: clean, km: String(km) });
      if (code) p.set("code", code);
      const res = await fetch(`/api/proximite?${p}`);
      const data = await res.json();
      if ("error" in data) { setError(data.error); setResult(null); }
      else if (data.ready === false) { setNotReady(data.message); setResult(null); }
      else setResult(data);
    } catch { setError("Serveur momentanément indisponible."); }
    finally { setLoading(false); }
  }

  return (
    <section className="card-section">
      <h2 className="section-title">Clients BtoC autour d&apos;un code postal</h2>
      <p className="lede">
        Saisir le code postal du point de vente prospecté pour obtenir le nombre de clients du site
        Endro résidant dans le rayon choisi.
      </p>
      <div className="controls">
        <div className="row">
          <div>
            <label htmlFor="cp1">Code postal</label>
            <input id="cp1" type="text" inputMode="numeric" placeholder="16430" value={cp} maxLength={5}
              onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && search()} />
          </div>
          <div>
            <label>Rayon</label>
            <div className="radiuspicker">
              {RADII.map((r) => (
                <button key={r} type="button" className="chip" aria-pressed={km === r} onClick={() => setKm(r)}>{r} km</button>
              ))}
            </div>
          </div>
        </div>
        <button className="go" onClick={search} disabled={loading}>{loading ? "Recherche…" : "Rechercher"}</button>
      </div>
      {error && <div className="msg error">{error}</div>}
      {notReady && <div className="msg">{notReady}</div>}
      {result && (
        <div className="result">
          <div className="bignum">{formatFr(result.count)}</div>
          <p className="caption">
            client{result.count > 1 ? "s" : ""} à moins de <strong>{result.km} km</strong> du <strong>{result.cp}</strong>.
          </p>
          {result.nearby?.length > 0 && (
            <div className="nearby">
              <h2>Répartition par code postal</h2>
              <ul>
                {result.nearby.map((e: NearbyEntry) => (
                  <li key={e.cp}><span className="cp">{e.cp}</span><span className="dist">{e.km} km</span><span className="n">{formatFr(e.count)}</span></li>
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

/* ---------- produits ---------- */
function Produits({ code }: { code: string }) {
  const [period, setPeriod] = useState("365");
  const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const p = new URLSearchParams();
    if (custom && from && to) { p.set("from", from); p.set("to", to); } else p.set("period", period);
    if (code) p.set("code", code);
    const res = await fetch(`/api/produits?${p}`);
    const d = await res.json();
    if (d.error) { setMsg(d.error); setData(null); }
    else if (d.ready === false) { setMsg(d.message); setData(null); }
    else { setMsg(null); setData(d); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period, custom, from, to]);

  return (
    <section className="card-section">
      <h2 className="section-title">Produits</h2>
      <div className="periodpicker">
        {["30", "90", "365"].map((d) => (
          <button key={d} type="button" className="chip" aria-pressed={!custom && period === d}
            onClick={() => { setCustom(false); setPeriod(d); }}>{d} j</button>
        ))}
        <button type="button" className="chip" aria-pressed={custom} onClick={() => setCustom(true)}>Dates précises</button>
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
            <ol className="ranklist">{data.topProducts.map((p: any, i: number) => <li key={i}>{p.title}</li>)}</ol>
          </div>
          <div>
            <h3 className="sub">Top 100 des produits vendus ensemble</h3>
            <ol className="ranklist pairs">
              {data.topPairs.map((p: any, i: number) => (
                <li key={i}><span>{p.a}</span><span className="plus">+</span><span>{p.b}</span></li>
              ))}
            </ol>
          </div>
        </div>
      )}
      {data && <Maj iso={data.updatedAt} />}
    </section>
  );
}

/* ---------- recherches Stockist ---------- */
function Recherches({ code }: { code: string }) {
  const [data, setData] = useState<any>(null);
  const [cp, setCp] = useState("");
  const [km, setKm] = useState(10);
  const [focus, setFocus] = useState<any>(null);
  const [zone, setZone] = useState<any>(null);

  useEffect(() => {
    const p = new URLSearchParams();
    if (code) p.set("code", code);
    fetch(`/api/searches?${p}`).then((r) => r.json()).then(setData).catch(() => {});
  }, [code]);

  function locate() {
    const clean = cp.replace(/\D/g, "");
    if (clean.length !== 5 || !data) return;
    const center = data.zones.find((z: any) => z.cp === clean);
    if (!center) { setZone({ cp: clean, missing: true }); return; }
    let n = 0, noResult = 0;
    for (const z of data.zones) {
      if (haversineKm(center.lat, center.lng, z.lat, z.lng) <= km) { n += z.n; noResult += z.noResult; }
    }
    setZone({ cp: clean, km, n, noResult });
    setFocus({ lat: center.lat, lng: center.lng, km });
  }

  return (
    <section className="card-section">
      <h2 className="section-title">Recherches store locator par zone</h2>
      <p className="lede">
        Où les visiteurs cherchent un point de vente Endro sur le site. Une recherche « sans résultat »
        signifie qu&apos;aucun point de vente n&apos;a été trouvé à proximité : beaucoup de recherches et
        beaucoup de « sans résultat » dans une zone, c&apos;est une zone blanche à prospecter.
      </p>

      <div className="controls">
        <div className="row">
          <div>
            <label htmlFor="cp2">Code postal</label>
            <input id="cp2" type="text" inputMode="numeric" placeholder="35000" value={cp} maxLength={5}
              onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && locate()} />
          </div>
          <div>
            <label>Rayon</label>
            <div className="radiuspicker">
              {RADII.map((r) => (
                <button key={r} type="button" className="chip" aria-pressed={km === r} onClick={() => setKm(r)}>{r} km</button>
              ))}
            </div>
          </div>
        </div>
        <button className="go" onClick={locate}>Rechercher</button>
      </div>

      {zone && (
        <div className="msg">
          {zone.missing ? (
            `Aucune recherche rattachée au ${zone.cp}.`
          ) : (
            <>
              {formatFr(zone.n)} recherche{zone.n > 1 ? "s" : ""} à moins de {zone.km} km du {zone.cp}, dont{" "}
              <span className="nr">{formatFr(zone.noResult)} sans point de vente trouvé à proximité</span>.
            </>
          )}
        </div>
      )}

      {data && data.zones && (
        <>
          <div className="legend" style={{ marginTop: 18 }}>
            <span className="key"><span className="swatch demand" /> Demande (recherches)</span>
            <span className="key"><span className="swatch white" /> Zone blanche (beaucoup de recherches sans résultat)</span>
          </div>
          <SearchesMap zones={data.zones} focus={focus} />
          <div className="nearby">
            <h2>Top 10 des zones les plus recherchées</h2>
            <ul className="searchtable">
              <li className="head">
                <span className="cp">Code postal</span>
                <span className="city">Ville</span>
                <span className="n">Recherches</span>
                <span className="nr">Sans résultat</span>
              </li>
              {data.zones.slice(0, 10).map((z: any) => (
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
    <>
      <header className="topbar">
        <div className="topbar-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/endro-logo.png" alt="Endro" />
          <h1 className="dash-title">DASHBOARD BTOC DP</h1>
        </div>
      </header>

      <main className="wrap">
        <p className="coverage">Données depuis le 23 septembre 2025.</p>

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
    </>
  );
}
