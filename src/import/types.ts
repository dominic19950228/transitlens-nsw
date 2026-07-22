/**
 * TypeScript types for GTFS import.
 * Step 4B: Streaming batch import into MariaDB.
 */

import type { GtfsFileName } from "../parse/types.js";

export interface ImportGtfsOptions {
    extractedDirectory: string;
    parseBatchSize?: number;
    insertBatchSize?: number;
    maxIssues?: number;
}

export interface ImportGtfsResult {
    importId: number;
    extractedDirectory: string;
    status: "completed";
    completedAt: string;
    totalProcessedRows: number;
    totalAcceptedRows: number;
    totalRejectedRows: number;
    warningCount: number;
    errorCount: number;
    importedRowsByFile: Record<string, number>;
}

export interface ImportStats {
    totalProcessedRows: number;
    totalAcceptedRows: number;
    totalRejectedRows: number;
    warningCount: number;
    errorCount: number;
    rowsByFile: Map<GtfsFileName, number>;
}

export interface FeedManifest {
    schemaVersion?: number;
    generatedAt?: string;
    sourceZip?: {
        sizeBytes?: number;
        sha256?: string;
    };
    files?: Array<{
        fileName: string;
        sizeBytes?: number;
        sha256?: string;
    }>;
}

export interface FileColumnMapping {
    table: string;
    columns: string[];
}

/**
 * Mapping from GTFS file names to database table and columns.
 * Column order must match the parameterized values order.
 */
export const FILE_TO_TABLE_MAPPING: Record<GtfsFileName, FileColumnMapping> = {
    "agency.txt": {
        table: "gtfs_agencies",
        columns: [
            "feed_import_id",
            "agency_id",
            "agency_name",
            "agency_url",
            "agency_timezone",
        ],
    },
    "stops.txt": {
        table: "gtfs_stops",
        columns: [
            "feed_import_id",
            "stop_id",
            "stop_name",
            "stop_lat",
            "stop_lon",
            "location_type",
            "parent_station",
            "wheelchair_boarding",
        ],
    },
    "routes.txt": {
        table: "gtfs_routes",
        columns: [
            "feed_import_id",
            "route_id",
            "agency_id",
            "route_short_name",
            "route_long_name",
            "route_type",
        ],
    },
    "trips.txt": {
        table: "gtfs_trips",
        columns: [
            "feed_import_id",
            "route_id",
            "service_id",
            "trip_id",
            "trip_headsign",
            "trip_short_name",
            "direction_id",
            "block_id",
            "shape_id",
            "wheelchair_accessible",
            "bikes_allowed",
        ],
    },
    "stop_times.txt": {
        table: "gtfs_stop_times",
        columns: [
            "feed_import_id",
            "trip_id",
            "arrival_time",
            "departure_time",
            "stop_id",
            "stop_sequence",
            "stop_headsign",
            "pickup_type",
            "drop_off_type",
            "timepoint",
        ],
    },
    "calendar.txt": {
        table: "gtfs_calendar",
        columns: [
            "feed_import_id",
            "service_id",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
            "start_date",
            "end_date",
        ],
    },
    "calendar_dates.txt": {
        table: "gtfs_calendar_dates",
        columns: [
            "feed_import_id",
            "service_id",
            "date",
            "exception_type",
        ],
    },
    "shapes.txt": {
        table: "gtfs_shapes",
        columns: [
            "feed_import_id",
            "shape_id",
            "shape_pt_lat",
            "shape_pt_lon",
            "shape_pt_sequence",
            "shape_dist_traveled",
        ],
    },
    "feed_info.txt": {
        table: "gtfs_feed_info",
        columns: [
            "feed_import_id",
            "feed_publisher_name",
            "feed_publisher_url",
            "feed_lang",
            "feed_start_date",
            "feed_end_date",
            "feed_version",
            "feed_contact_email",
            "feed_contact_url",
        ],
    },
    "frequencies.txt": {
        table: "gtfs_frequencies",
        columns: [
            "feed_import_id",
            "trip_id",
            "start_time",
            "end_time",
            "headway_secs",
            "exact_times",
        ],
    },
    "transfers.txt": {
        table: "gtfs_transfers",
        columns: [
            "feed_import_id",
            "from_stop_id",
            "to_stop_id",
            "transfer_type",
            "min_transfer_time",
        ],
    },
};