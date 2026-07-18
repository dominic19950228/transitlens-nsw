/**
 * GTFS Data Types - Step 3 of NSW Transit Platform
 * TypeScript interfaces for all GTFS static feed files.
 * Reference: https://gtfs.org/schedule/reference/
 */

// ============================================================================
// Required GTFS files
// ============================================================================

/**
 * agency.txt - Transit agencies that provide the data
 * REQUIRED
 */
export interface Agency {
  agencyId: string;
  agencyName: string;
  agencyUrl: string;
  agencyTimezone: string;
  agencyLang: string | null;
  agencyPhone: string | null;
  agencyFareUrl: string | null;
  agencyEmail: string | null;
}

/**
 * stops.txt - Stops where vehicles pick up or drop off passengers
 * REQUIRED
 */
export interface Stop {
  stopId: string;
  stopCode: string | null;
  stopName: string;
  stopDesc: string | null;
  stopLat: number;
  stopLon: number;
  zoneId: string | null;
  stopUrl: string | null;
  locationType: 0 | 1 | 2 | 3 | 4;
  parentStation: string | null;
  stopTimezone: string | null;
  wheelchairBoarding: 0 | 1 | 2;
  platformCode: string | null;
  zoneId_alternate: string | null;
}

/**
 * routes.txt - Transit routes
 * REQUIRED
 */
export interface Route {
  routeId: string;
  agencyId: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  routeDesc: string | null;
  routeType: number;
  routeUrl: string | null;
  routeColor: string | null;
  routeTextColor: string | null;
  routeSortOrder: number | null;
}

/**
 * trips.txt - Trips for each route
 * REQUIRED
 */
export interface Trip {
  routeId: string;
  serviceId: string;
  tripId: string;
  tripHeadsign: string | null;
  tripShortName: string | null;
  directionId: 0 | 1 | null;
  blockId: string | null;
  shapeId: string | null;
  wheelchairAccessible: 0 | 1 | 2;
  bikesAllowed: 0 | 1 | 2;
}

/**
 * stop_times.txt - Times for each trip
 * REQUIRED
 */
export interface StopTime {
  tripId: string;
  arrivalTime: string; // HH:MM:SS format, can be > 24:00:00 for times past midnight
  departureTime: string;
  stopId: string;
  stopSequence: number;
  stopHeadsign: string | null;
  pickupType: 0 | 1 | 2 | 3;
  dropOffType: 0 | 1 | 2 | 3;
  continuousPickup: 0 | 1 | 2 | 3;
  continuousDropOff: 0 | 1 | 2 | 3;
  shapeDistTraveled: number | null;
  timepoint: 0 | 1;
}

// ============================================================================
// Service availability files
// ============================================================================

/**
 * calendar.txt - Service IDs with weekly schedule
 * One of calendar.txt OR calendar_dates.txt is REQUIRED
 */
export interface Calendar {
  serviceId: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startDate: string; // YYYYMMDD
  endDate: string; // YYYYMMDD
}

/**
 * calendar_dates.txt - Service exceptions
 * One of calendar.txt OR calendar_dates.txt is REQUIRED
 */
export interface CalendarDate {
  serviceId: string;
  date: string; // YYYYMMDD
  exceptionType: 1 | 2; // 1=service added, 2=service removed
}

// ============================================================================
// Optional GTFS files
// ============================================================================

/**
 * shapes.txt - Geographic shapes for trips
 * OPTIONAL
 */
export interface Shape {
  shapeId: string;
  shapePtLat: number;
  shapePtLon: number;
  shapePtSequence: number;
  shapeDistTraveled: number | null;
}

/**
 * feed_info.txt - Dataset metadata
 * OPTIONAL
 */
export interface FeedInfo {
  feedPublisherName: string;
  feedPublisherUrl: string;
  feedLang: string;
  feedStartDate: string | null;
  feedEndDate: string | null;
  feedVersion: string | null;
  feedContactEmail: string | null;
  feedContactUrl: string | null;
}

/**
 * frequencies.txt - Headway-based service intervals
 * OPTIONAL
 */
export interface Frequency {
  tripId: string;
  startTime: string; // HH:MM:SS
  endTime: string;
  headwaySecs: number;
  exactTimes: 0 | 1;
}

/**
 * transfers.txt - Rules for connections between stops
 * OPTIONAL
 */
export interface Transfer {
  fromStopId: string;
  toStopId: string;
  transferType: 0 | 1 | 2 | 3 | 4;
  minTransferTime: number | null;
  fromRouteId: string | null;
  toRouteId: string | null;
  fromTripId: string | null;
  toTripId: string | null;
}

/**
 * pathways.txt - Pathways between stops
 * OPTIONAL
 */
export interface Pathway {
  pathwayId: string;
  fromStopId: string;
  toStopId: string;
  pathwayMode: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  isBidirectional: 0 | 1;
  length: number | null;
  traversalTime: number | null;
  stairCount: number | null;
  maxSlope: number | null;
  minWidth: number | null;
  signpostedAs: string | null;
  reversedSignpostedAs: string | null;
}

/**
 * levels.txt - Level information for stations
 * OPTIONAL
 */
export interface Level {
  levelId: string;
  levelIndex: number | null;
  levelName: string | null;
}

/**
 * translations.txt - Translation of text
 * OPTIONAL
 */
export interface Translation {
  tableName: string;
  fieldName: string;
  language: string;
  translation: string;
  recordSubId: string | null;
}

// ============================================================================
// Aggregate parsed GTFS dataset
// ============================================================================

export interface ParsedGtfs {
  agency: Agency[];
  stops: Stop[];
  routes: Route[];
  trips: Trip[];
  stopTimes: StopTime[];
  calendar: Calendar[];
  calendarDates: CalendarDate[];
  shapes: Shape[];
  feedInfo: FeedInfo | null;
  frequencies: Frequency[];
  transfers: Transfer[];
  pathways: Pathway[];
  levels: Level[];
  translations: Translation[];
}

export interface ParseGtfsOptions {
  extractedDirectory: string;
  validateRequired?: boolean;
}

export interface ParseGtfsResult {
  data: ParsedGtfs;
  parsedAt: string;
  fileStats: {
    [fileName: string]: {
      rows: number;
      bytes: number;
    };
  };
  errors: ParseWarning[];
}

export interface ParseWarning {
  fileName: string;
  row: number;
  field: string;
  message: string;
  value: unknown;
}
