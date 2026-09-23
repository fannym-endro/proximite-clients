"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const SearchesMap = dynamic(() => import("./SearchesMap"), { ssr: false });

function formatFr(n: number) { return new Intl.NumberFormat("fr-FR").format(n); }
function formatDate(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return iso; }
}
function haversineKm(a: number, b: number, x: number, y: number) {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(x - a), dLon = r(y - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(x)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const RADII = [1, 5, 10, 20, 30, 50];
function Maj({ iso }: { iso: string | null }) { return <p className="maj">Dernière mise à jour : {formatDate(iso)}</p>; }

/* icônes */
const IcPin = () => (<svg className="ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/></svg>);
const IcTag = () => (<svg className="ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20.6 13.4 12 22l-9-9V4h9l8.6 8.6a1.4 1.4 0 0 1 0 2Z"/><circle cx="7.5" cy="8.5" r="1.4"/></svg>);
const IcChart = () => (<svg className="ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>);
const IcSearch = () => (<svg className="ic" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>);

/* ---------- offres & animations ---------- */
type Anim = { date: string; label: string; details: string[] };
type AnimResp = { configured: false } | { configured: true; enCours: Anim[]; aVenir: Anim[] };
function Offres() {
  const [data, setData] = useState<AnimResp | null>(null);
  useEffect(() => { fetch("/api/animations").then((r) => r.json()).then(setData).catch(() => setData({ configured: false })); }, []);
  const gwp = (a: Anim) => (a.details[0] ? <div className="anim-gwp">GWP : {a.details[0]}</div> : null);
  const empty = !data || data.configured === false || (data.enCours.length === 0 && data.aVenir.length === 0);
  return (
    <section className="card-section">
      <h2 className="section-title">Offres & animations</h2>
      {empty ? (
        <p className="lede">Aucune animation en cours ou à venir pour le moment.</p>
      ) : (
        <div className="anim-panel">
          <h3 className="sub">En cours</h3>
          {data!.configured && data!.enCours.length > 0 ? (
            <ul className="anim-list">
              {data!.configured && data!.enCours.map((a, i) => (
                <li key={i} className="anim-row"><span className="anim-dot" aria-hidden /><div><div className="anim-label">{a.label}</div>{gwp(a)}</div></li>
              ))}
            </ul>
          ) : <p className="anim-empty">Aucune animation active aujourd&apos;hui.</p>}
          {data!.configured && data!.aVenir.length > 0 && (
            <div className="anim-next">
              <h3>À venir</h3>
              <ul className="anim-list">
                {data!.aVenir.map((a, i) => (
                  <li key={i} className="anim-row"><span className="anim-date">{a.date}</span><div><div className="anim-label">{a.label}</div>{gwp(a)}</div></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------- proximité clients ---------- */
type NearbyEntry = { cp: string; count: number; km: number };
function Proximite({ code }: { code: string }) {
  const [cp, setCp] = useState(""); const [km, setKm] = useState(10);
  const [loading, setLoading] = useState(false); const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null); const [notReady, setNotReady] = useState<string | null>(null);
  async function search() {
    const clean = cp.replace(/\D/g, "");
    if (clean.length < 4) { setError("Saisir un code postal à 5 chiffres."); setResult(null); return; }
    setLoading(true); setError(null); setNotReady(null);
    try {
      const p = new URLSearchParams({ cp: clean, km: String(km) }); if (code) p.set("code", code);
      const res = await fetch(`/api/proximite?${p}`); const data = await res.json();
      if ("error" in data) { setError(data.error); setResult(null); }
      else if (data.ready === false) { setNotReady(data.message); setResult(null); }
      else setResult(data);
    } catch { setError("Serveur momentanément indisponible."); }
    finally { setLoading(false); }
  }
  return (
    <section className="card-section">
      <h2 className="section-title">Clients BtoC autour d&apos;un code postal</h2>
      <p className="lede">Saisir le code postal du point de vente prospecté pour obtenir le nombre de clients du site Endro résidant dans le rayon choisi.</p>
      <div className="controls">
        <div className="row">
          <div><label htmlFor="cp1">Code postal</label>
            <input id="cp1" type="text" inputMode="numeric" placeholder="16430" value={cp} maxLength={5}
              onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && search()} /></div>
          <div><label>Rayon</label>
            <div className="radiuspicker">{RADII.map((r) => (<button key={r} type="button" className="chip" aria-pressed={km === r} onClick={() => setKm(r)}>{r} km</button>))}</div></div>
        </div>
        <button className="go" onClick={search} disabled={loading}>{loading ? "Recherche…" : "Rechercher"}</button>
      </div>
      {error && <div className="msg error">{error}</div>}
      {notReady && <div className="msg">{notReady}</div>}
      {result && (
        <div className="result">
          <div className="bignum">{formatFr(result.count)}</div>
          <p className="caption">client{result.count > 1 ? "s" : ""} à moins de <strong>{result.km} km</strong> du <strong>{result.cp}</strong>.</p>
          {result.nearby?.length > 0 && (
            <div className="nearby"><h2>Répartition par code postal</h2>
              <ul>{result.nearby.map((e: NearbyEntry) => (<li key={e.cp}><span className="cp">{e.cp}</span><span className="dist">{e.km} km</span><span className="n">{formatFr(e.count)}</span></li>))}</ul></div>
          )}
          <Maj iso={result.updatedAt} />
        </div>
      )}
    </section>
  );
}

/* ---------- meilleures ventes ---------- */
function Produits({ code }: { code: string }) {
  const [period, setPeriod] = useState("365"); const [custom, setCustom] = useState(false);
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null); const [msg, setMsg] = useState<string | null>(null);
  async function load() {
    const p = new URLSearchParams();
    if (custom && from && to) { p.set("from", from); p.set("to", to); } else p.set("period", period);
    if (code) p.set("code", code);
    const res = await fetch(`/api/produits?${p}`); const d = await res.json();
    if (d.error) { setMsg(d.error); setData(null); }
    else if (d.ready === false) { setMsg(d.message); setData(null); }
    else { setMsg(null); setData(d); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period, custom, from, to]);
  return (
    <section className="card-section">
      <h2 className="section-title">Meilleures ventes du site</h2>
      <div className="periodpicker">
        {["30", "90", "365"].map((d) => (<button key={d} type="button" className="chip" aria-pressed={!custom && period === d} onClick={() => { setCustom(false); setPeriod(d); }}>{d} j</button>))}
        <button type="button" className="chip" aria-pressed={custom} onClick={() => setCustom(true)}>Dates précises</button>
        {custom && (<span className="daterange"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><span>→</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></span>)}
      </div>
      {msg && <div className="msg">{msg}</div>}
      {data && (
        <div className="prod-grid">
          <div><h3 className="sub">Top produits</h3><ol className="ranklist">{data.topProducts.map((p: any, i: number) => <li key={i}>{p.title}</li>)}</ol></div>
          <div><h3 className="sub">Top 20 des produits vendus ensemble</h3>
            <ol className="ranklist pairs">{data.topPairs.map((p: any, i: number) => (<li key={i}><span>{p.a}</span><span className="plus">+</span><span>{p.b}</span></li>))}</ol></div>
        </div>
      )}
      {data && <Maj iso={data.updatedAt} />}
    </section>
  );
}

/* ---------- recherches Stockist ---------- */
function Recherches({ code }: { code: string }) {
  const [data, setData] = useState<any>(null); const [cp, setCp] = useState(""); const [km, setKm] = useState(10);
  const [focus, setFocus] = useState<any>(null); const [zone, setZone] = useState<any>(null);
  useEffect(() => { const p = new URLSearchParams(); if (code) p.set("code", code); fetch(`/api/searches?${p}`).then((r) => r.json()).then(setData).catch(() => {}); }, [code]);
  function locate() {
    const clean = cp.replace(/\D/g, ""); if (clean.length !== 5 || !data) return;
    const center = data.zones.find((z: any) => z.cp === clean);
    if (!center) { setZone({ cp: clean, missing: true }); return; }
    let n = 0, noResult = 0;
    for (const z of data.zones) { if (haversineKm(center.lat, center.lng, z.lat, z.lng) <= km) { n += z.n; noResult += z.noResult; } }
    setZone({ cp: clean, km, n, noResult }); setFocus({ lat: center.lat, lng: center.lng, km });
  }
  return (
    <section className="card-section">
      <h2 className="section-title">Recherches store locator par zone</h2>
      <p className="coverage">Données depuis le 23 septembre 2025.</p>
      <p className="lede">
        Où les visiteurs cherchent un point de vente Endro sur le site. Une recherche « sans résultat » signifie qu&apos;au moment de la recherche, aucun point de vente n&apos;a été trouvé assez près. Beaucoup de recherches et beaucoup de « sans résultat » dans une zone, c&apos;est une zone blanche à prospecter. Attention&nbsp;: comme les données couvrent douze mois, certains « sans résultat » anciens ont pu être corrigés depuis par le référencement de nouveaux magasins — le signal se lit donc sur la tendance d&apos;une zone, pas sur une recherche isolée. Clique sur un point de la carte pour voir le détail de ses recherches sans résultat.
      </p>
      <div className="controls">
        <div className="row">
          <div><label htmlFor="cp2">Code postal</label>
            <input id="cp2" type="text" inputMode="numeric" placeholder="35000" value={cp} maxLength={5}
              onChange={(e) => setCp(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && locate()} /></div>
          <div><label>Rayon</label>
            <div className="radiuspicker">{RADII.map((r) => (<button key={r} type="button" className="chip" aria-pressed={km === r} onClick={() => setKm(r)}>{r} km</button>))}</div></div>
        </div>
        <button className="go" onClick={locate}>Rechercher</button>
      </div>
      {zone && (
        <div className="msg">
          {zone.missing ? `Aucune recherche rattachée au ${zone.cp}.` : (
            <>{formatFr(zone.n)} recherche{zone.n > 1 ? "s" : ""} à moins de {zone.km} km du {zone.cp}, dont <span className="nr">{formatFr(zone.noResult)} sans point de vente trouvé à proximité</span>.</>
          )}
        </div>
      )}
      {data && data.zones && (
        <>
          <div className="legend" style={{ marginTop: 18 }}>
            <span className="key"><span className="swatch demand" /> Bien couvert</span>
            <span className="key"><span className="swatch partial" /> Couverture partielle (beaucoup de sans résultat)</span>
            <span className="key"><span className="swatch white" /> Aucun point de vente trouvé</span>
          </div>
          <SearchesMap zones={data.zones} focus={focus} />
          <div className="nearby"><h2>Top 10 des zones les plus recherchées</h2>
            <ul className="searchtable">
              <li className="head"><span className="cp">Code postal</span><span className="city">Ville</span><span className="n">Recherches</span></li>
              {data.zones.slice(0, 10).map((z: any) => (<li key={z.cp}><span className="cp">{z.cp}</span><span className="city">{z.city}</span><span className="n">{formatFr(z.n)}</span></li>))}
            </ul></div>
          <Maj iso={data.updatedAt} />
        </>
      )}
    </section>
  );
}

/* ---------- menu ---------- */
type View = "menu" | "proximite" | "offres" | "produits" | "recherches";
const MENU: { key: View; title: string; desc: string; icon: () => JSX.Element }[] = [
  { key: "proximite", title: "Chercher par code postal", desc: "Nombre de clients BtoC autour d'un prospect.", icon: IcPin },
  { key: "offres", title: "Offres à venir", desc: "Les animations en cours et à venir sur le site.", icon: IcTag },
  { key: "produits", title: "Meilleures ventes", desc: "Top produits et produits achetés ensemble.", icon: IcChart },
  { key: "recherches", title: "Recherches store locator", desc: "Où l'on cherche un point de vente, et les zones blanches.", icon: IcSearch },
];

export default function Page() {
  const [code, setCode] = useState("");
  const [view, setView] = useState<View>("menu");
  useEffect(() => { const s = localStorage.getItem("endro_access_code"); if (s) setCode(s); }, []);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/endro-logo.png" alt="Endro" style={{ cursor: "pointer" }} onClick={() => setView("menu")} />
          <h1 className="dash-title" style={{ cursor: "pointer" }} onClick={() => setView("menu")}>DASHBOARD BTOC DP</h1>
        </div>
      </header>

      <main className="wrap">
        {view === "menu" ? (
          <>
            <p className="menu-intro">Que veux-tu faire ?</p>
            <div className="menu">
              {MENU.map((m) => (
                <button key={m.key} className="menu-card" onClick={() => setView(m.key)}>
                  <m.icon />
                  <div><h3>{m.title}</h3><p>{m.desc}</p></div>
                </button>
              ))}
            </div>
            <details className="codegate">
              <summary>Code d&apos;accès</summary>
              <input type="text" placeholder="code d'équipe" value={code}
                onChange={(e) => { setCode(e.target.value); localStorage.setItem("endro_access_code", e.target.value); }} />
            </details>
          </>
        ) : (
          <>
            <button className="backlink" onClick={() => setView("menu")}>← Retour au menu</button>
            {view === "proximite" && <Proximite code={code} />}
            {view === "offres" && <Offres />}
            {view === "produits" && <Produits code={code} />}
            {view === "recherches" && <Recherches code={code} />}
          </>
        )}
      </main>
    </>
  );
}
