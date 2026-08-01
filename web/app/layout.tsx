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
        <nav className="flex items-center gap-6 bg-slate-800 px-6 py-3 shadow-sm">
          <span className="text-white font-bold text-base">TransitLens NSW</span>
          <Link href="/" className="text-slate-200 hover:text-white focus-visible:outline-2 focus-visible:outline-white px-2 py-1 rounded text-sm transition-colors">Dashboard</Link>
          <Link href="/routes" className="text-slate-200 hover:text-white focus-visible:outline-2 focus-visible:outline-white px-2 py-1 rounded text-sm transition-colors">Routes</Link>
          <Link href="/stops" className="text-slate-200 hover:text-white focus-visible:outline-2 focus-visible:outline-white px-2 py-1 rounded text-sm transition-colors">Stops</Link>
          <Link href="/imports" className="text-slate-200 hover:text-white focus-visible:outline-2 focus-visible:outline-white px-2 py-1 rounded text-sm transition-colors">Import History</Link>
        </nav>
        <main style={{ maxWidth: "1100px", margin: "0 auto", padding: "1.5rem 1rem" }}>
          {children}
        </main>
      </body>
    </html>
  );
}