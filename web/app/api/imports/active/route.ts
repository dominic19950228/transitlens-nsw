import { NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { query, requireActiveFeedId } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ImportRow extends mysql.RowDataPacket {
  id: number;
  source_directory: string;
  source_archive_sha256: string | null;
  started_at: string;
  completed_at: string | null;
}

export async function GET() {
  let activeFeedId: number;
  try {
    activeFeedId = await requireActiveFeedId();
  } catch (err: unknown) {
    if ((err as any)?.errorCode === "NO_ACTIVE_FEED") {
      return NextResponse.json(
        { error: "NO_ACTIVE_FEED", message: "No active GTFS feed is available." },
        { status: 503 }
      );
    }
    throw err;
  }

  const rows = await query<ImportRow[]>(
    `SELECT id, source_directory, source_archive_sha256, started_at, completed_at
     FROM gtfs_feed_imports
     WHERE id = ?`,
    [activeFeedId]
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Active feed not found." },
      { status: 404 }
    );
  }

  const row = rows[0];
  return NextResponse.json({
    id: Number(row.id),
    sourceDirectory: row.source_directory,
    sourceArchiveSha256: row.source_archive_sha256,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  });
}