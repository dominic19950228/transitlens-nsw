import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { query, requireActiveFeedId } from "@/lib/db";
import { formatQueryIssues, parsePaginationQuery } from "@/lib/queryParams";

export const dynamic = "force-dynamic";

interface StopRow extends mysql.RowDataPacket {
  stop_id: string; stop_name: string; stop_lat: string | null;
  stop_lon: string | null; location_type: number | null;
  parent_station: string | null; wheelchair_boarding: number | null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsedQuery = parsePaginationQuery(searchParams);

  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        error: "INVALID_QUERY",
        message: "Invalid query parameters.",
        details: formatQueryIssues(parsedQuery.error),
      },
      { status: 400 }
    );
  }

  const { search, limit, offset } = parsedQuery.data;
  const searchPattern = `%${search}%`;

  let activeFeedId: number;
  try { activeFeedId = await requireActiveFeedId(); }
  catch (err: unknown) {
    if ((err as any)?.errorCode === "NO_ACTIVE_FEED")
      return NextResponse.json({ error: "NO_ACTIVE_FEED", message: "No active GTFS feed is available." }, { status: 503 });
    throw err;
  }

  const [rows, countRows] = await Promise.all([
    query<StopRow[]>(
      `SELECT stop_id, stop_name, stop_lat, stop_lon, location_type, parent_station, wheelchair_boarding
       FROM gtfs_stops WHERE feed_import_id = ? AND (stop_id LIKE ? OR stop_name LIKE ?)
       ORDER BY stop_name, stop_id LIMIT ? OFFSET ?`,
      [activeFeedId, searchPattern, searchPattern, limit, offset]
    ),
    query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM gtfs_stops
       WHERE feed_import_id = ? AND (stop_id LIKE ? OR stop_name LIKE ?)`,
      [activeFeedId, searchPattern, searchPattern]
    ),
  ]);

  return NextResponse.json({
    data: rows.map(r => ({
      stopId: r.stop_id, stopName: r.stop_name,
      stopLat: r.stop_lat != null ? Number(r.stop_lat) : null,
      stopLon: r.stop_lon != null ? Number(r.stop_lon) : null,
      locationType: r.location_type, parentStation: r.parent_station,
      wheelchairBoarding: r.wheelchair_boarding,
    })),
    total: Number(countRows[0]?.total ?? 0),
    limit, offset,
  });
}