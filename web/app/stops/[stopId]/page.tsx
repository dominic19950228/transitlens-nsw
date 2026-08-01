"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import type { StopDetailDto } from "@/types";

interface ErrorInfo {
  error: string;
  message: string;
}

export default function StopDetailPage({ params }: { params: Promise<{ stopId: string }> }) {
  const { stopId } = use(params);
  const [data, setData] = useState<StopDetailDto | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    fetch(`/api/stops/${encodeURIComponent(stopId)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d);
        else setData(d);
      });
  }, [stopId]);

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "3rem" }}>
        <h2 style={{ color: "#dc2626", marginBottom: "0.5rem" }}>
          {error.error === "NO_ACTIVE_FEED" ? "No Active Feed" : "Not Found"}
        </h2>
        <p style={{ color: "#64748b" }}>{error.message}</p>
        <Link href="/stops" className="inline-flex items-center px-4 py-2 rounded-md border border-border bg-white text-primary font-medium text-sm hover:bg-surface transition-colors" style={{ marginTop: "1rem" }}>Back to Stops</Link>
      </div>
    );
  }

  if (!data) return <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>Loading...</div>;

  const { stop, stopTimes } = data;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <Link href="/stops" className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-white text-primary font-medium text-xs hover:bg-surface transition-colors">&larr; Back</Link>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stop.stopName}</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-border p-4" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Stop Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
          {[
            ["Stop ID", stop.stopId],
            ["Name", stop.stopName],
            ["Latitude", stop.stopLat?.toFixed(6) ?? "N/A"],
            ["Longitude", stop.stopLon?.toFixed(6) ?? "N/A"],
            ["Location Type", stop.locationType === 0 ? "Stop" : stop.locationType === 1 ? "Station" : stop.locationType === 2 ? "Entrance" : stop.locationType != null ? `Type ${stop.locationType}` : "N/A"],
            ["Parent Station", stop.parentStation ?? "N/A"],
            ["Wheelchair", stop.wheelchairBoarding === 0 ? "No info" : stop.wheelchairBoarding === 1 ? "Accessible" : stop.wheelchairBoarding === 2 ? "Not accessible" : "N/A"],
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
          Stop Times ({stopTimes.length.toLocaleString()})
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Trip</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Route</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Headsign</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Arrival</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Departure</th>
              <th className="border border-slate-200 px-3 py-2 text-center font-semibold">Seq</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {stopTimes.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted px-3 py-8">No stop times found.</td></tr>
            )}
            {stopTimes.map((t, i) => (
              <tr key={`${t.tripId}-${t.stopSequence}-${i}`} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs">{t.tripId}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.routeId}</td>
                <td className="px-3 py-2">{t.tripHeadsign ?? "N/A"}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.arrivalTime ?? "N/A"}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.departureTime ?? "N/A"}</td>
                <td className="px-3 py-2 text-center">{t.stopSequence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}