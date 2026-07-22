import { NextResponse } from "next/server";
import { query, resolveActiveFeedId } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  let dbStatus = "connected";
  let activeFeedId: number | null = null;

  try {
    activeFeedId = await resolveActiveFeedId();
  } catch {
    dbStatus = "disconnected";
  }

  return NextResponse.json({
    status: "ok",
    database: dbStatus,
    activeFeedId,
  });
}