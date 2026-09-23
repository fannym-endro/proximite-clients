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
        const whitespace = z.n >= 15 && z.noResult / z.n >= 0.25;
        const color = whitespace ? "#dc582a" : "#6b8d73";
        const circle = L.circleMarker([z.lat, z.lng], {
          renderer: canvas,
          radius: r,
          color,
          weight: 1,
          fillColor: color,
          fillOpacity: 0.35,
        });
        circle.bindPopup(
          `<strong>${z.cp}</strong> ${z.city || ""}<br/>${z.n} recherche${
            z.n > 1 ? "s" : ""
          }${z.noResult ? ` · ${z.noResult} sans résultat` : ""}`
        );
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
