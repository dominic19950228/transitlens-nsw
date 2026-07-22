import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { query, requireActiveFeedId } from "@/lib/db";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface RouteRow extends mysql.RowDataPacket {
  route_id: string;
  agency_id: string | null;
  route_short_name: string | null;
  route_long_name: string | null;
  route_type: number;
}

function parseIntSafe(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const limit = Math.min(parseIntSafe(searchParams.get("limit"), DEFAULT_LIMIT), MAX_LIMIT);
  const offset = parseIntSafe(searchParams.get("offset"), 0);

  const searchPattern = `%${search}%`;

  const [rows, countRows] = await Promise.all([
    query<RouteRow[]>(
      `SELECT route_id, agency_id, route_short_name, route_long_name, route_type
       FROM gtfs_routes
       WHERE feed_import_id = ?
         AND (route_short_name LIKE ? OR route_long_name LIKE ?)
       ORDER BY route_short_name, route_id
       LIMIT ? OFFSET ?`,
      [activeFeedId, searchPattern, searchPattern, limit, offset]
    ),
    query<mysql.RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM gtfs_routes
       WHERE feed_import_id = ?
         AND (route_short_name LIKE ? OR route_long_name LIKE ?)`,
      [activeFeedId, searchPattern, searchPattern]
    ),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  return NextResponse.json({
    data: rows.map((r) => ({
      routeId: r.route_id,
      agencyId: r.agency_id,
      routeShortName: r.route_short_name,
      routeLongName: r.route_long_name,
      routeType: r.route_type,
    })),
    total,
    limit,
    offset,
  });
}