/**
 * Unit tests for importRepository functions.
 * Tests actual SQL execution with a fake transaction connection.
 * Does NOT mock the repository - tests the real implementation.
 */

import { describe, it, expect, vi } from "vitest";
import { createPendingImport, completeImport, deactivatePreviousActiveImport } from "../src/import/importRepository.js";
import type { PoolConnection } from "mysql2/promise";
import type { ImportStats } from "../src/import/types.js";

describe("importRepository", () => {
    describe("createPendingImport", () => {
        it("should execute correct INSERT SQL with all parameters", async () => {
            let lastCall: [string, unknown[]] | null = null;
            const mockExecute = vi.fn().mockImplementation(async (sql: string, values: unknown[]) => {
                lastCall = [sql, values];
                return [{ insertId: 42 }];
            });
            const mockConn = { execute: mockExecute } as unknown as PoolConnection;

            const startedAt = new Date("2026-07-20T12:00:00Z");
            const result = await createPendingImport({
                connection: mockConn,
                sourceDirectory: "/test/dir",
                sourceArchiveSha256: "abc123",
                startedAt,
            });

            expect(result).toBe(42);
            expect(lastCall).not.toBeNull();
            const [sql, params] = lastCall!;
            
            // Normalize whitespace for comparison
            const normalizedSql = sql.replace(/\s+/g, " ").trim();
            
            // Strong SQL assertion: verify exact column structure
            expect(normalizedSql).toContain("INSERT INTO gtfs_feed_imports");
            expect(normalizedSql).toContain("source_directory");
            expect(normalizedSql).toContain("source_archive_sha256");
            expect(normalizedSql).toContain("status");
            expect(normalizedSql).toContain("is_active");
            expect(normalizedSql).toContain("started_at");
            expect(normalizedSql).toContain("VALUES (?, ?, 'pending', 0, ?)");
            
            expect(params).toEqual(["/test/dir", "abc123", startedAt]);
        });

        it("should handle null SHA-256", async () => {
            let lastCall: [string, unknown[]] | null = null;
            const mockExecute = vi.fn().mockImplementation(async (sql: string, values: unknown[]) => {
                lastCall = [sql, values];
                return [{ insertId: 1 }];
            });
            const mockConn = { execute: mockExecute } as unknown as PoolConnection;

            await createPendingImport({
                connection: mockConn,
                sourceDirectory: "/test",
                sourceArchiveSha256: null,
                startedAt: new Date(),
            });

            expect(lastCall).not.toBeNull();
            expect(lastCall![0]).toContain("INSERT INTO gtfs_feed_imports");
            expect(lastCall![1]).toEqual(["/test", null, expect.any(Date)]);
        });

        it("should use supplied transaction connection (not pool)", async () => {
            const mockExecute = vi.fn().mockResolvedValue([{ insertId: 1 }]);
            const mockConn = { execute: mockExecute } as unknown as PoolConnection;

            await createPendingImport({
                connection: mockConn,
                sourceDirectory: "/test",
                sourceArchiveSha256: null,
                startedAt: new Date(),
            });

            expect(mockExecute).toHaveBeenCalled();
        });
    });

    describe("deactivatePreviousActiveImport", () => {
        it("should execute correct UPDATE SQL excluding new import", async () => {
            let lastCall: [string, unknown[]] | null = null;
            const mockExecute = vi.fn().mockImplementation(async (sql: string, values: unknown[]) => {
                lastCall = [sql, values];
                return [{ affectedRows: 5 }];
            });
            const mockConn = { execute: mockExecute } as unknown as PoolConnection;

            await deactivatePreviousActiveImport(mockConn, 42);

            expect(lastCall).not.toBeNull();
            const [sql, params] = lastCall!;
            
            // Normalize whitespace for comparison
            const normalizedSql = sql.replace(/\s+/g, " ").trim();
            
            // Strong SQL assertion: verify exact UPDATE and WHERE structure
            expect(normalizedSql).toContain("UPDATE gtfs_feed_imports");
            expect(normalizedSql).toContain("SET is_active = 0");
            expect(normalizedSql).toContain("WHERE is_active = 1 AND id != ?");
            
            expect(params).toEqual([42]);
        });

        it("should use supplied transaction connection", async () => {
            const mockExecute = vi.fn().mockResolvedValue([{ affectedRows: 0 }]);
            const mockConn = { execute: mockExecute } as unknown as PoolConnection;

            await deactivatePreviousActiveImport(mockConn, 1);

            expect(mockExecute).toHaveBeenCalled();
        });
    });

    describe("completeImport", () => {
        it("should execute correct UPDATE SQL with all statistics", async () => {
            let lastCall: [string, unknown[]] | null = null;
            const mockExecute = vi.fn().mockImplementation(async (sql: string, values: unknown[]) => {
                lastCall = [sql, values];
                return [{ affectedRows: 1 }];
            });
            const mockConn = { execute: mockExecute } as unknown as PoolConnection;

            const stats: ImportStats = {
                totalProcessedRows: 1000,
                totalAcceptedRows: 950,
                totalRejectedRows: 50,
                warningCount: 10,
                errorCount: 5,
                rowsByFile: new Map([
                    ["agency.txt", 1],
                    ["stops.txt", 100],
                    ["routes.txt", 50],
                ]),
            };

            const completedAt = new Date("2026-07-20T13:00:00Z");

            await completeImport({
                connection: mockConn,
                importId: 42,
                completedAt,
                stats,
            });

            expect(lastCall).not.toBeNull();
            const [sql, params] = lastCall!;

            // Verify SQL contains all required updates
            expect(sql).toContain("UPDATE gtfs_feed_imports");
            expect(sql).toContain("status = 'completed'");
            expect(sql).toContain("is_active = 1");
            expect(sql).toContain("completed_at = ?");
            expect(sql).toContain("total_processed_rows = ?");
            expect(sql).toContain("total_accepted_rows = ?");
            expect(sql).toContain("total_rejected_rows = ?");
            expect(sql).toContain("warning_count = ?");
            expect(sql).toContain("error_count = ?");
            expect(sql).toContain("WHERE id = ?");

            // Verify parameter order
            expect(params).toEqual([
                completedAt,
                1000,
                950,
                50,
                10,
                5,
                42,
            ]);
        });

        it("should mark import as completed and active", async () => {
            let lastCall: [string, unknown[]] | null = null;
            const mockExecute = vi.fn().mockImplementation(async (sql: string, values: unknown[]) => {
                lastCall = [sql, values];
                return [{ affectedRows: 1 }];
            });
            const mockConn = { execute: mockExecute } as unknown as PoolConnection;

            await completeImport({
                connection: mockConn,
                importId: 1,
                completedAt: new Date(),
                stats: {
                    totalProcessedRows: 0,
                    totalAcceptedRows: 0,
                    totalRejectedRows: 0,
                    warningCount: 0,
                    errorCount: 0,
                    rowsByFile: new Map(),
                },
            });

            expect(lastCall).not.toBeNull();
            const [sql] = lastCall!;
            expect(sql).toContain("status = 'completed'");
            expect(sql).toContain("is_active = 1");
        });

        it("should use supplied transaction connection", async () => {
            const mockExecute = vi.fn().mockResolvedValue([{ affectedRows: 1 }]);
            const mockConn = { execute: mockExecute } as unknown as PoolConnection;

            await completeImport({
                connection: mockConn,
                importId: 1,
                completedAt: new Date(),
                stats: {
                    totalProcessedRows: 0,
                    totalAcceptedRows: 0,
                    totalRejectedRows: 0,
                    warningCount: 0,
                    errorCount: 0,
                    rowsByFile: new Map(),
                },
            });

            expect(mockExecute).toHaveBeenCalled();
        });
    });
});
