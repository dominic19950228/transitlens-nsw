/**
 * Unit tests for calendar_dates.txt import.
 * Tests the batch inserter SQL parameters and verifies FILE_TO_TABLE_MAPPING.
 * Dates are stored in original GTFS YYYYMMDD format (CHAR(8) in DB).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { insertBatch } from "../src/import/batchInserters.js";
import { FILE_TO_TABLE_MAPPING } from "../src/import/types.js";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";

describe("calendar_dates.txt insertBatch", () => {
    let mockQuery: ReturnType<typeof vi.fn>;
    let mockConn: PoolConnection;

    beforeEach(() => {
        mockQuery = vi.fn().mockImplementation(async (sql: string, values: unknown[]) => {
            return [{ affectedRows: 0 }];
        });
        mockConn = {
            query: mockQuery,
        } as unknown as PoolConnection;
    });

    it("should call query with correct SQL and parameters for calendar_dates.txt", async () => {
        const importId = 1;
        const records = [
            { serviceId: "svc_1", date: "20230101", exceptionType: 1 },
            { serviceId: "svc_1", date: "20230102", exceptionType: 2 },
        ];

        await insertBatch(mockConn, importId, "calendar_dates.txt", records, 100);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

        // Verify SQL structure
        expect(sql).toContain("INSERT INTO gtfs_calendar_dates");
        expect(sql).toContain("feed_import_id");
        expect(sql).toContain("service_id");
        expect(sql).toContain("date");
        expect(sql).toContain("exception_type");

        // Verify exact parameter order: importId prepended, then columns in order for each record
        // GTFS dates remain in YYYYMMDD format (stored as CHAR(8) in DB)
        // Expected: [importId, serviceId, date, exceptionType, importId, serviceId, date, exceptionType]
        expect(params).toEqual([
            1, "svc_1", "20230101", 1,
            1, "svc_1", "20230102", 2,
        ]);
    });

    it("should handle exceptionType as 1 (service added) and 2 (service removed)", async () => {
        const records = [
            { serviceId: "weekday", date: "20230601", exceptionType: 1 },
            { serviceId: "weekday", date: "20230602", exceptionType: 2 },
        ];

        await insertBatch(mockConn, 1, "calendar_dates.txt", records, 100);

        const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
        // Verify dates remain in YYYYMMDD format
        expect(params).toContain("20230601");
        expect(params).toContain("20230602");
        // Check exception types are preserved as numbers
        expect(params).toContain(1);
        expect(params).toContain(2);
    });

    it("should return affectedRows count from query", async () => {
        mockQuery.mockResolvedValue([{ affectedRows: 2 } as ResultSetHeader]);

        const result = await insertBatch(
            mockConn,
            1,
            "calendar_dates.txt",
            [
                { serviceId: "svc_1", date: "20230101", exceptionType: 1 },
                { serviceId: "svc_1", date: "20230102", exceptionType: 1 },
            ],
            100
        );

        expect(result).toBe(2);
    });
});

describe("calendar_dates.txt mapping", () => {
    it("should have FILE_TO_TABLE_MAPPING for calendar_dates.txt", () => {
        expect(FILE_TO_TABLE_MAPPING["calendar_dates.txt"]).toBeDefined();
        expect(FILE_TO_TABLE_MAPPING["calendar_dates.txt"].table).toBe("gtfs_calendar_dates");
        expect(FILE_TO_TABLE_MAPPING["calendar_dates.txt"].columns).toContain("feed_import_id");
        expect(FILE_TO_TABLE_MAPPING["calendar_dates.txt"].columns).toContain("service_id");
        expect(FILE_TO_TABLE_MAPPING["calendar_dates.txt"].columns).toContain("date");
        expect(FILE_TO_TABLE_MAPPING["calendar_dates.txt"].columns).toContain("exception_type");
    });
});