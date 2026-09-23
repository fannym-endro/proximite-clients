"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";

type Zone = {
  cp: string;
  city: string;
  n: number;
  noResult: number;
  lat: number;
  lng: number;
  samples?: { d: string; q: string }[];
};

export default function SearchesMap({
  zones,
  focus,
}: {
  zones: Zone[];
  focus?: { lat: number; lng: number; km: number } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const focusRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(ref.current, {
          center: [46.7, 2.4],
          zoom: 6,
          scrollWheelZoom: true,
          preferCanvas: true,
        });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 18,
        }).addTo(mapRef.current);
      }

      // (Re)dessiner les cercles.
      if (layerRef.current) layerRef.current.remove();
      const canvas = L.canvas({ padding: 0.5 });
      const group = L.layerGroup();
      const max = zones.length ? zones[0].n : 1;
      for (const z of zones) {
        const r = 3 + 14 * Math.sqrt(z.n / max);
        const withResult = z.n - z.noResult;
        const share = z.n ? z.noResult / z.n : 0;
        let color = "#6b8d73"; // bien couvert
        if (z.noResult > 0 && withResult === 0) color = "#c0392b"; // aucun résultat
        else if (share >= 0.3) color = "#dc582a"; // couverture partielle

        const circle = L.circleMarker([z.lat, z.lng], {
          renderer: canvas,
          radius: r,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.4,
        });

        let html = `<strong>${z.cp}</strong> ${z.city || ""}<br/>${z.n} recherche${z.n > 1 ? "s" : ""}`;
        if (z.noResult > 0)
          html += ` · <span style="color:#c0392b;font-weight:600">${z.noResult} sans résultat</span>`;
        if (z.samples && z.samples.length) {
          html +=
            `<div style="margin-top:7px;font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:#888">Sans résultat — exemples</div>` +
            `<ul style="margin:3px 0 0;padding-left:15px;font-size:12px">` +
            z.samples.map((s) => `<li>${s.d}${s.q ? " — " + s.q : ""}</li>`).join("") +
            `</ul>`;
          if (z.noResult > z.samples.length)
            html += `<div style="font-size:11px;color:#999;margin-top:2px">… et ${z.noResult - z.samples.length} autres</div>`;
        }
        circle.bindPopup(html);
        circle.addTo(group);
      }
      group.addTo(mapRef.current);
      layerRef.current = group;
    })();
    return () => {
      cancelled = true;
    };
  }, [zones]);

  // Recentrer sur un code postal recherché.
  useEffect(() => {
    (async () => {
      if (!mapRef.current || !focus) return;
      const L = (await import("leaflet")).default;
      if (focusRef.current) focusRef.current.remove();
      const c = L.circle([focus.lat, focus.lng], {
        radius: focus.km * 1000,
        color: "#17392a",
        weight: 1,
        fillOpacity: 0.05,
      });
      c.addTo(mapRef.current);
      focusRef.current = c;
      mapRef.current.setView([focus.lat, focus.lng], focus.km <= 15 ? 10 : 8);
    })();
  }, [focus]);

  return <div ref={ref} className="map" />;
}
