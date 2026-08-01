import { query } from "@/lib/db";
import Link from "next/link";
import mysql from "mysql2/promise";

interface CountsRow extends mysql.RowDataPacket {
  routes: number;
  stops: number;
  trips: number;
  stop_times: number;
}
interface FeedRow extends mysql.RowDataPacket {
  id: number; source_directory: string; completed_at: string | null;
}

export const dynamic = "force-dynamic";

async function getCounts() {
  try {
    const [feed] = await query<FeedRow[]>(
      `SELECT id, source_directory, completed_at
       FROM gtfs_feed_imports WHERE status='completed' AND is_active=1
       ORDER BY completed_at DESC LIMIT 1`
    );
    if (!feed) return null;

    const [counts] = await query<CountsRow[]>(
      `SELECT
         (SELECT COUNT(*) FROM gtfs_routes WHERE feed_import_id=?) AS routes,
         (SELECT COUNT(*) FROM gtfs_stops WHERE feed_import_id=?) AS stops,
         (SELECT COUNT(*) FROM gtfs_trips WHERE feed_import_id=?) AS trips,
         (SELECT COUNT(*) FROM gtfs_stop_times WHERE feed_import_id=?) AS stop_times`,
      [feed.id, feed.id, feed.id, feed.id]
    );
    return { feed, counts };
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const data = await getCounts();

  if (!data) {
    return (
      <div style={{ textAlign: "center", padding: "3rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>TransitLens NSW</h1>
        <p style={{ color: "#64748b" }}>No active GTFS feed available. Import a feed to get started.</p>
      </div>
    );
  }

  const { feed, counts } = data;

  const cards = [
    { label: "Routes", value: counts.routes.toLocaleString(), href: "/routes" },
    { label: "Stops", value: counts.stops.toLocaleString(), href: "/stops" },
    { label: "Trips", value: counts.trips.toLocaleString(), href: "/routes" },
    { label: "Stop Times", value: counts.stop_times.toLocaleString(), href: "/routes" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.25rem" }}>Dashboard</h1>
      <p style={{ color: "#64748b", marginBottom: "2rem" }}>
        Feed #{feed.id} &middot; Imported {feed.completed_at ? new Date(feed.completed_at).toLocaleDateString() : "N/A"}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {cards.map(c => (
          <Link key={c.label} href={c.href} style={{ textDecoration: "none" }}>
            <div className="bg-white rounded-lg shadow-sm border border-border p-4" style={{ cursor: "pointer" }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b", marginBottom: "0.5rem" }}>
                {c.label}
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 700, color: "#0f172a" }}>
                {c.value}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
        <Link href="/routes" className="inline-flex items-center px-4 py-2 rounded-md bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors" style={{ justifyContent: "center" }}>Browse Routes</Link>
        <Link href="/stops" className="inline-flex items-center px-4 py-2 rounded-md border border-border bg-white text-primary font-medium text-sm hover:bg-surface transition-colors" style={{ justifyContent: "center" }}>Browse Stops</Link>
        <Link href="/imports" className="inline-flex items-center px-4 py-2 rounded-md border border-border bg-white text-primary font-medium text-sm hover:bg-surface transition-colors" style={{ justifyContent: "center" }}>Import History</Link>
      </div>
    </div>
  );
}