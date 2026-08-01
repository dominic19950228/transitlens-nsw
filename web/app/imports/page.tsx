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
        return { label: "failed", className: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-danger/10 text-danger" };
    }
    if (imp.status === "pending") {
        return { label: "pending", className: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent" };
    }
    if (imp.status === "completed" && imp.isActive) {
        return { label: "active", className: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success" };
    }

    // Historical completed record with issues - show derived label
    if (imp.status === "completed" && !imp.isActive) {
        if (imp.errors > 0 || imp.acceptedRows === 0) {
            return { label: "Completed with errors", className: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning" };
        }
        return { label: "completed", className: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted/10 text-muted" };
    }

    return { label: imp.status, className: "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-surface text-muted" };
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

    const formatDate = (v: string | null) => v ? new Date(v).toLocaleString() : "N/A";

    return (
        <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>Import History</h1>
            <div className="bg-white rounded-lg shadow-sm border border-border overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                    <thead className="bg-slate-100">
                        <tr>
                            <th className="border border-slate-200 px-3 py-2 text-left font-semibold">ID</th>
                            <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Status</th>
                            <th className="border border-slate-200 px-3 py-2 text-center font-semibold">Active</th>
                            <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Source</th>
                            <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Started</th>
                            <th className="border border-slate-200 px-3 py-2 text-left font-semibold">Completed</th>
                            <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Processed</th>
                            <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Accepted</th>
                            <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Rejected</th>
                            <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Warnings</th>
                            <th className="border border-slate-200 px-3 py-2 text-right font-semibold">Errors</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {loading && <tr><td colSpan={11} className="text-center text-muted px-3 py-8">Loading...</td></tr>}
                        {!loading && imports.length === 0 && <tr><td colSpan={11} className="text-center text-muted px-3 py-8">No imports yet.</td></tr>}
                        {imports.map(imp => {
                            const display = getDisplayStatus(imp);
                            return (
                                <tr key={imp.id} className="hover:bg-slate-50">
                                    <td className="px-3 py-2 font-mono text-xs">{imp.id}</td>
                                    <td className="px-3 py-2"><span className={display.className}>{display.label}</span></td>
                                    <td className="px-3 py-2 text-center">{imp.isActive ? "Yes" : "No"}</td>
                                    <td className="px-3 py-2 font-mono text-xs max-w-[200px] truncate" title={imp.sourceDirectory}>{getSourceName(imp.sourceDirectory)}</td>
                                    <td className="px-3 py-2 text-xs text-muted">{formatDate(imp.startedAt)}</td>
                                    <td className="px-3 py-2 text-xs text-muted">{formatDate(imp.completedAt)}</td>
                                    <td className="px-3 py-2 text-right">{imp.processedRows.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right text-success">{imp.acceptedRows.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right" style={{ color: imp.rejectedRows > 0 ? "#dc2626" : "inherit" }}>{imp.rejectedRows.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right" style={{ color: imp.warnings > 0 ? "#d97706" : "inherit" }}>{imp.warnings.toLocaleString()}</td>
                                    <td className="px-3 py-2 text-right" style={{ color: imp.errors > 0 ? "#dc2626" : "inherit" }}>{imp.errors.toLocaleString()}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}