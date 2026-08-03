import Link from "next/link";
import { notFound } from "next/navigation";
import { query, requireActiveFeedId, NoActiveFeedError } from "@/lib/db";
import { validateCoordinates } from "@/lib/mapHelpers";
import StopMapClient from "@/components/maps/StopMapClient";
import type { RowDataPacket } from "mysql2/promise";

interface StopRow extends RowDataPacket {
  stop_id: string; stop_name: string; stop_lat: string | null;
  stop_lon: string | null; location_type: number | null;
  parent_station: string | null; wheelchair_boarding: number | null;
}
interface StopTimeRow extends RowDataPacket {
  st_trip_id: string; st_arrival_time: string | null; st_departure_time: string | null;
  st_stop_sequence: number; r_route_id: string; t_trip_headsign: string | null;
}

export const dynamic = "force-dynamic";

export default async function StopDetailPage({ params }: { params: Promise<{ stopId: string }> }) {
  const { stopId } = await params;
  let activeFeedId: number;
  try {
    activeFeedId = await requireActiveFeedId();
  } catch (err: unknown) {
    if (err instanceof NoActiveFeedError) {
      return (
        <div style={{ textAlign: "center", padding: "3rem" }}>
          <h2 style={{ color: "#dc2626", marginBottom: "0.5rem" }}>No Active Feed</h2>
          <p style={{ color: "#64748b" }}>No active GTFS feed is available.</p>
          <Link href="/stops" className="inline-flex items-center px-4 py-2 rounded-md border border-border bg-white text-primary font-medium text-sm hover:bg-surface transition-colors" style={{ marginTop: "1rem" }}>Back to Stops</Link>
        </div>
      );
    }
    throw err;
  }

  const [stop] = await query<StopRow[]>(
    `SELECT stop_id, stop_name, stop_lat, stop_lon, location_type, parent_station, wheelchair_boarding
     FROM gtfs_stops WHERE feed_import_id = ? AND stop_id = ?`,
    [activeFeedId, stopId]
  );

  if (!stop) notFound();

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

  const mapLocation = validateCoordinates(stop.stop_id, stop.stop_name, stop.stop_lat, stop.stop_lon);

  const getWheelchair = (val: number | null) => {
    switch (val) {
      case 0: return "No info";
      case 1: return "Accessible";
      case 2: return "Not accessible";
      default: return "N/A";
    }
  };

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/stops" className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-white text-primary font-medium text-xs hover:bg-surface transition-colors">&larr; Back</Link>
        <h1 className="text-2xl font-bold">{stop.stop_name}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <div className="bg-white rounded-lg shadow-sm border border-border p-4">
          <h2 className="text-base font-semibold mb-4">Stop Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              ["Stop ID", stop.stop_id],
              ["Name", stop.stop_name],
              ["Latitude", mapLocation?.latitude.toFixed(6) ?? "N/A"],
              ["Longitude", mapLocation?.longitude.toFixed(6) ?? "N/A"],
              ["Location Type", stop.location_type === 0 ? "Stop" : stop.location_type === 1 ? "Station" : stop.location_type === 2 ? "Entrance" : stop.location_type != null ? `Type ${stop.location_type}` : "N/A"],
              ["Parent Station", stop.parent_station ?? "N/A"],
              ["Wheelchair", getWheelchair(stop.wheelchair_boarding)],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">{label}</div>
                <div>{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-border p-2">
           <h2 className="text-base font-semibold px-4 pt-4">Stop location</h2>
           <p className="px-4 pb-4 text-sm text-muted">Location supplied by the active GTFS feed.</p>
           {mapLocation ? (
             <StopMapClient location={mapLocation} />
           ) : (
             <div className="h-80 sm:h-96 w-full bg-surface rounded-lg flex flex-col items-center justify-center text-muted border border-dashed border-border">
               <p className="font-semibold">Map unavailable</p>
               <p className="text-sm">This stop does not contain valid coordinates.</p>
             </div>
           )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-border overflow-x-auto">
        <h2 className="text-base font-semibold p-4">Stop Times ({times.length.toLocaleString()})</h2>
        <table className="w-full border-collapse text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Trip</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Route</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Headsign</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Arrival</th>
              <th className="border-b border-border px-3 py-2 text-left font-semibold">Departure</th>
              <th className="border-b border-border px-3 py-2 text-center font-semibold">Seq</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {times.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted px-3 py-8">No stop times found.</td></tr>
            )}
            {times.map((t, i) => (
              <tr key={`${t.st_trip_id}-${t.st_stop_sequence}-${i}`} className="hover:bg-slate-50">
                <td className="px-3 py-2 font-mono text-xs">{t.st_trip_id}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.r_route_id}</td>
                <td className="px-3 py-2">{t.t_trip_headsign ?? "N/A"}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.st_arrival_time ?? "N/A"}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.st_departure_time ?? "N/A"}</td>
                <td className="px-3 py-2 text-center">{t.st_stop_sequence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}