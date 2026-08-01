"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import Link from "next/link";
import type { TripDetailDto } from "@/types";
import { formatDirection, formatPickupType, formatDropOffType } from "@/lib/formatHelpers";

interface ErrorInfo {
  error: string;
  message: string;
}

export default function TripDetailPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = use(params);
  const [data, setData] = useState<TripDetailDto | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    fetch(`/api/trips/${encodeURIComponent(tripId)}`)
      .then(async (response) => {
        const body = await response.json();

        if (!response.ok || body.error) {
          setError(body);
          return;
        }

        setData(body);
      })
      .catch(() => {
        setError({
          error: "FETCH_ERROR",
          message: "Unable to load trip details.",
        });
      });
  }, [tripId]);

  if (error) {
    return (
      <div style={{ textAlign: "center", padding: "3rem" }}>
        <h2 style={{ color: "#dc2626", marginBottom: "0.5rem" }}>
          {error.error === "NO_ACTIVE_FEED"
            ? "No Active Feed"
            : error.error === "NOT_FOUND"
              ? "Trip Not Found"
              : "Unable to Load Trip"}
        </h2>
        <p style={{ color: "#64748b" }}>{error.message}</p>
        <Link href="/routes" className="inline-flex items-center px-4 py-2 rounded-md border border-border bg-white text-primary font-medium text-sm hover:bg-surface transition-colors" style={{ marginTop: "1rem" }}>Back to Routes</Link>
      </div>
    );
  }

  if (!data) return <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>Loading...</div>;

  const { trip } = data;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <Link href={`/routes/${encodeURIComponent(trip.routeId)}`} className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-white text-primary font-medium text-xs hover:bg-surface transition-colors">
          &larr; Back to Route
        </Link>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Trip {trip.tripId}</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-border p-4" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Trip Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
          {[
            ["Route", trip.routeShortName ?? "N/A"],
            ["Route Name", trip.routeLongName ?? "N/A"],
            ["Service ID", trip.serviceId],
            ["Headsign", trip.tripHeadsign ?? "N/A"],
            ["Direction", formatDirection(trip.directionId)],
            ["Block", trip.blockId ?? "N/A"],
            ["Shape", trip.shapeId ?? "N/A"],
            ["Trip ID", trip.tripId],
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
          Stops ({data.stopTimes.length.toLocaleString()})
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-slate-200 px-3 py-2 text-center font-semibold">#</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Stop Name</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Stop ID</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Arrival</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Departure</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Pickup</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Drop-off</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.stopTimes.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted px-3 py-8">No stop times found.</td></tr>
            )}
            {data.stopTimes.map(st => (
              <tr key={st.stopId + "-" + st.stopSequence} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs text-center">{st.stopSequence}</td>
                <td className="px-3 py-2">
                  <Link href={`/stops/${encodeURIComponent(st.stopId)}`} className="text-accent hover:underline">
                    {st.stopName}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{st.stopId}</td>
                <td className="px-3 py-2 font-mono text-xs">{st.arrivalTime ?? "N/A"}</td>
                <td className="px-3 py-2 font-mono text-xs">{st.departureTime ?? "N/A"}</td>
                <td className="px-3 py-2">{formatPickupType(st.pickupType)}</td>
                <td className="px-3 py-2">{formatDropOffType(st.dropOffType)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}