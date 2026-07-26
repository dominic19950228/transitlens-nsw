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
        <Link href="/routes" className="btn btn-outline" style={{ marginTop: "1rem" }}>Back to Routes</Link>
      </div>
    );
  }

  if (!data) return <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>Loading...</div>;

  const { trip } = data;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <Link href={`/routes/${encodeURIComponent(trip.routeId)}`} className="btn btn-outline" style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}>
          &larr; Back to Route
        </Link>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Trip {trip.tripId}</h1>
      </div>

      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Trip Details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
          {[
            ["Route", trip.routeShortName ?? "—"],
            ["Route Name", trip.routeLongName ?? "—"],
            ["Service ID", trip.serviceId],
            ["Headsign", trip.tripHeadsign ?? "—"],
            ["Direction", formatDirection(trip.directionId)],
            ["Block", trip.blockId ?? "—"],
            ["Shape", trip.shapeId ?? "—"],
            ["Trip ID", trip.tripId],
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
          Stops ({data.stopTimes.length.toLocaleString()})
        </h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Stop Name</th>
              <th>Stop ID</th>
              <th>Arrival</th>
              <th>Departure</th>
              <th>Pickup</th>
              <th>Drop-off</th>
            </tr>
          </thead>
          <tbody>
            {data.stopTimes.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>No stop times found.</td></tr>
            )}
            {data.stopTimes.map(st => (
              <tr key={st.stopId + "-" + st.stopSequence}>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem", textAlign: "center" }}>{st.stopSequence}</td>
                <td>
                  <Link href={`/stops/${encodeURIComponent(st.stopId)}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                    {st.stopName}
                  </Link>
                </td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{st.stopId}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{st.arrivalTime ?? "—"}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{st.departureTime ?? "—"}</td>
                <td>{formatPickupType(st.pickupType)}</td>
                <td>{formatDropOffType(st.dropOffType)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}