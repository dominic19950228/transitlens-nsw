import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { query, requireActiveFeedId } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteRow extends mysql.RowDataPacket {
  route_id: string; agency_id: string | null; route_short_name: string | null;
  route_long_name: string | null; route_type: number;
}
interface TripRow extends mysql.RowDataPacket {
  trip_id: string; service_id: string; trip_headsign: string | null;
  direction_id: number | null; block_id: string | null; shape_id: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> }
) {
  let activeFeedId: number;
  try { activeFeedId = await requireActiveFeedId(); }
  catch (err: unknown) {
    if ((err as any)?.errorCode === "NO_ACTIVE_FEED")
      return NextResponse.json({ error: "NO_ACTIVE_FEED", message: "No active GTFS feed is available." }, { status: 503 });
    throw err;
  }
  const { routeId } = await params;

  const routes = await query<RouteRow[]>(
    `SELECT route_id, agency_id, route_short_name, route_long_name, route_type
     FROM gtfs_routes WHERE feed_import_id = ? AND route_id = ?`,
    [activeFeedId, routeId]
  );
  if (routes.length === 0)
    return NextResponse.json({ error: "NOT_FOUND", message: "Route not found." }, { status: 404 });

  const trips = await query<TripRow[]>(
    `SELECT t.trip_id, t.service_id, t.trip_headsign, t.direction_id, t.block_id, t.shape_id
     FROM gtfs_trips t JOIN gtfs_routes r ON t.route_id = r.route_id AND t.feed_import_id = r.feed_import_id
     WHERE r.feed_import_id = ? AND r.route_id = ?
     ORDER BY t.trip_id`,
    [activeFeedId, routeId]
  );

  return NextResponse.json({
    route: {
      routeId: routes[0].route_id, agencyId: routes[0].agency_id,
      routeShortName: routes[0].route_short_name, routeLongName: routes[0].route_long_name,
      routeType: routes[0].route_type,
    },
    trips: trips.map(t => ({
      tripId: t.trip_id, serviceId: t.service_id, tripHeadsign: t.trip_headsign,
      directionId: t.direction_id, blockId: t.block_id, shapeId: t.shape_id,
    })),
  });
}