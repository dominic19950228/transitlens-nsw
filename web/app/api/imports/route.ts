import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ImportRow extends mysql.RowDataPacket {
  id: number;
  status: string;
  is_active: number;
  source_directory: string;
  started_at: string | null;
  completed_at: string | null;
  total_processed_rows: number;
  total_accepted_rows: number;
  total_rejected_rows: number;
  warning_count: number;
  error_count: number;
}

export async function GET() {
  const rows = await query<ImportRow[]>(
    `SELECT
       id,
       status,
       is_active AS isActive,
       source_directory AS sourceDirectory,
       started_at AS startedAt,
       completed_at AS completedAt,
       total_processed_rows AS processedRows,
       total_accepted_rows AS acceptedRows,
       total_rejected_rows AS rejectedRows,
       warning_count AS warnings,
       error_count AS errors
     FROM gtfs_feed_imports
     ORDER BY started_at DESC
     LIMIT 50`
  );

  const data = rows.map((r) => ({
    id: Number(r.id),
    status: r.status as string,
    isActive: Boolean(r.isActive),
    sourceDirectory: r.sourceDirectory as string,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    processedRows: Number(r.processedRows),
    acceptedRows: Number(r.acceptedRows),
    rejectedRows: Number(r.rejectedRows),
    warnings: Number(r.warnings),
    errors: Number(r.errors),
  }));

  return NextResponse.json(data);
}