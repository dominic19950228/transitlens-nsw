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
        <Link href="/stops" className="btn btn-outline" style={{ marginTop: "1rem" }}>Back to Stops</Link>
      </div>
    );
  }

  if (!data) return <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>Loading...</div>;

  const { stop, stopTimes } = data;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <Link href="/stops" className="btn btn-outline" style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}>&larr; Back</Link>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>{stop.stopName}</h1>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Stop Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
          {[
            ["Stop ID", stop.stopId],
            ["Name", stop.stopName],
            ["Latitude", stop.stopLat?.toFixed(6) ?? "—"],
            ["Longitude", stop.stopLon?.toFixed(6) ?? "—"],
            ["Location Type", stop.locationType === 0 ? "Stop" : stop.locationType === 1 ? "Station" : stop.locationType === 2 ? "Entrance" : stop.locationType != null ? `Type ${stop.locationType}` : "—"],
            ["Parent Station", stop.parentStation ?? "—"],
            ["Wheelchair", stop.wheelchairBoarding === 0 ? "No info" : stop.wheelchairBoarding === 1 ? "Accessible" : stop.wheelchairBoarding === 2 ? "Not accessible" : "—"],
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
          Stop Times ({stopTimes.length.toLocaleString()})
        </h2>
        <table>
          <thead>
            <tr>
              <th>Trip</th><th>Route</th><th>Headsign</th><th>Arrival</th><th>Departure</th><th>Seq</th>
            </tr>
          </thead>
          <tbody>
            {stopTimes.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>No stop times found.</td></tr>
            )}
            {stopTimes.map((t, i) => (
              <tr key={`${t.tripId}-${t.stopSequence}-${i}`}>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.tripId}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.routeId}</td>
                <td>{t.tripHeadsign ?? "—"}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.arrivalTime ?? "—"}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{t.departureTime ?? "—"}</td>
                <td style={{ textAlign: "center" }}>{t.stopSequence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}