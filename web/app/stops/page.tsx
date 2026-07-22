"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { StopDto, PaginatedResponse } from "@/types";

export default function StopsPage() {
  const [data, setData] = useState<PaginatedResponse<StopDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchData = useCallback(async (offset = 0) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "20", offset: String(offset) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/stops?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchData(0); }, [fetchData]);

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>Stops</h1>
      <div style={{ marginBottom: "1rem" }}>
        <input
          type="text" placeholder="Search by stop ID or name..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: "0.5rem 0.75rem", border: "1px solid #e2e8f0", borderRadius: "0.375rem", width: "100%", maxWidth: "400px", fontSize: "0.875rem" }}
        />
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Stop ID</th><th>Name</th><th>Lat</th><th>Lon</th><th>Location Type</th><th></th>
            </tr>
          </thead>
          <tbody>
            {!loading && data?.data.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>No stops found.</td></tr>
            )}
            {data?.data.map(s => (
              <tr key={s.stopId}>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{s.stopId}</td>
                <td>{s.stopName}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{s.stopLat?.toFixed(6) ?? "—"}</td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{s.stopLon?.toFixed(6) ?? "—"}</td>
                <td style={{ color: "#64748b", fontSize: "0.8rem" }}>
                  {s.locationType === 0 ? "Stop" : s.locationType === 1 ? "Station" : s.locationType === 2 ? "Entrance" : s.locationType != null ? `Type ${s.locationType}` : "—"}
                </td>
                <td style={{ textAlign: "right" }}>
                  <Link href={`/stops/${s.stopId}`} className="btn btn-outline" style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div style={{ textAlign: "center", padding: "2rem", color: "#64748b" }}>Loading...</div>}
      </div>
      {data && (
        <div className="pagination">
          <span className="pagination-info">
            {data.offset + 1}–{Math.min(data.offset + data.data.length, data.total)} of {data.total}
          </span>
          <button className="btn btn-outline" disabled={data.offset === 0} onClick={() => fetchData(data.offset - 20)} style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}>Previous</button>
          <button className="btn btn-outline" disabled={data.offset + data.data.length >= data.total} onClick={() => fetchData(data.offset + 20)} style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}>Next</button>
        </div>
      )}
    </div>
  );
}