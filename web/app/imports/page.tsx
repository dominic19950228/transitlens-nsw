"use client";

import { useEffect, useState } from "react";
import type { ImportDto } from "@/types";

/**
 * Derive display status from database status.
 * Historical records may have status=completed but errors > 0 or acceptedRows === 0.
 * These should display as "Completed with errors" rather than silently showing "completed".
 */
function getDisplayStatus(imp: ImportDto): { label: string; className: string } {
    // Normal statuses
    if (imp.status === "failed") {
        return { label: "failed", className: "status-badge status-failed" };
    }
    if (imp.status === "pending") {
        return { label: "pending", className: "status-badge status-active" };
    }
    if (imp.status === "completed" && imp.isActive) {
        return { label: "active", className: "status-badge status-completed" };
    }

    // Historical completed record with issues - show derived label
    if (imp.status === "completed" && !imp.isActive) {
        if (imp.errors > 0 || imp.acceptedRows === 0) {
            return { label: "Completed with errors", className: "status-badge status-warning" };
        }
        return { label: "completed", className: "status-badge status-inactive" };
    }

    return { label: imp.status, className: "status-badge" };
}

function getSourceName(sourceDirectory: string): string {
  return sourceDirectory
    .split(/[\\/]/)
    .filter(Boolean)
    .at(-1) ?? sourceDirectory;
}

export default function ImportsPage() {
    const [imports, setImports] = useState<ImportDto[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch("/api/imports")
            .then(r => r.json())
            .then((data: ImportDto[]) => { setImports(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    const formatDate = (v: string | null) => v ? new Date(v).toLocaleString() : "—";

    return (
        <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>Import History</h1>
            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Status</th>
                            <th>Active</th>
                            <th>Source</th>
                            <th>Started</th>
                            <th>Completed</th>
                            <th>Processed</th>
                            <th>Accepted</th>
                            <th>Rejected</th>
                            <th>Warnings</th>
                            <th>Errors</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && <tr><td colSpan={11} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>Loading...</td></tr>}
                        {!loading && imports.length === 0 && <tr><td colSpan={11} style={{ textAlign: "center", color: "#64748b", padding: "2rem" }}>No imports yet.</td></tr>}
                        {imports.map(imp => {
                            const display = getDisplayStatus(imp);
                            return (
                                <tr key={imp.id}>
                                    <td style={{ fontFamily: "monospace", fontSize: "0.8rem" }}>{imp.id}</td>
                                    <td><span className={display.className}>{display.label}</span></td>
                                    <td style={{ textAlign: "center" }}>{imp.isActive ? "✓" : ""}</td>
                                    <td style={{ fontFamily: "monospace", fontSize: "0.8rem", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={imp.sourceDirectory}>{getSourceName(imp.sourceDirectory)}</td>
                                    <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{formatDate(imp.startedAt)}</td>
                                    <td style={{ fontSize: "0.8rem", color: "#64748b" }}>{formatDate(imp.completedAt)}</td>
                                    <td style={{ textAlign: "right" }}>{imp.processedRows.toLocaleString()}</td>
                                    <td style={{ textAlign: "right", color: "#16a34a" }}>{imp.acceptedRows.toLocaleString()}</td>
                                    <td style={{ textAlign: "right", color: imp.rejectedRows > 0 ? "#dc2626" : "inherit" }}>{imp.rejectedRows.toLocaleString()}</td>
                                    <td style={{ textAlign: "right", color: imp.warnings > 0 ? "#d97706" : "inherit" }}>{imp.warnings.toLocaleString()}</td>
                                    <td style={{ textAlign: "right", color: imp.errors > 0 ? "#dc2626" : "inherit" }}>{imp.errors.toLocaleString()}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}