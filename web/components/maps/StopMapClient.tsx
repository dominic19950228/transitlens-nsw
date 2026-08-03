"use client";

import dynamic from "next/dynamic";
import type { StopMapLocation } from "./mapTypes";

const StopMap = dynamic(() => import("./StopMap"), {
  ssr: false,
  loading: () => (
    <div className="h-80 sm:h-96 w-full bg-slate-200 animate-pulse rounded-lg flex items-center justify-center text-muted">
      Loading map...
    </div>
  ),
});

export default function StopMapClient({ location }: { location: StopMapLocation }) {
  return <StopMap location={location} />;
}