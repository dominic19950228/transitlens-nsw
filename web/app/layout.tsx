import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TransitLens NSW",
  description: "NSW GTFS feed explorer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav-bar">
          <span style={{ fontWeight: 700, fontSize: "1rem" }}>TransitLens NSW</span>
          <Link href="/">Dashboard</Link>
          <Link href="/routes">Routes</Link>
          <Link href="/stops">Stops</Link>
          <Link href="/imports">Import History</Link>
        </nav>
        <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "1.5rem 1rem" }}>
          {children}
        </main>
      </body>
    </html>
  );
}