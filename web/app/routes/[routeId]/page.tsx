"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import type { RouteDetailDto } from "@/types";

interface ErrorInfo {
  error: string;
  message: string;
}

export default function RouteDetailPage({ params }: { params: Promise<{ routeId: string }> }) {
  const { routeId } = use(params);
  const [data, setData] = useState<RouteDetailDto | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    fetch(`/api/routes/${encodeURIComponent(routeId)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d);
        else setData(d);
      });
  }, [routeId]);

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "3rem" }}>
        <h2 style={{ color: "#dc2626", marginBottom: "0.5rem" }}>
          {error.error === "NO_ACTIVE_FEED" ? "No Active Feed" : "Not Found"}
        </h2>
        <p style={{ color: "#64748b" }}>{error.message}</p>
        <Link href="/routes" className="btn btn-outline" style={{ marginTop: "1rem" }}>Back to Routes</Link>
      </div>
    );
  }

  if (!data) return <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>Loading...</div>;

  const { route } = data;

  const routeTypeName = (t: number) => {
    const names: Record<number, string> = { 0: "Tram", 1: "Metro", 2: "Rail", 3: "Bus", 4: "Ferry", 5: "Cable Tram", 6: "Aerial", 7: "Funicular", 11: "Trolleybus", 12: "Monorail" };
    return names[t] ?? `Type ${t}`;
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <Link href="/routes" className="btn btn-outline" style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}>&larr; Back</Link>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Route {route.routeShortName ?? route.routeId}</h1>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Route Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
          {[
            ["Short Name", route.routeShortName ?? "—"],
            ["Long Name", route.routeLongName ?? "—"],
            ["Type", routeTypeName(route.routeType)],
            ["Agency", route.agencyId ?? "—"],
            ["Route ID", route.routeId],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: "0.25rem" }}>{label}</div>
              <div>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, padding: "1rem 1rem 0.5rem" }}>
          Trips ({data.trips.length.toLocaleString()})
        </h2>
        <table>
          <thead>
            <tr>
              <th>Trip ID</th><th>Service ID</th><th>Headsign</th><th>Direction</th><th>Block</th><th>Shape</th>
            </tr>
          </thead>
          <tbody>
            {data.trips.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>No trips found.</td></tr>
            )}
            {data.trips.map(t => (
              <tr key={t.tripId}>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.tripId}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.serviceId}</td>
                <td>{t.tripHeadsign ?? "—"}</td>
                <td>{t.directionId === 0 ? "Outbound" : t.directionId === 1 ? "Inbound" : "—"}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.blockId ?? "—"}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.shapeId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}