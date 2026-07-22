import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { query, requireActiveFeedId } from "@/lib/db";

export const dynamic = "force-dynamic";

interface StopRow extends mysql.RowDataPacket {
  stop_id: string; stop_name: string; stop_lat: string | null;
  stop_lon: string | null; location_type: number | null;
  parent_station: string | null; wheelchair_boarding: number | null;
}
interface StopTimeRow extends mysql.RowDataPacket {
  st_trip_id: string; st_arrival_time: string | null; st_departure_time: string | null;
  st_stop_sequence: number; r_route_id: string; t_trip_headsign: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ stopId: string }> }
) {
  let activeFeedId: number;
  try { activeFeedId = await requireActiveFeedId(); }
  catch (err: unknown) {
    if ((err as any)?.errorCode === "NO_ACTIVE_FEED")
      return NextResponse.json({ error: "NO_ACTIVE_FEED", message: "No active GTFS feed is available." }, { status: 503 });
    throw err;
  }
  const { stopId } = await params;

  const stops = await query<StopRow[]>(
    `SELECT stop_id, stop_name, stop_lat, stop_lon, location_type, parent_station, wheelchair_boarding
     FROM gtfs_stops WHERE feed_import_id = ? AND stop_id = ?`,
    [activeFeedId, stopId]
  );
  if (stops.length === 0)
    return NextResponse.json({ error: "NOT_FOUND", message: "Stop not found." }, { status: 404 });

  const times = await query<StopTimeRow[]>(
    `SELECT
       st.trip_id AS st_trip_id, st.arrival_time AS st_arrival_time,
       st.departure_time AS st_departure_time, st.stop_sequence AS st_stop_sequence,
       r.route_id AS r_route_id, t.trip_headsign AS t_trip_headsign
     FROM gtfs_stop_times st
     JOIN gtfs_trips t ON st.trip_id = t.trip_id AND st.feed_import_id = t.feed_import_id
     JOIN gtfs_routes r ON t.route_id = r.route_id AND t.feed_import_id = r.feed_import_id
     WHERE st.feed_import_id = ? AND st.stop_id = ?
     ORDER BY st.stop_sequence, st.trip_id`,
    [activeFeedId, stopId]
  );

  const s = stops[0];
  return NextResponse.json({
    stop: {
      stopId: s.stop_id, stopName: s.stop_name,
      stopLat: s.stop_lat != null ? Number(s.stop_lat) : null,
      stopLon: s.stop_lon != null ? Number(s.stop_lon) : null,
      locationType: s.location_type, parentStation: s.parent_station,
      wheelchairBoarding: s.wheelchair_boarding,
    },
    stopTimes: times.map(t => ({
      tripId: t.st_trip_id, arrivalTime: t.st_arrival_time, departureTime: t.st_departure_time,
      stopSequence: t.st_stop_sequence, routeId: t.r_route_id, tripHeadsign: t.t_trip_headsign,
    })),
  });
}