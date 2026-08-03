import type { StopMapLocation } from "@/components/maps/mapTypes";

function parseCoordinate(val: number | string | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === "") return null;
  const num = Number(str);
  if (isNaN(num) || !Number.isFinite(num)) return null;
  return num;
}

export function validateCoordinates(
  stopId: string,
  stopName: string | null | undefined,
  lat: number | string | null | undefined,
  lon: number | string | null | undefined
): StopMapLocation | null {
  const latitude = parseCoordinate(lat);
  const longitude = parseCoordinate(lon);

  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const trimmedName = stopName?.trim();
  return {
    stopId,
    stopName: trimmedName && trimmedName.length > 0 ? trimmedName : "Unnamed stop",
    latitude,
    longitude
  };
}