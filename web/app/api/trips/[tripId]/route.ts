import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";
import { query, requireActiveFeedId } from "@/lib/db";
import type { TripDetailDto } from "@/types";

export const dynamic = "force-dynamic";

interface TripRow extends mysql.RowDataPacket {
  trip_id: string;
  route_id: string;
  route_short_name: string | null;
  route_long_name: string | null;
  service_id: string;
  trip_headsign: string | null;
  direction_id: number | null;
  block_id: string | null;
  shape_id: string | null;
}

interface StopTimeRow extends mysql.RowDataPacket {
  stop_id: string;
  stop_name: string;
  stop_sequence: number;
  arrival_time: string | null;
  departure_time: string | null;
  pickup_type: number | null;
  drop_off_type: number | null;
  stop_lat: string | null;
  stop_lon: string | null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  let activeFeedId: number;
  try {
    activeFeedId = await requireActiveFeedId();
  } catch (err: unknown) {
    if ((err as any)?.errorCode === "NO_ACTIVE_FEED")
      return NextResponse.json(
        { error: "NO_ACTIVE_FEED", message: "No active GTFS feed is available." },
        { status: 503 }
      );
    throw err;
  }

  const { tripId } = await params;

  // Query trip with route information
  const trips = await query<TripRow[]>(
    `SELECT t.trip_id, t.route_id, t.service_id, t.trip_headsign,
            t.direction_id, t.block_id, t.shape_id,
            r.route_short_name, r.route_long_name
     FROM gtfs_trips t
     JOIN gtfs_routes r ON t.route_id = r.route_id AND t.feed_import_id = r.feed_import_id
     WHERE t.feed_import_id = ? AND t.trip_id = ?`,
    [activeFeedId, tripId]
  );

  if (trips.length === 0) {
    return NextResponse.json(
      { error: "NOT_FOUND", message: "Trip not found." },
      { status: 404 }
    );
  }

  const tripRow = trips[0];

  // Query stop times joined with stops
  const stopTimes = await query<StopTimeRow[]>(
    `SELECT st.stop_id, s.stop_name, st.stop_sequence, st.arrival_time,
            st.departure_time, st.pickup_type, st.drop_off_type,
            s.stop_lat, s.stop_lon
     FROM gtfs_stop_times st
     JOIN gtfs_stops s ON st.stop_id = s.stop_id AND st.feed_import_id = s.feed_import_id
     WHERE st.feed_import_id = ? AND st.trip_id = ?
     ORDER BY st.stop_sequence ASC`,
    [activeFeedId, tripId]
  );

  const response: TripDetailDto = {
    trip: {
      tripId: tripRow.trip_id,
      routeId: tripRow.route_id,
      routeShortName: tripRow.route_short_name,
      routeLongName: tripRow.route_long_name,
      serviceId: tripRow.service_id,
      tripHeadsign: tripRow.trip_headsign,
      directionId: tripRow.direction_id,
      blockId: tripRow.block_id,
      shapeId: tripRow.shape_id,
    },
    stopTimes: stopTimes.map((st) => ({
      stopId: st.stop_id,
      stopName: st.stop_name,
      stopSequence: st.stop_sequence,
      arrivalTime: st.arrival_time,
      departureTime: st.departure_time,
      pickupType: st.pickup_type,
      dropOffType: st.drop_off_type,
      // Convert DECIMAL strings to numbers
      stopLat: st.stop_lat !== null ? Number(st.stop_lat) : null,
      stopLon: st.stop_lon !== null ? Number(st.stop_lon) : null,
    })),
  };

  return NextResponse.json(response);
}