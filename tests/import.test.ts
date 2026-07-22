/**
 * Comprehensive unit tests for GTFS Import functionality (Step 4B).
 * Verified using vitest and mocked database connections.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { importGtfs, ImportValidationError } from "../src/import/importGtfs.js";
import { checkDirectoryExists, checkGtfsFileExists, readFeedManifest, createPendingImport, completeImport, deactivatePreviousActiveImport, markImportFailed } from "../src/import/importRepository.js";
import { getDatabasePool } from "../src/database/pool.js";
import { parseGtfs } from "../src/parse/parseGtfs.js";
import type { GtfsFileName } from "../src/parse/types.js";

// Mock external modules
vi.mock("../src/database/pool.js", () => {
    const mockPool = {
        getConnection: vi.fn(),
    };
    return {
        getDatabasePool: vi.fn().mockReturnValue(mockPool),
    };
});

vi.mock("../src/parse/parseGtfs.js", () => {
    return {
        parseGtfs: vi.fn(),
    };
});

vi.mock("../src/import/importRepository.js", () => {
    return {
        checkDirectoryExists: vi.fn().mockResolvedValue(true),
        checkGtfsFileExists: vi.fn().mockResolvedValue(true),
        readFeedManifest: vi.fn().mockResolvedValue({ sourceZip: { sha256: "test-sha256" } }),
        createPendingImport: vi.fn().mockResolvedValue(1),
        completeImport: vi.fn().mockResolvedValue(undefined),
        markImportFailed: vi.fn().mockResolvedValue(undefined),
        deactivatePreviousActiveImport: vi.fn().mockResolvedValue(undefined),
    };
});

// Typed mock connection interface
interface MockConnection {
    queries: { sql: string; values: unknown[] }[];
    activeQueries: number;
    maxActiveQueries: number;
    beginTransactionCalled: boolean;
    commitCalled: boolean;
    rollbackCalled: boolean;
    rollbackError?: Error;
    released: boolean;
    beginTransaction: () => Promise<void>;
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
    release: () => void;
    execute: (sql: string, values?: unknown[]) => Promise<[{ insertId?: number; affectedRows?: number }]>;
    query: (sql: string, values?: unknown[]) => Promise<[{ insertId?: number; affectedRows?: number }]>;
    setRollbackError: (err: Error) => void;
}

// Helper Mock Connection Class
function createMockConnection(): MockConnection {
    const connection: MockConnection = {
        queries: [],
        activeQueries: 0,
        maxActiveQueries: 0,
        beginTransactionCalled: false,
        commitCalled: false,
        rollbackCalled: false,
        released: false,
        rollbackError: undefined,

        beginTransaction: async () => {
            connection.beginTransactionCalled = true;
        },

        commit: async () => {
            connection.commitCalled = true;
        },

        rollback: async () => {
            connection.rollbackCalled = true;
            if (connection.rollbackError) {
                throw connection.rollbackError;
            }
        },

        release: () => {
            connection.released = true;
        },

        setRollbackError: (err: Error) => {
            connection.rollbackError = err;
        },

        execute: async (sql: string, values?: unknown[]) => {
            return connection.query(sql, values);
        },

        query: async (sql: string, values?: unknown[]) => {
            connection.activeQueries++;
            if (connection.activeQueries > connection.maxActiveQueries) {
                connection.maxActiveQueries = connection.activeQueries;
            }

            // Add a slight delay to ensure we can catch concurrent insertions if any
            await new Promise((resolve) => setTimeout(resolve, 2));

            connection.queries.push({ sql, values: values || [] });
            connection.activeQueries--;

            if (sql.includes("INSERT INTO gtfs_feed_imports")) {
                return [{ insertId: 1 }];
            }

            // Mock affectedRows based on the number of placeholders
            let affectedRows = 1;
            const valuesPart = sql.split("VALUES")[1];
            if (valuesPart) {
                const chunks = valuesPart.split("),");
                affectedRows = chunks.length;
            }
            return [{ affectedRows }];
        },
    };
    return connection;
}

describe("GTFS Import Unit Tests", () => {
    let mockConnection: MockConnection;

    beforeEach(() => {
        vi.clearAllMocks();
        mockConnection = createMockConnection();
        const pool = getDatabasePool();
        (pool.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);

        // Reset default mock behaviors
        (checkDirectoryExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (checkGtfsFileExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (readFeedManifest as ReturnType<typeof vi.fn>).mockResolvedValue({ sourceZip: { sha256: "test-sha256" } });
    });

    // Test 1: invalid insert batch size is rejected (zero, negative, decimal, non-number, valid positive integer)
    it("1. should reject invalid insert batch size values", async () => {
        // Zero
        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
                insertBatchSize: 0,
            })
        ).rejects.toThrow("Insert batch size must be a positive integer");

        // Negative value
        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
                insertBatchSize: -100,
            })
        ).rejects.toThrow("Insert batch size must be a positive integer");

        // Decimal value
        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
                insertBatchSize: 10.5,
            })
        ).rejects.toThrow("Insert batch size must be a positive integer");

        // Non-number (undefined is allowed, but this is testing invalid values)
        // parseBatchSize uses Number.isInteger check
        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
                insertBatchSize: NaN as unknown as number,
            })
        ).rejects.toThrow("Insert batch size must be a positive integer");

        // Valid positive integer should not throw (need positive accepted rows for validation)
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 5,
            totalAcceptedRows: 5,
            totalRejectedRows: 0,
            warningCount: 0,
            errorCount: 0,
        });

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
                insertBatchSize: 1000,
            })
        ).resolves.toBeDefined();
    });

    // Test 2: pending import is created before parsing
    it("2. should create pending import before parsing", async () => {
        const orderOfOperations: string[] = [];

        // Mock repository's createPendingImport
        (createPendingImport as ReturnType<typeof vi.fn>).mockImplementation(() => {
            orderOfOperations.push("createPendingImport");
            return Promise.resolve(1);
        });

        // Mock parser to record order
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(() => {
            orderOfOperations.push("parseGtfs");
            return Promise.resolve({
                totalProcessedRows: 10,
                totalAcceptedRows: 10,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            });
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(orderOfOperations).toEqual(["createPendingImport", "parseGtfs"]);
    });

    // Test 3: parser file batches route to the correct tables
    it("3. should route parser file batches to the correct tables", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            // Deliver batch for agency.txt
            await options.onBatch("agency.txt", [
                { agencyId: "1", agencyName: "Agency 1", agencyUrl: "http://url", agencyTimezone: "Australia/Sydney" },
            ]);
            // Deliver batch for stops.txt
            await options.onBatch("stops.txt", [
                { stopId: "S1", stopName: "Stop 1", stopLat: -33.8, stopLon: 151.2 },
            ]);
            return {
                totalProcessedRows: 2,
                totalAcceptedRows: 2,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        const querySqls = mockConnection.queries.map((q) => q.sql);
        expect(querySqls.some((s) => s.includes("INSERT INTO gtfs_agencies"))).toBe(true);
        expect(querySqls.some((s) => s.includes("INSERT INTO gtfs_stops"))).toBe(true);
    });

    // Test 4: a parser batch larger than the insert limit is split correctly
    it("4. should split parser batch larger than insert limit correctly", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            const records = Array.from({ length: 2500 }, (_, i) => ({
                agencyId: String(i),
                agencyName: `Agency ${i}`,
                agencyUrl: "http://url",
                agencyTimezone: "Australia/Sydney",
            }));
            await options.onBatch("agency.txt", records);
            return {
                totalProcessedRows: 2500,
                totalAcceptedRows: 2500,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
            insertBatchSize: 1000,
        });

        const insertQueries = mockConnection.queries.filter((q) => q.sql.includes("INSERT INTO gtfs_agencies"));
        expect(insertQueries.length).toBe(3); // 1000, 1000, 500
        expect(insertQueries[0].values.length).toBe(1000 * 5); // 5 columns
        expect(insertQueries[1].values.length).toBe(1000 * 5);
        expect(insertQueries[2].values.length).toBe(500 * 5);
    });

    // Test 5: chunks are inserted sequentially
    it("5. should insert chunks sequentially and not concurrently", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            const records = Array.from({ length: 3000 }, (_, i) => ({
                agencyId: String(i),
                agencyName: `Agency ${i}`,
                agencyUrl: "http://url",
                agencyTimezone: "Australia/Sydney",
            }));
            await options.onBatch("agency.txt", records);
            return {
                totalProcessedRows: 3000,
                totalAcceptedRows: 3000,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
            insertBatchSize: 1000,
        });

        // maxActiveQueries tracks maximum number of queries executing concurrently in MockConnection
        expect(mockConnection.maxActiveQueries).toBe(1);
    });

    // Test 6: placeholders and flattened values are correct
    it("6. should format placeholders and flattened values correctly", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            await options.onBatch("agency.txt", [
                { agencyId: "A1", agencyName: "Agency 1", agencyUrl: "http://url", agencyTimezone: "Sydney" },
                { agencyId: "A2", agencyName: "Agency 2", agencyUrl: "http://url", agencyTimezone: "Sydney" },
            ]);
            return {
                totalProcessedRows: 2,
                totalAcceptedRows: 2,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        const insertQuery = mockConnection.queries.find((q) => q.sql.includes("INSERT INTO gtfs_agencies"));
        expect(insertQuery).toBeDefined();
        // Values mapping columns are [feed_import_id, agency_id, agency_name, agency_url, agency_timezone]
        expect(insertQuery!.sql).toBe("INSERT INTO gtfs_agencies (feed_import_id, agency_id, agency_name, agency_url, agency_timezone) VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)");
        expect(insertQuery!.values).toEqual([
            1, "A1", "Agency 1", "http://url", "Sydney",
            1, "A2", "Agency 2", "http://url", "Sydney",
        ]);
    });

    // Test 7: optional fields map to SQL null
    it("7. should map missing optional fields to SQL null", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            await options.onBatch("stops.txt", [
                { stopId: "S1", stopName: "Stop 1", stopLat: -33.8, stopLon: 151.2, locationType: null, parentStation: "", wheelchairBoarding: undefined },
            ]);
            return {
                totalProcessedRows: 1,
                totalAcceptedRows: 1,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        const insertQuery = mockConnection.queries.find((q) => q.sql.includes("INSERT INTO gtfs_stops"));
        expect(insertQuery).toBeDefined();
        // stops columns order: feed_import_id, stop_id, stop_name, stop_lat, stop_lon, location_type, parent_station, wheelchair_boarding
        expect(insertQuery!.values).toEqual([
            1, "S1", "Stop 1", -33.8, 151.2, null, null, null
        ]);
    });

    // Test 8: GTFS times over 24 hours remain strings
    it("8. should keep GTFS times over 24 hours as strings", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            await options.onBatch("stop_times.txt", [
                { tripId: "T1", arrivalTime: "25:15:00", departureTime: "25:20:00", stopId: "S1", stopSequence: 1 },
            ]);
            return {
                totalProcessedRows: 1,
                totalAcceptedRows: 1,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        const insertQuery = mockConnection.queries.find((q) => q.sql.includes("INSERT INTO gtfs_stop_times"));
        expect(insertQuery).toBeDefined();
        // stop_times columns: feed_import_id, trip_id, arrival_time, departure_time, stop_id, stop_sequence, stop_headsign, pickup_type, drop_off_type, timepoint
        expect(insertQuery!.values[2]).toBe("25:15:00");
        expect(insertQuery!.values[3]).toBe("25:20:00");
    });

    // Test 9: successful import commits
    it("9. should commit successful import", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 5,
            totalAcceptedRows: 5,
            totalRejectedRows: 0,
            warningCount: 0,
            errorCount: 0,
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(mockConnection.beginTransactionCalled).toBe(true);
        expect(mockConnection.commitCalled).toBe(true);
        expect(mockConnection.rollbackCalled).toBe(false);
    });

    // Test 10: successful import releases the connection
    it("10. should release connection after successful import", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 5,
            totalAcceptedRows: 5,
            totalRejectedRows: 0,
            warningCount: 0,
            errorCount: 0,
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(mockConnection.released).toBe(true);
    });

    // Test 11: parse failure rolls back
    it("11. should roll back on parser failure", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Parser failed catastrophically"));

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow("Parser failed catastrophically");

        expect(mockConnection.beginTransactionCalled).toBe(true);
        expect(mockConnection.commitCalled).toBe(false);
        expect(mockConnection.rollbackCalled).toBe(true);
    });

    // Test 12: insert failure rolls back
    it("12. should roll back on insert query failure", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            await options.onBatch("agency.txt", [
                { agencyId: "A1", agencyName: "Agency 1", agencyUrl: "http://url", agencyTimezone: "Sydney" },
            ]);
            return {
                totalProcessedRows: 1,
                totalAcceptedRows: 1,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        // Mock connection.query to throw on INSERT
        mockConnection.query = async (sql: string) => {
            if (sql.includes("INSERT INTO gtfs_agencies")) {
                throw new Error("Duplicate entry or database constraint failed");
            }
            if (sql.includes("INSERT INTO gtfs_feed_imports")) {
                return [{ insertId: 1 }];
            }
            return [{ affectedRows: 1 }];
        };

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow("Duplicate entry or database constraint failed");

        expect(mockConnection.commitCalled).toBe(false);
        expect(mockConnection.rollbackCalled).toBe(true);
    });

    // Test 13: failed import releases the connection
    it("13. should release connection on failed import", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Failure"));

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow("Failure");

        expect(mockConnection.released).toBe(true);
    });

    // Test 14: previous active feed is not disabled before all inserts succeed
    it("14. should not disable previous active feed before all inserts succeed", async () => {
        const querySequence: string[] = [];

        mockConnection.query = async (sql: string, _values?: unknown[]) => {
            if (sql.includes("INSERT INTO gtfs_agencies")) {
                querySequence.push("INSERT_AGENCY");
            } else if (sql.includes("INSERT INTO gtfs_feed_imports")) {
                querySequence.push("INSERT_IMPORT");
                return [{ insertId: 1 }];
            }
            return [{ affectedRows: 1 }];
        };

        (deactivatePreviousActiveImport as ReturnType<typeof vi.fn>).mockImplementation(() => {
            querySequence.push("DEACTIVATE_PREVIOUS");
            return Promise.resolve();
        });

        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            await options.onBatch("agency.txt", [
                { agencyId: "A1", agencyName: "Agency 1", agencyUrl: "http://url", agencyTimezone: "Sydney" },
            ]);
            return {
                totalProcessedRows: 1,
                totalAcceptedRows: 1,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        // The deactivation should happen AFTER the insertion of agency.txt
        expect(querySequence.indexOf("INSERT_AGENCY")).toBeLessThan(querySequence.indexOf("DEACTIVATE_PREVIOUS"));
    });

    // Test 15: successful import disables the previous active feed
    it("15. should disable previous active feed on successful import", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 5,
            totalAcceptedRows: 5,
            totalRejectedRows: 0,
            warningCount: 0,
            errorCount: 0,
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(deactivatePreviousActiveImport).toHaveBeenCalledWith(mockConnection, 1);
    });

    // Test 16: successful import marks the new import active
    it("16. should mark new import active on success", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 5,
            totalAcceptedRows: 5,
            totalRejectedRows: 0,
            warningCount: 0,
            errorCount: 0,
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(completeImport).toHaveBeenCalledWith(
            expect.objectContaining({
                importId: 1,
                stats: expect.objectContaining({
                    totalProcessedRows: 5,
                    totalAcceptedRows: 5,
                }),
            })
        );
    });

    // Test 17: duplicate-key errors are propagated
    it("17. should propagate duplicate-key errors", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            await options.onBatch("agency.txt", [
                { agencyId: "A1", agencyName: "Agency 1", agencyUrl: "http://url", agencyTimezone: "Sydney" },
            ]);
            return {
                totalProcessedRows: 1,
                totalAcceptedRows: 1,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        mockConnection.query = async (sql: string) => {
            if (sql.includes("INSERT INTO gtfs_agencies")) {
                const err = new Error("Duplicate entry '1-A1' for key 'PRIMARY'");
                (err as Error & { code: string }).code = "ER_DUP_ENTRY";
                throw err;
            }
            if (sql.includes("INSERT INTO gtfs_feed_imports")) {
                return [{ insertId: 1 }];
            }
            return [{ affectedRows: 1 }];
        };

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow("Duplicate entry '1-A1' for key 'PRIMARY'");
    });

    // Test 18: statistics are persisted when import succeeds
    it("18. should persist correct statistics on successful import", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 1500,
            totalAcceptedRows: 1400,
            totalRejectedRows: 100,
            warningCount: 10,
            errorCount: 0, // Must be 0 for successful import
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(completeImport).toHaveBeenCalledWith({
            connection: mockConnection,
            importId: 1,
            completedAt: expect.any(Date),
            stats: expect.objectContaining({
                totalProcessedRows: 1500,
                totalAcceptedRows: 1400,
                totalRejectedRows: 100,
                warningCount: 10,
                errorCount: 0,
            }),
        });
    });

    // Test 19: imported row counts by file are correct
    it("19. should return correct imported row counts by file", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            await options.onBatch("agency.txt", [
                { agencyId: "A1", agencyName: "A1", agencyUrl: "http://", agencyTimezone: "Sydney" },
            ]);
            await options.onBatch("stops.txt", [
                { stopId: "S1", stopName: "S1", stopLat: -33, stopLon: 151 },
                { stopId: "S2", stopName: "S2", stopLat: -33, stopLon: 151 },
            ]);
            return {
                totalProcessedRows: 3,
                totalAcceptedRows: 3,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        const result = await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(result.importedRowsByFile).toEqual({
            "agency.txt": 1,
            "stops.txt": 2,
        });
    });

    // Test: rollback failure handling - original error with successful rollback
    it("should throw original error when rollback succeeds", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Original parse error"));

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow("Original parse error");

        expect(mockConnection.rollbackCalled).toBe(true);
        expect(mockConnection.released).toBe(true);
    });

    // Test: rollback failure handling - original error plus rollback failure
    it("should throw AggregateError when both original error and rollback failure occur", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Original parse error"));
        mockConnection.setRollbackError(new Error("Rollback failed"));

        try {
            await importGtfs({
                extractedDirectory: "dummy-dir",
            });
            expect.fail("Should have thrown");
        } catch (err) {
            expect(err).toBeInstanceOf(AggregateError);
            const aggregate = err as AggregateError;
            expect(aggregate.message).toBe("Import failed and rollback also failed");
            expect(aggregate.errors.length).toBe(2);
            expect(aggregate.errors[0]).toBeInstanceOf(Error);
            expect((aggregate.errors[0] as Error).message).toBe("Original parse error");
            expect(aggregate.errors[1]).toBeInstanceOf(Error);
            expect((aggregate.errors[1] as Error).message).toBe("Rollback failed");
        }

        expect(mockConnection.rollbackCalled).toBe(true);
        expect(mockConnection.released).toBe(true);
    });

    // Test: ordering test - deactivate BEFORE complete
    it("should call deactivatePreviousActiveImport BEFORE completeImport", async () => {
        const callOrder: string[] = [];

        (deactivatePreviousActiveImport as ReturnType<typeof vi.fn>).mockImplementation(() => {
            callOrder.push("deactivatePreviousActiveImport");
            return Promise.resolve();
        });

        (completeImport as ReturnType<typeof vi.fn>).mockImplementation(() => {
            callOrder.push("completeImport");
            return Promise.resolve();
        });

        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 5,
            totalAcceptedRows: 5,
            totalRejectedRows: 0,
            warningCount: 0,
            errorCount: 0,
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(callOrder).toEqual(["deactivatePreviousActiveImport", "completeImport"]);
    });

    // Test: manifest reading - missing manifest returns null
    it("should handle missing feed-manifest.json gracefully", async () => {
        (readFeedManifest as ReturnType<typeof vi.fn>).mockResolvedValue(null);

        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 5,
            totalAcceptedRows: 5,
            totalRejectedRows: 0,
            warningCount: 0,
            errorCount: 0,
        });

        const result = await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        // Should work fine without manifest
        expect(result.status).toBe("completed");
    });

    // Test: manifest reading - valid manifest without hash uses SQL null
    it("should use SQL null for SHA-256 when manifest has no sourceZip", async () => {
        (readFeedManifest as ReturnType<typeof vi.fn>).mockResolvedValue({
            schemaVersion: 1,
            generatedAt: "2026-07-19T00:00:00Z",
            files: [],
        });

        // Reset mock to track the actual call
        (createPendingImport as ReturnType<typeof vi.fn>).mockImplementation(async (params: { sourceArchiveSha256: string | null }) => {
            // Verify that null is passed when no hash in manifest
            expect(params.sourceArchiveSha256).toBeNull();
            return 1;
        });

        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 5,
            totalAcceptedRows: 5,
            totalRejectedRows: 0,
            warningCount: 0,
            errorCount: 0,
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(createPendingImport).toHaveBeenCalled();
    });

    // Test: directory validation - file path should be rejected
    it("should reject a file path as extraction directory", async () => {
        (checkDirectoryExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

        await expect(
            importGtfs({
                extractedDirectory: "some-file.txt",
            })
        ).rejects.toThrow("Extraction directory does not exist or is not a directory");
    });
});

describe("findLatestExtraction", () => {
    it("should ignore .part directories", async () => {
        vi.resetModules();

        const mockReaddir = vi.fn().mockResolvedValue([
            { name: "feed_20260719_120000.part", isDirectory: () => true },
            { name: "feed_20260719_130000", isDirectory: () => true },
        ]);

        const mockReadFile = vi.fn().mockResolvedValue("{}");
        const mockStat = vi.fn().mockResolvedValue({ mtime: new Date("2026-07-19T13:00:00Z") });

        vi.doMock("node:fs/promises", () => ({
            readdir: mockReaddir,
            readFile: mockReadFile,
            stat: mockStat,
        }));

        const { findLatestExtraction: testFindLatest } = await import("../src/import/findLatestExtraction.js");
        const result = await testFindLatest("/test/base/dir");

        expect(result).toContain("feed_20260719_130000");
    });

    it("should ignore ordinary files", async () => {
        vi.resetModules();

        const mockReaddir = vi.fn().mockResolvedValue([
            { name: "some-file.zip", isDirectory: () => false },
            { name: "feed_20260719_130000", isDirectory: () => true },
        ]);

        const mockReadFile = vi.fn().mockResolvedValue("{}");
        const mockStat = vi.fn().mockResolvedValue({ mtime: new Date("2026-07-19T13:00:00Z") });

        vi.doMock("node:fs/promises", () => ({
            readdir: mockReaddir,
            readFile: mockReadFile,
            stat: mockStat,
        }));

        const { findLatestExtraction: testFindLatest } = await import("../src/import/findLatestExtraction.js");
        const result = await testFindLatest("/test/base/dir");

        expect(result).toContain("feed_20260719_130000");
    });

    it("should ignore missing manifest", async () => {
        vi.resetModules();

        const mockReaddir = vi.fn().mockResolvedValue([
            { name: "feed_no_manifest", isDirectory: () => true },
            { name: "feed_20260719_130000", isDirectory: () => true },
        ]);

        const mockReadFile = vi.fn().mockImplementation((path: string) => {
            if (path.includes("feed_no_manifest")) {
                const err = new Error("ENOENT");
                (err as NodeJS.ErrnoException).code = "ENOENT";
                return Promise.reject(err);
            }
            return Promise.resolve("{}");
        });

        const mockStat = vi.fn().mockResolvedValue({ mtime: new Date("2026-07-19T13:00:00Z") });

        vi.doMock("node:fs/promises", () => ({
            readdir: mockReaddir,
            readFile: mockReadFile,
            stat: mockStat,
        }));

        const { findLatestExtraction: testFindLatest } = await import("../src/import/findLatestExtraction.js");
        const result = await testFindLatest("/test/base/dir");

        expect(result).toContain("feed_20260719_130000");
    });

    it("should ignore malformed manifest", async () => {
        vi.resetModules();

        const mockReaddir = vi.fn().mockResolvedValue([
            { name: "feed_bad_json", isDirectory: () => true },
            { name: "feed_20260719_130000", isDirectory: () => true },
        ]);

        const mockReadFile = vi.fn().mockImplementation((path: string) => {
            if (path.includes("feed_bad_json")) {
                return Promise.resolve("not valid json {{{");
            }
            return Promise.resolve("{}");
        });

        const mockStat = vi.fn().mockResolvedValue({ mtime: new Date("2026-07-19T13:00:00Z") });

        vi.doMock("node:fs/promises", () => ({
            readdir: mockReaddir,
            readFile: mockReadFile,
            stat: mockStat,
        }));

        const { findLatestExtraction: testFindLatest } = await import("../src/import/findLatestExtraction.js");
        const result = await testFindLatest("/test/base/dir");

        expect(result).toContain("feed_20260719_130000");
    });

    it("should select newest valid manifest directory", async () => {
        vi.resetModules();

        const mockReaddir = vi.fn().mockResolvedValue([
            { name: "feed_20260719_110000", isDirectory: () => true },
            { name: "feed_20260719_130000", isDirectory: () => true },
        ]);

        const mockReadFile = vi.fn().mockResolvedValue("{}");

        const mockStat = vi.fn().mockImplementation((path: string) => {
            if (path.includes("feed_20260719_110000")) {
                return Promise.resolve({ mtime: new Date("2026-07-19T11:00:00Z") });
            }
            return Promise.resolve({ mtime: new Date("2026-07-19T13:00:00Z") });
        });

        vi.doMock("node:fs/promises", () => ({
            readdir: mockReaddir,
            readFile: mockReadFile,
            stat: mockStat,
        }));

        const { findLatestExtraction: testFindLatest } = await import("../src/import/findLatestExtraction.js");
        const result = await testFindLatest("/test/base/dir");

        expect(result).toContain("feed_20260719_130000");
    });

    it("should throw when base directory is unreadable", async () => {
        vi.resetModules();

        const mockReaddir = vi.fn().mockRejectedValue(new Error("EACCES: permission denied"));

        vi.doMock("node:fs/promises", () => ({
            readdir: mockReaddir,
            readFile: vi.fn(),
            stat: vi.fn(),
        }));

        const { findLatestExtraction: testFindLatest } = await import("../src/import/findLatestExtraction.js");
        await expect(testFindLatest("/forbidden/dir")).rejects.toThrow("Cannot read extraction directory: /forbidden/dir");
    });

    it("should throw when no valid extractions found", async () => {
        vi.resetModules();

        const mockReaddir = vi.fn().mockResolvedValue([
            { name: "feed_bad_json", isDirectory: () => true },
        ]);

        const mockReadFile = vi.fn().mockResolvedValue("not json");

        vi.doMock("node:fs/promises", () => ({
            readdir: mockReaddir,
            readFile: mockReadFile,
            stat: vi.fn(),
        }));

        const { findLatestExtraction: testFindLatest } = await import("../src/import/findLatestExtraction.js");
        await expect(testFindLatest("/test/base/dir")).rejects.toThrow("No completed extractions found");
    });
});

describe("Import Success Validation", () => {
    let mockConnection: MockConnection;

    beforeEach(() => {
        vi.clearAllMocks();
        mockConnection = createMockConnection();
        const pool = getDatabasePool();
        (pool.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockConnection);

        // Reset default mock behaviors
        (checkDirectoryExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (checkGtfsFileExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (readFeedManifest as ReturnType<typeof vi.fn>).mockResolvedValue({ sourceZip: { sha256: "test-sha256" } });
        (createPendingImport as ReturnType<typeof vi.fn>).mockResolvedValue(1);
        (completeImport as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (markImportFailed as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
        (deactivatePreviousActiveImport as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    // Test: zero errors and positive accepted rows completes successfully
    it("should complete import when zero errors and positive accepted rows", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 100,
            totalAcceptedRows: 100,
            totalRejectedRows: 0,
            warningCount: 5,
            errorCount: 0,
        });

        const result = await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(result.status).toBe("completed");
        expect(completeImport).toHaveBeenCalled();
        expect(deactivatePreviousActiveImport).toHaveBeenCalled();
        expect(mockConnection.commitCalled).toBe(true);
        expect(markImportFailed).not.toHaveBeenCalled();
    });

    // Test: errorCount > 0 produces failed, not completed
    it("should mark import as failed when errorCount > 0", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 100,
            totalAcceptedRows: 100,
            totalRejectedRows: 0,
            warningCount: 0,
            errorCount: 3,
        });

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow(ImportValidationError);

        expect(completeImport).not.toHaveBeenCalled();
        expect(markImportFailed).toHaveBeenCalled();
        expect(mockConnection.commitCalled).toBe(false);
        expect(mockConnection.rollbackCalled).toBe(true);
    });

    // Test: zero accepted rows produces failed
    it("should mark import as failed when zero accepted rows", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 100,
            totalAcceptedRows: 0,
            totalRejectedRows: 100,
            warningCount: 0,
            errorCount: 0,
        });

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow(ImportValidationError);

        expect(completeImport).not.toHaveBeenCalled();
        expect(markImportFailed).toHaveBeenCalled();
        expect(mockConnection.rollbackCalled).toBe(true);
    });

    // Test: thrown insert error produces failed
    it("should mark import as failed when insert throws error", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            await options.onBatch("agency.txt", [
                { agencyId: "A1", agencyName: "Agency 1", agencyUrl: "http://url", agencyTimezone: "Sydney" },
            ]);
            return {
                totalProcessedRows: 1,
                totalAcceptedRows: 1,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        mockConnection.query = async (sql: string) => {
            if (sql.includes("INSERT INTO gtfs_agencies")) {
                throw new Error("Database constraint violation");
            }
            if (sql.includes("INSERT INTO gtfs_feed_imports")) {
                return [{ insertId: 1 }];
            }
            return [{ affectedRows: 1 }];
        };

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow("Database constraint violation");

        expect(completeImport).not.toHaveBeenCalled();
        expect(markImportFailed).toHaveBeenCalled();
        expect(mockConnection.rollbackCalled).toBe(true);
    });

    // Test: failed import rolls back
    it("should roll back GTFS data when import fails", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Parser error"));

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow("Parser error");

        expect(mockConnection.rollbackCalled).toBe(true);
        expect(mockConnection.commitCalled).toBe(false);
    });

    // Test: failed import does not deactivate existing active feed
    it("should not call deactivatePreviousActiveImport when import fails", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 100,
            totalAcceptedRows: 0,
            totalRejectedRows: 100,
            warningCount: 0,
            errorCount: 0,
        });

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow(ImportValidationError);

        expect(deactivatePreviousActiveImport).not.toHaveBeenCalled();
    });

    // Test: failed import is never marked active
    it("should call markImportFailed (not completeImport) when import fails", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 100,
            totalAcceptedRows: 0,
            totalRejectedRows: 100,
            warningCount: 0,
            errorCount: 0,
        });

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow(ImportValidationError);

        expect(completeImport).not.toHaveBeenCalled();
        expect(markImportFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                importId: 1,
            })
        );
    });

    // Test: failed import metadata preserves summary counts
    it("should preserve summary counts when marking import as failed", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 500,
            totalAcceptedRows: 0,
            totalRejectedRows: 500,
            warningCount: 10,
            errorCount: 3,
        });

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow(ImportValidationError);

        expect(markImportFailed).toHaveBeenCalledWith(
            expect.objectContaining({
                stats: expect.objectContaining({
                    totalProcessedRows: 500,
                    totalAcceptedRows: 0,
                    totalRejectedRows: 500,
                    warningCount: 10,
                    errorCount: 3,
                }),
            })
        );
    });

    // Test: successful operation ordering is insert → deactivate → complete → commit
    it("should execute operations in correct order: insert data, deactivate, complete, commit", async () => {
        const callOrder: string[] = [];

        (createPendingImport as ReturnType<typeof vi.fn>).mockImplementation(() => {
            callOrder.push("createPendingImport");
            return Promise.resolve(1);
        });

        (deactivatePreviousActiveImport as ReturnType<typeof vi.fn>).mockImplementation(() => {
            callOrder.push("deactivatePreviousActiveImport");
            return Promise.resolve();
        });

        (completeImport as ReturnType<typeof vi.fn>).mockImplementation(() => {
            callOrder.push("completeImport");
            return Promise.resolve();
        });

        (parseGtfs as ReturnType<typeof vi.fn>).mockImplementation(async (options: { onBatch: (fileName: GtfsFileName, records: readonly unknown[]) => Promise<void> }) => {
            callOrder.push("parseAndInsert");
            await options.onBatch("agency.txt", [
                { agencyId: "A1", agencyName: "Agency 1", agencyUrl: "http://url", agencyTimezone: "Sydney" },
            ]);
            return {
                totalProcessedRows: 1,
                totalAcceptedRows: 1,
                totalRejectedRows: 0,
                warningCount: 0,
                errorCount: 0,
            };
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        // Expected order: createPendingImport, parseAndInsert, deactivatePreviousActiveImport, completeImport
        expect(callOrder).toEqual([
            "createPendingImport",
            "parseAndInsert",
            "deactivatePreviousActiveImport",
            "completeImport",
        ]);
        expect(mockConnection.commitCalled).toBe(true);
    });

    // Test: connection release occurs on both success and failure
    it("should release connection on success", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 10,
            totalAcceptedRows: 10,
            totalRejectedRows: 0,
            warningCount: 0,
            errorCount: 0,
        });

        await importGtfs({
            extractedDirectory: "dummy-dir",
        });

        expect(mockConnection.released).toBe(true);
    });

    it("should release connection on failure", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("Failure"));

        await expect(
            importGtfs({
                extractedDirectory: "dummy-dir",
            })
        ).rejects.toThrow("Failure");

        expect(mockConnection.released).toBe(true);
    });

    // Test: ImportValidationError has correct properties
    it("should throw ImportValidationError with correct properties", async () => {
        (parseGtfs as ReturnType<typeof vi.fn>).mockResolvedValue({
            totalProcessedRows: 100,
            totalAcceptedRows: 0,
            totalRejectedRows: 100,
            warningCount: 0,
            errorCount: 5,
        });

        try {
            await importGtfs({
                extractedDirectory: "dummy-dir",
            });
            expect.fail("Should have thrown ImportValidationError");
        } catch (err) {
            expect(err).toBeInstanceOf(ImportValidationError);
            const validationErr = err as ImportValidationError;
            expect(validationErr.errorCount).toBe(5);
            expect(validationErr.acceptedRows).toBe(0);
        }
    });
});
