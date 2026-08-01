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
        <Link href="/routes" className="inline-flex items-center px-4 py-2 rounded-md border border-border bg-white text-primary font-medium text-sm hover:bg-surface transition-colors" style={{ marginTop: "1rem" }}>Back to Routes</Link>
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
        <Link href="/routes" className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-white text-primary font-medium text-xs hover:bg-surface transition-colors">&larr; Back</Link>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Route {route.routeShortName ?? route.routeId}</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-border p-4" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Route Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
          {[
            ["Short Name", route.routeShortName ?? "N/A"],
            ["Long Name", route.routeLongName ?? "N/A"],
            ["Type", routeTypeName(route.routeType)],
            ["Agency", route.agencyId ?? "N/A"],
            ["Route ID", route.routeId],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: "0.25rem" }}>{label}</div>
              <div>{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-border" style={{ overflowX: "auto" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, padding: "1rem 1rem 0.5rem" }}>
          Trips ({data.trips.length.toLocaleString()})
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Trip ID</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Service ID</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Headsign</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Direction</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Block</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Shape</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.trips.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted px-3 py-8">No trips found.</td></tr>
            )}
            {data.trips.map(t => (
              <tr key={t.tripId} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs">
                  <Link href={`/trips/${encodeURIComponent(t.tripId)}`} className="text-accent hover:underline">
                    {t.tripId}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{t.serviceId}</td>
                <td className="px-3 py-2">{t.tripHeadsign ?? "N/A"}</td>
                <td className="px-3 py-2">{t.directionId === 0 ? "Outbound" : t.directionId === 1 ? "Inbound" : "N/A"}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.blockId ?? "N/A"}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.shapeId ?? "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}