"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { RouteDto, PaginatedResponse } from "@/types";

export default function RoutesPage() {
  const [data, setData] = useState<PaginatedResponse<RouteDto> | null>(null);
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
      const res = await fetch(`/api/routes?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => { fetchData(0); }, [fetchData]);

  const handlePage = (newOffset: number) => fetchData(newOffset);

  const routeTypeName = (t: number) => {
    const names: Record<number, string> = { 0: "Tram", 1: "Metro", 2: "Rail", 3: "Bus", 4: "Ferry", 5: "Cable Tram", 6: "Aerial", 7: "Funicular", 11: "Trolleybus", 12: "Monorail" };
    return names[t] ?? `Type ${t}`;
  };

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>Routes</h1>
      <div style={{ marginBottom: "1rem" }}>
        <input
          type="text" placeholder="Search by route name..." value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: "0.5rem 0.75rem", border: "1px solid #e2e8f0", borderRadius: "0.375rem", width: "100%", maxWidth: "400px", fontSize: "0.875rem" }}
        />
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Short Name</th><th>Long Name</th><th>Type</th><th>Agency</th><th></th>
            </tr>
          </thead>
          <tbody>
            {!loading && data?.data.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>No routes found.</td></tr>
            )}
            {data?.data.map(r => (
              <tr key={r.routeId}>
                <td style={{ fontWeight: 600 }}>{r.routeShortName ?? "—"}</td>
                <td>{r.routeLongName ?? "—"}</td>
                <td>{routeTypeName(r.routeType)}</td>
                <td style={{ color: "#64748b", fontSize: "0.8rem" }}>{r.agencyId ?? "—"}</td>
                <td style={{ textAlign: "right" }}>
                  <Link href={`/routes/${r.routeId}`} className="btn btn-outline" style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}>View</Link>
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
          <button className="btn btn-outline" disabled={data.offset === 0} onClick={() => handlePage(data.offset - 20)} style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}>Previous</button>
          <button className="btn btn-outline" disabled={data.offset + data.data.length >= data.total} onClick={() => handlePage(data.offset + 20)} style={{ padding: "0.25rem 0.75rem", fontSize: "0.8rem" }}>Next</button>
        </div>
      )}
    </div>
  );
}