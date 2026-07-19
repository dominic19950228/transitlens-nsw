/**
 * TypeScript interfaces for GTFS data types.
 * Uses camelCase property names matching GTFS specification.
 */

export type GtfsFileName =
    | "agency.txt"
    | "stops.txt"
    | "routes.txt"
    | "trips.txt"
    | "stop_times.txt"
    | "calendar.txt"
    | "calendar_dates.txt"
    | "shapes.txt"
    | "feed_info.txt"
    | "frequencies.txt"
    | "transfers.txt";

export interface Agency {
    agencyId: string | null;
    agencyName: string;
    agencyUrl: string;
    agencyTimezone: string;
}

export interface Stop {
    stopId: string;
    stopName: string;
    stopLat: number;
    stopLon: number;
    locationType: number | null;
    parentStation: string | null;
    wheelchairBoarding: number | null;
}

export interface Route {
    routeId: string;
    agencyId: string | null;
    routeShortName: string | null;
    routeLongName: string | null;
    routeType: number;
}

export interface Trip {
    routeId: string;
    serviceId: string;
    tripId: string;
    tripHeadsign: string | null;
    tripShortName: string | null;
    directionId: number | null;
    blockId: string | null;
    shapeId: string | null;
    wheelchairAccessible: number | null;
    bikesAllowed: number | null;
}

export interface StopTime {
    tripId: string;
    arrivalTime: string;
    departureTime: string;
    stopId: string;
    stopSequence: number;
    stopHeadsign: string | null;
    pickupType: number | null;
    dropOffType: number | null;
    timepoint: number | null;
}

export interface Calendar {
    serviceId: string;
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
    startDate: string;
    endDate: string;
}

export interface CalendarDate {
    serviceId: string;
    date: string;
    exceptionType: number;
}

export interface Shape {
    shapeId: string;
    shapePtLat: number;
    shapePtLon: number;
    shapePtSequence: number;
    shapeDistTraveled: number | null;
}

export interface FeedInfo {
    feedPublisherName: string | null;
    feedPublisherUrl: string | null;
    feedLang: string | null;
    feedStartDate: string | null;
    feedEndDate: string | null;
    feedVersion: string | null;
    feedContactEmail: string | null;
    feedContactUrl: string | null;
}

export interface Frequency {
    tripId: string;
    startTime: string;
    endTime: string;
    headwaySecs: number;
    exactTimes: number | null;
}

export interface Transfer {
    fromStopId: string;
    toStopId: string;
    transferType: number | null;
    minTransferTime: number | null;
}

export interface ParseIssue {
    fileName: string;
    row: number;
    field?: string;
    message: string;
    value?: string;
}

export interface ParsedFileStats {
    fileName: string;
    processedRows: number;
    acceptedRows: number;
    rejectedRows: number;
    warningCount: number;
    errorCount: number;
}

export interface ParseGtfsOptions {
    extractedDirectory: string;
    batchSize?: number;
    maxIssues?: number;
    onBatch: (
        fileName: GtfsFileName,
        records: readonly unknown[]
    ) => Promise<void>;
}

export interface ParseGtfsResult {
    parsedAt: string;
    files: ParsedFileStats[];
    totalProcessedRows: number;
    totalAcceptedRows: number;
    totalRejectedRows: number;
    warningCount: number;
    errorCount: number;
    issues: ParseIssue[];
    issuesTruncated: boolean;
}

export type ParsedRecord =
    | Agency
    | Stop
    | Route
    | Trip
    | StopTime
    | Calendar
    | CalendarDate
    | Shape
    | FeedInfo
    | Frequency
    | Transfer;