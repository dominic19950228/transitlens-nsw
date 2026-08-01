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
      <div className="bg-white rounded-lg shadow-sm border border-border overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Stop ID</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Name</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Lat</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Lon</th>
              <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Location Type</th>
              <th className="border border-slate-200 px-3 py-2 text-right font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {!loading && data?.data.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted px-3 py-8">No stops found.</td></tr>
            )}
            {data?.data.map(s => (
              <tr key={s.stopId} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs">{s.stopId}</td>
                <td className="px-3 py-2">{s.stopName}</td>
                <td className="px-3 py-2 font-mono text-xs">{s.stopLat?.toFixed(6) ?? "N/A"}</td>
                <td className="px-3 py-2 font-mono text-xs">{s.stopLon?.toFixed(6) ?? "N/A"}</td>
                <td className="px-3 py-2 text-muted text-xs">
                  {s.locationType === 0 ? "Stop" : s.locationType === 1 ? "Station" : s.locationType === 2 ? "Entrance" : s.locationType != null ? `Type ${s.locationType}` : "N/A"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link href={`/stops/${s.stopId}`} className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-white text-primary font-medium text-xs hover:bg-surface transition-colors">View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div className="text-center text-muted px-3 py-8">Loading...</div>}
      </div>
      {data && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted">
          <span>
            {data.offset + 1} -{" "}
            {Math.min(data.offset + data.data.length, data.total)} of{" "}
            {data.total}
          </span>
          <div className="flex gap-2">
            <button className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-white text-primary font-medium text-xs hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={data.offset === 0} onClick={() => fetchData(data.offset - 20)}>Previous</button>
            <button className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-white text-primary font-medium text-xs hover:bg-surface transition-colors disabled:opacity-50 disabled:cursor-not-allowed" disabled={data.offset + data.data.length >= data.total} onClick={() => fetchData(data.offset + 20)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}