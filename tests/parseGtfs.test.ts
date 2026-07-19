/**
 * Tests for GTFS Parser (Step 3).
 * Uses Vitest with generated GTFS fixture files.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { parseGtfs } from "../src/parse/parseGtfs.js";
import type { GtfsFileName } from "../src/parse/types.js";
import { parseCsvFile } from "../src/parse/parseCsvFile.js";
import {
    isValidLatitude,
    isValidLongitude,
    isValidGtfsDate,
    isValidGtfsTime,
    isStrictInteger,
    isValidCalendarWeekday,
    weekdayToBoolean,
} from "../src/parse/validators.js";

// Test directory
const TEST_DIR = "./data/test-parse";

// Helper: Create extraction directory with GTFS files
async function createExtractionDir(
    dirPath: string,
    files: Record<string, string>
): Promise<void> {
    await mkdir(dirPath, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
        await writeFile(join(dirPath, name), content);
    }
    // Create minimal manifest
    await writeFile(
        join(dirPath, "feed-manifest.json"),
        JSON.stringify({
            schemaVersion: 1,
            files: Object.keys(files).map((name) => ({
                fileName: name,
                sizeBytes: files[name].length,
                sha256: "0".repeat(64),
            })),
        })
    );
}

// Helper: Minimal valid GTFS content
function minimalAgency(): string {
    return "agency_id,agency_name,agency_url,agency_timezone\n1,TfNSW,https://transportnsw.info,Australia/Sydney\n";
}

function minimalStops(): string {
    return "stop_id,stop_name,stop_lat,stop_lon\n1,Central,-33.8847,151.2093\n";
}

function minimalRoutes(): string {
    return "route_id,agency_id,route_short_name,route_long_name,route_type\n1,1,T1,City Express,2\n";
}

function minimalTrips(): string {
    return "route_id,service_id,trip_id\n1,1,1\n";
}

function minimalStopTimes(): string {
    return "trip_id,arrival_time,departure_time,stop_id,stop_sequence\n1,08:00:00,08:00:00,1,1\n";
}

function minimalCalendar(): string {
    return "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n1,1,1,1,1,1,0,0,20260101,20261231\n";
}

function minimalCalendarDates(): string {
    return "service_id,date,exception_type\n1,20260101,1\n";
}

function minimalShapes(): string {
    return "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n1,-33.8847,151.2093,1\n";
}

function minimalFeedInfo(): string {
    return "feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date\nTfNSW,https://transportnsw.info,en,20260101,20261231\n";
}

function minimalFrequencies(): string {
    return "trip_id,start_time,end_time,headway_secs\n't'1,08:00:00,09:00:00,300\n";
}

function minimalTransfers(): string {
    return "from_stop_id,to_stop_id,transfer_type\n1,2,0\n";
}

describe("parseGtfs", () => {
    beforeEach(async () => {
        await mkdir(TEST_DIR, { recursive: true });
    });

    afterEach(async () => {
        await rm(TEST_DIR, { recursive: true, force: true });
    });

    // Test 1: Valid required GTFS files
    it("should parse valid required GTFS files", async () => {
        const dirPath = join(TEST_DIR, "valid-required");
        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": minimalStops(),
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const batches: Array<{ fileName: string; records: readonly unknown[] }> = [];
        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async (fileName, records) => {
                batches.push({ fileName, records });
            },
        });

        expect(result.files.length).toBeGreaterThan(0);
        expect(result.totalProcessedRows).toBeGreaterThan(0);
        expect(result.totalAcceptedRows).toBeGreaterThan(0);
        expect(result.totalRejectedRows).toBe(0);
        expect(result.errorCount).toBe(0);
        expect(batches.length).toBeGreaterThan(0);
    });

// Test 2: Missing required header
    it("should report error when required header is missing", async () => {
        const dirPath = join(TEST_DIR, "missing-header");
        // Missing stop_lat and stop_lon from stops.txt
        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": "stop_id,stop_name\n1,Central\n",
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async () => {},
        });

        // Check that stops.txt had a header error
        const stopsFileStats = result.files.find((f) => f.fileName === "stops.txt");
        expect(stopsFileStats?.errorCount).toBeGreaterThan(0);
    });

    // Test 3: Missing required value
    it("should reject rows with missing required values", async () => {
        const dirPath = join(TEST_DIR, "missing-value");
        await createExtractionDir(dirPath, {
            "agency.txt": "agency_name,agency_url,agency_timezone\n,http://x.com,UTC\n",
            "stops.txt": minimalStops(),
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async () => {},
        });

        expect(result.totalRejectedRows).toBeGreaterThan(0);
        expect(result.totalAcceptedRows).toBeLessThan(result.totalProcessedRows);
    });

    // Test 4: Quoted comma
    it("should handle quoted commas in CSV fields", async () => {
        const dirPath = join(TEST_DIR, "quoted-comma");
        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": "stop_id,stop_name,stop_lat,stop_lon\n1,\"Central, Sydney\",-33.8847,151.2093\n",
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const deliveredRecords: any[] = [];
        await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async (fileName, recs) => {
                if (fileName === "stops.txt") {
                    deliveredRecords.push(...recs);
                }
            },
        });

        expect(deliveredRecords.length).toBe(1);
        expect(deliveredRecords[0].stopName).toBe("Central, Sydney");
    });

    // Test 5: Escaped quote
    it("should handle escaped quotes in CSV fields", async () => {
        const dirPath = join(TEST_DIR, "escaped-quote");
        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": 'stop_id,stop_name,stop_lat,stop_lon\n1,"Central ""The Hub""",-33.8847,151.2093\n',
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const deliveredRecords: any[] = [];
        await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async (fileName, recs) => {
                if (fileName === "stops.txt") {
                    deliveredRecords.push(...recs);
                }
            },
        });

        expect(deliveredRecords.length).toBe(1);
        expect(deliveredRecords[0].stopName).toBe('Central "The Hub"');
    });

    // Test 6: UTF-8 BOM
    it("should strip UTF-8 BOM from CSV files", async () => {
        const dirPath = join(TEST_DIR, "bom");
        const bom = "\uFEFF";
        await createExtractionDir(dirPath, {
            "agency.txt": bom + minimalAgency(),
            "stops.txt": minimalStops(),
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async () => {},
        });

        expect(result.errorCount).toBe(0);
    });

    // Test 7: CRLF line endings
    it("should handle CRLF line endings", async () => {
        const dirPath = join(TEST_DIR, "crlf");
        await createExtractionDir(dirPath, {
            "agency.txt": "agency_id,agency_name,agency_url,agency_timezone\r\n1,TfNSW,https://transportnsw.info,Australia/Sydney\r\n",
            "stops.txt": minimalStops().replace(/\n/g, "\r\n"),
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async () => {},
        });

        expect(result.totalProcessedRows).toBeGreaterThan(0);
    });

    // Test 8: Valid latitude and longitude
    it("should accept valid coordinates", () => {
        expect(isValidLatitude(0)).toBe(true);
        expect(isValidLatitude(-90)).toBe(true);
        expect(isValidLatitude(90)).toBe(true);
        expect(isValidLatitude(33.8847)).toBe(true);
        expect(isValidLongitude(0)).toBe(true);
        expect(isValidLongitude(-180)).toBe(true);
        expect(isValidLongitude(180)).toBe(true);
        expect(isValidLongitude(151.2093)).toBe(true);
    });

    // Test 9: Invalid latitude
    it("should reject invalid latitude values", () => {
        expect(isValidLatitude(91)).toBe(false);
        expect(isValidLatitude(-91)).toBe(false);
        expect(isValidLatitude(180)).toBe(false);
        expect(isValidLatitude(Infinity)).toBe(false);
        expect(isValidLatitude(NaN)).toBe(false);
        expect(isValidLatitude(NaN)).toBe(false);
    });

    // Test 10: Invalid longitude
    it("should reject invalid longitude values", () => {
        expect(isValidLongitude(181)).toBe(false);
        expect(isValidLongitude(-181)).toBe(false);
        expect(isValidLongitude(360)).toBe(false);
        expect(isValidLongitude(Infinity)).toBe(false);
        expect(isValidLongitude(NaN)).toBe(false);
    });

    // Test 11: Valid integer
    it("should accept valid integers", () => {
        expect(isStrictInteger("0")).toBe(true);
        expect(isStrictInteger("123")).toBe(true);
        expect(isStrictInteger("-456")).toBe(true);
        expect(isStrictInteger(789)).toBe(true);
        expect(isStrictInteger(0)).toBe(true);
        expect(isStrictInteger(-10)).toBe(true);
    });

    // Test 12: Invalid numeric trailing text
    it("should reject numbers with trailing characters", () => {
        expect(isStrictInteger("12abc")).toBe(false);
        expect(isStrictInteger("5.5xyz")).toBe(false);
        expect(isStrictInteger("NaN")).toBe(false);
        expect(isStrictInteger("1.0")).toBe(false);
        expect(isStrictInteger("1.5")).toBe(false);
    });

    // Test 13: Valid GTFS date
    it("should accept valid GTFS dates", () => {
        expect(isValidGtfsDate("20260101")).toBe(true);
        expect(isValidGtfsDate("20261231")).toBe(true);
        expect(isValidGtfsDate("20240229")).toBe(true); // leap year
        expect(isValidGtfsDate("20301231")).toBe(true);
    });

    // Test 14: Invalid GTFS date
    it("should reject invalid GTFS dates", () => {
        expect(isValidGtfsDate("20260230")).toBe(false);
        expect(isValidGtfsDate("20261301")).toBe(false);
        expect(isValidGtfsDate("abcd0101")).toBe(false);
        expect(isValidGtfsDate("20260229")).toBe(false); // not leap year
        expect(isValidGtfsDate("202601")).toBe(false);
        expect(isValidGtfsDate("")).toBe(false);
    });

    // Test 15: Valid time over 24 hours
    it("should accept GTFS times over 24 hours", () => {
        expect(isValidGtfsTime("08:30:00")).toBe(true);
        expect(isValidGtfsTime("23:59:59")).toBe(true);
        expect(isValidGtfsTime("24:00:00")).toBe(true);
        expect(isValidGtfsTime("24:10:00")).toBe(true);
        expect(isValidGtfsTime("27:45:30")).toBe(true);
        expect(isValidGtfsTime("100:00:00")).toBe(true);
    });

    // Test 16: Invalid minute
    it("should reject invalid minutes in GTFS times", () => {
        expect(isValidGtfsTime("12:60:00")).toBe(false);
        expect(isValidGtfsTime("12:99:00")).toBe(false);
        expect(isValidGtfsTime("12:-01:00")).toBe(false);
    });

    // Test 17: Invalid second
    it("should reject invalid seconds in GTFS times", () => {
        expect(isValidGtfsTime("12:00:99")).toBe(false);
        expect(isValidGtfsTime("12:00:60")).toBe(false);
        expect(isValidGtfsTime("12:00:-01")).toBe(false);
    });

    // Test 18: Invalid enum
    it("should reject invalid enum values", async () => {
        // direction_id should be 0 or 1 only
        const stopsWithBadEnum = "stop_id,stop_name,stop_lat,stop_lon,location_type\n1,Test,-33,151,99\n";
        const dirPath = join(TEST_DIR, "invalid-enum");
        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": stopsWithBadEnum,
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async () => {},
        });

        expect(result.totalRejectedRows).toBeGreaterThan(0);
    });

    // Test 19: Calendar weekday conversion
    it("should convert calendar weekdays to booleans", () => {
        expect(isValidCalendarWeekday(0)).toBe(true);
        expect(isValidCalendarWeekday(1)).toBe(true);
        expect(isValidCalendarWeekday(2)).toBe(false);
        expect(isValidCalendarWeekday(-1)).toBe(false);

        expect(weekdayToBoolean(0)).toBe(false);
        expect(weekdayToBoolean(1)).toBe(true);
    });

    // Test 20: Batch size enforcement
    it("should enforce batch size limits", async () => {
        const dirPath = join(TEST_DIR, "batch-enforce");
        // Create many stops to trigger multiple batches
        const manyStops = [
            "stop_id,stop_name,stop_lat,stop_lon",
            ...Array.from({ length: 250 }, (_, i) =>
                `${i + 1},Stop ${i + 1},${-33 + i * 0.001},${151 + i * 0.001}`
            ),
        ].join("\n");

        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": manyStops,
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const batches: { fileName: string; records: readonly unknown[] }[] = [];
        await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async (fileName, records) => {
                batches.push({ fileName, records });
            },
        });

        // Check that batches are bounded by batchSize
        for (const batch of batches) {
            expect(batch.records.length).toBeLessThanOrEqual(100);
        }
        // Should have multiple batches
        const stopBatches = batches.filter((b) => b.fileName === "stops.txt");
        expect(stopBatches.length).toBeGreaterThan(1);
    });

    // Test 21: Final partial batch
    it("should deliver final partial batch", async () => {
        const dirPath = join(TEST_DIR, "partial-batch");
        // 250 stops with batch size 100 = 3 batches (100, 100, 50)
        const manyStops = [
            "stop_id,stop_name,stop_lat,stop_lon",
            ...Array.from({ length: 250 }, (_, i) =>
                `${i + 1},Stop ${i + 1},${-33 + i * 0.001},${151 + i * 0.001}`
            ),
        ].join("\n");

        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": manyStops,
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const stopsBatches: { fileName: string; records: readonly unknown[] }[] = [];
        await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async (fileName, records) => {
                if (fileName === "stops.txt") {
                    stopsBatches.push({ fileName, records });
                }
            },
        });

        // Check the last stops batch has the remaining rows
        const lastStopsBatch = stopsBatches[stopsBatches.length - 1];
        expect(lastStopsBatch.records.length).toBe(50); // 250 % 100 = 50
    });

    // Test 22: onBatch is awaited
    it("should await onBatch before continuing", async () => {
        const dirPath = join(TEST_DIR, "await-batch");
        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": minimalStops(),
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const batchOrder: number[] = [];
        let callOrder = 0;

        await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async () => {
                batchOrder.push(++callOrder);
                await new Promise((r) => setTimeout(r, 5)); // Small delay
                batchOrder.push(++callOrder);
            },
        });

        // Each batch should have sequential order: start, end, start, end, ...
        for (let i = 0; i < batchOrder.length; i += 2) {
            expect(batchOrder[i + 1]).toBe(batchOrder[i] + 1);
        }
    });

    // Test 23: Rejected rows are not delivered
    it("should not deliver rejected rows to onBatch", async () => {
        const dirPath = join(TEST_DIR, "rejected-not-delivered");
        // One invalid stop with bad latitude, one valid
        const mixedStops =
            "stop_id,stop_name,stop_lat,stop_lon\n" +
            "1,Bad Stop,999,151\n" + // invalid lat
            "2,Good Stop,-33,151\n"; // valid

        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": mixedStops,
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const deliveredStops: string[] = [];
        await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async (fileName, records) => {
                if (fileName === "stops.txt") {
                    for (const rec of records) {
                        deliveredStops.push((rec as { stopId: string }).stopId);
                    }
                }
            },
        });

        // Only the valid stop should be delivered
        expect(deliveredStops).toContain("2");
        expect(deliveredStops).not.toContain("1");
    });

    // Test 24: Issue sample limit
    it("should truncate issues when maxIssues is reached", async () => {
        const dirPath = join(TEST_DIR, "issue-limit");
        // Many invalid rows to generate many issues
        const manyBadStops = [
            "stop_id,stop_name,stop_lat,stop_lon",
            ...Array.from({ length: 100 }, (_, i) =>
                `${i + 1},Stop,999,151` // invalid lat for all
            ),
        ].join("\n");

        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": manyBadStops,
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
        });

        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 10,
            maxIssues: 5,
            onBatch: async () => {},
        });

        expect(result.issuesTruncated).toBe(true);
        expect(result.issues.length).toBe(5);
        // But error count should reflect actual errors
        expect(result.errorCount).toBeGreaterThan(5);
    });

    // Test 25: Optional files are skipped
    it("should skip absent optional files without error", async () => {
        const dirPath = join(TEST_DIR, "optional-skip");
        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": minimalStops(),
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
            // No shapes.txt, feed_info.txt, etc.
        });

        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async () => {},
        });

        // Should succeed without errors about missing optional files
        const fileNames = result.files.map((f) => f.fileName);
        expect(fileNames).not.toContain("shapes.txt");
        expect(fileNames).not.toContain("feed_info.txt");
    });

    // Test 26: Large stop_times.txt produces multiple bounded batches
    it("should produce multiple bounded batches for large stop_times.txt", async () => {
        const dirPath = join(TEST_DIR, "large-stop-times");
        // Generate many stop times with valid GTFS format
        const manyStopTimes = [
            "trip_id,arrival_time,departure_time,stop_id,stop_sequence",
            ...Array.from({ length: 500 }, (_, i) =>
                `trip1,${Math.floor(i / 60).toString().padStart(2, "0")}:${(i % 60).toString().padStart(2, "0")}:00,${Math.floor(i / 60).toString().padStart(2, "0")}:${(i % 60).toString().padStart(2, "0")}:00,stop_${i},${i + 1}`
            ),
        ].join("\n");

        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": minimalStops(),
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": manyStopTimes,
            "calendar.txt": minimalCalendar(),
        });

        const batches: { fileName: string; records: readonly unknown[] }[] = [];
        await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async (fileName, records) => {
                batches.push({ fileName, records });
            },
        });

        // Check batches are bounded
        const stopTimeBatches = batches.filter((b) => b.fileName === "stop_times.txt");
        expect(stopTimeBatches.length).toBeGreaterThan(1);
        for (const batch of stopTimeBatches) {
            expect(batch.records.length).toBeLessThanOrEqual(100);
        }
        // Total should equal input
        const totalDelivered = stopTimeBatches.reduce((sum, b) => sum + b.records.length, 0);
        expect(totalDelivered).toBe(500);
    });

    // Test 27: Optional calendar_dates.txt support
    it("should parse calendar_dates.txt when present", async () => {
        const dirPath = join(TEST_DIR, "calendar-dates");
        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": minimalStops(),
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar_dates.txt": minimalCalendarDates(),
        });

        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async () => {},
        });

        expect(result.files.some((f) => f.fileName === "calendar_dates.txt")).toBe(true);
    });

    // Test 28: Shapes file parsing
    it("should parse shapes.txt when present", async () => {
        const dirPath = join(TEST_DIR, "shapes");
        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": minimalStops(),
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
            "shapes.txt": minimalShapes(),
        });

        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async () => {},
        });

        expect(result.files.some((f) => f.fileName === "shapes.txt")).toBe(true);
    });

    // Test 29: Feed info parsing
    it("should parse feed_info.txt when present", async () => {
        const dirPath = join(TEST_DIR, "feed-info");
        await createExtractionDir(dirPath, {
            "agency.txt": minimalAgency(),
            "stops.txt": minimalStops(),
            "routes.txt": minimalRoutes(),
            "trips.txt": minimalTrips(),
            "stop_times.txt": minimalStopTimes(),
            "calendar.txt": minimalCalendar(),
            "feed_info.txt": minimalFeedInfo(),
        });

        const result = await parseGtfs({
            extractedDirectory: dirPath,
            batchSize: 100,
            maxIssues: 100,
            onBatch: async () => {},
        });

        expect(result.files.some((f) => f.fileName === "feed_info.txt")).toBe(true);
    });
});

describe("Validator functions", () => {
    // Additional validator tests using imported functions

    it("should handle empty field conversion to null", async () => {
        const { toIntegerOrNull, toFloatOrNull } = await import("../src/parse/validators.js");
        expect(toIntegerOrNull("")).toBe(null);
        expect(toIntegerOrNull("  ")).toBe(null);
        expect(toIntegerOrNull(null)).toBe(null);
        expect(toIntegerOrNull("123")).toBe(123);
        expect(toFloatOrNull("")).toBe(null);
        expect(toFloatOrNull("3.14")).toBeCloseTo(3.14);
    });

    it("should validate direction_id enum", async () => {
        const { isValidDirectionId } = await import("../src/parse/validators.js");
        expect(isValidDirectionId(0)).toBe(true);
        expect(isValidDirectionId(1)).toBe(true);
        expect(isValidDirectionId(2)).toBe(false);
        expect(isValidDirectionId(null)).toBe(true);
    });

    it("should validate timepoint enum", async () => {
        const { isValidTimepoint } = await import("../src/parse/validators.js");
        expect(isValidTimepoint(0)).toBe(true);
        expect(isValidTimepoint(1)).toBe(true);
        expect(isValidTimepoint(2)).toBe(false);
        expect(isValidTimepoint(null)).toBe(true);
    });

    it("should validate exception_type", async () => {
        const { isValidExceptionType } = await import("../src/parse/validators.js");
        expect(isValidExceptionType(1)).toBe(true);
        expect(isValidExceptionType(2)).toBe(true);
        expect(isValidExceptionType(0)).toBe(false);
        expect(isValidExceptionType(3)).toBe(false);
    });
});
