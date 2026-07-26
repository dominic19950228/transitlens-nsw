/**
 * Formatting helpers for Trip Detail display.
 * Extracted for testability.
 */

/**
 * Format direction ID to human-readable label.
 * @param directionId - GTFS direction_id (0 = Outbound, 1 = Inbound)
 * @returns Human-readable direction label or "—" for unknown values
 */
export function formatDirection(directionId: number | null | undefined): string {
  if (directionId === 0) return "Outbound";
  if (directionId === 1) return "Inbound";
  return "—";
}

/**
 * Format pickup type to human-readable label.
 * @param type - GTFS pickup_type (0=Regular, 1=Not available, 2=Phone agency, 3=Coordinate with driver)
 * @returns Human-readable pickup type label or "—" for unknown values
 */
export function formatPickupType(type: number | null | undefined): string {
  if (type === 0) return "Regular";
  if (type === 1) return "Not available";
  if (type === 2) return "Phone agency";
  if (type === 3) return "Coordinate with driver";
  return "—";
}

/**
 * Format drop-off type to human-readable label.
 * Uses the same GTFS codes as pickup_type.
 * @param type - GTFS drop_off_type
 * @returns Human-readable drop-off type label or "—" for unknown values
 */
export function formatDropOffType(type: number | null | undefined): string {
  return formatPickupType(type);
}