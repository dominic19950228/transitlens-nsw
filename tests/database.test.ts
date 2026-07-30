/**
 * Tests for Database module (Step 4A).
 * Tests config validation, pool management, and migrations.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDatabaseConfig, type DatabaseConfig } from "../src/config/env.js";

describe("Database config validation", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    // Test 1: Empty DB password is accepted
    it("should accept empty DB password", () => {
        process.env.DB_HOST = "127.0.0.1";
        process.env.DB_PORT = "3306";
        process.env.DB_USER = "root";
        process.env.DB_PASSWORD = "";
        process.env.DB_NAME = "nsw_transit";
        process.env.DB_CONNECTION_LIMIT = "5";

        expect(() => getDatabaseConfig()).not.toThrow();
        const config = getDatabaseConfig();
        expect(config.password).toBe("");
    });

    // Test 2: Empty DB host is rejected
    it("should reject empty DB host", () => {
        process.env.DB_HOST = "";
        process.env.DB_PORT = "3306";
        process.env.DB_USER = "root";
        process.env.DB_PASSWORD = "";
        process.env.DB_NAME = "nsw_transit";
        process.env.DB_CONNECTION_LIMIT = "5";

        expect(() => getDatabaseConfig()).toThrow("DB_HOST must not be empty");
    });

    // Test 3: Invalid DB port is rejected
    it("should reject invalid DB port", () => {
        process.env.DB_HOST = "127.0.0.1";
        process.env.DB_PORT = "not-a-number";
        process.env.DB_USER = "root";
        process.env.DB_PASSWORD = "";
        process.env.DB_NAME = "nsw_transit";
        process.env.DB_CONNECTION_LIMIT = "5";

        expect(() => getDatabaseConfig()).toThrow("DB_PORT must be a positive integer");
    });

    // Test 4: Zero DB port is rejected
    it("should reject zero DB port", () => {
        process.env.DB_HOST = "127.0.0.1";
        process.env.DB_PORT = "0";
        process.env.DB_USER = "root";
        process.env.DB_PASSWORD = "";
        process.env.DB_NAME = "nsw_transit";
        process.env.DB_CONNECTION_LIMIT = "5";

        expect(() => getDatabaseConfig()).toThrow("DB_PORT must be a positive integer");
    });

    // Test 5: Empty DB user is rejected
    it("should reject empty DB user", () => {
        process.env.DB_HOST = "127.0.0.1";
        process.env.DB_PORT = "3306";
        process.env.DB_USER = "";
        process.env.DB_PASSWORD = "";
        process.env.DB_NAME = "nsw_transit";
        process.env.DB_CONNECTION_LIMIT = "5";

        expect(() => getDatabaseConfig()).toThrow("DB_USER must not be empty");
    });

    // Test 6: Empty DB name is rejected
    it("should reject empty DB name", () => {
        process.env.DB_HOST = "127.0.0.1";
        process.env.DB_PORT = "3306";
        process.env.DB_USER = "root";
        process.env.DB_PASSWORD = "";
        process.env.DB_NAME = "";
        process.env.DB_CONNECTION_LIMIT = "5";

        expect(() => getDatabaseConfig()).toThrow("DB_NAME must not be empty");
    });

    // Test 7: Invalid connection limit is rejected
    it("should reject invalid connection limit", () => {
        process.env.DB_HOST = "127.0.0.1";
        process.env.DB_PORT = "3306";
        process.env.DB_USER = "root";
        process.env.DB_PASSWORD = "";
        process.env.DB_NAME = "nsw_transit";
        process.env.DB_CONNECTION_LIMIT = "not-a-number";

        expect(() => getDatabaseConfig()).toThrow("DB_CONNECTION_LIMIT must be a positive integer");
    });

    // Test 8: Zero connection limit is rejected
    it("should reject zero connection limit", () => {
        process.env.DB_HOST = "127.0.0.1";
        process.env.DB_PORT = "3306";
        process.env.DB_USER = "root";
        process.env.DB_PASSWORD = "";
        process.env.DB_NAME = "nsw_transit";
        process.env.DB_CONNECTION_LIMIT = "0";

        expect(() => getDatabaseConfig()).toThrow("DB_CONNECTION_LIMIT must be a positive integer");
    });
});

describe("Database pool", () => {
    let mockPool: { end: ReturnType<typeof vi.fn> };

    beforeEach(() => {
        vi.resetModules();
        mockPool = {
            end: vi.fn().mockResolvedValue(undefined),
        };
        process.env.DB_HOST = "127.0.0.1";
        process.env.DB_PORT = "3306";
        process.env.DB_USER = "root";
        process.env.DB_PASSWORD = "";
        process.env.DB_NAME = "nsw_transit";
        process.env.DB_CONNECTION_LIMIT = "5";
        const createPool = vi.fn().mockReturnValue(mockPool);
        vi.doMock("mysql2/promise", () => ({
            default: { createPool },
            createPool,
        }));
    });

    it("should not call createPool on import", async () => {
        const mysql = await import("mysql2/promise");
        await import("../src/database/pool.js");
        expect(mysql.default.createPool).not.toHaveBeenCalled();
    });

    it("should create exactly one pool on first call", async () => {
        const { getDatabasePool } = await import("../src/database/pool.js");
        const mysql = await import("mysql2/promise");
        getDatabasePool();
        expect(mysql.default.createPool).toHaveBeenCalledTimes(1);
    });

    it("should return the same pool on repeated calls", async () => {
        const { getDatabasePool } = await import("../src/database/pool.js");
        const mysql = await import("mysql2/promise");
        const pool1 = getDatabasePool();
        const pool2 = getDatabasePool();
        expect(pool1).toBe(pool2);
        expect(mysql.default.createPool).toHaveBeenCalledTimes(1);
    });

    it("should call end() exactly once on close", async () => {
        const { getDatabasePool, closeDatabasePool } = await import("../src/database/pool.js");
        getDatabasePool();
        await closeDatabasePool();
        expect(mockPool.end).toHaveBeenCalledTimes(1);
    });

    it("should handle closeDatabasePool safely before pool creation", async () => {
        const { closeDatabasePool } = await import("../src/database/pool.js");
        await expect(closeDatabasePool()).resolves.toBeUndefined();
        expect(mockPool.end).not.toHaveBeenCalled();
    });

    it("should create a new pool after close", async () => {
        const { getDatabasePool, closeDatabasePool } = await import("../src/database/pool.js");
        const mysql = await import("mysql2/promise");
        getDatabasePool();
        await closeDatabasePool();
        getDatabasePool();
        expect(mysql.default.createPool).toHaveBeenCalledTimes(2);
    });
});

describe("Database migrations", () => {
    let mockConnection: any;
    let mockPool: any;
    let mockReadFileSync: any;
    let mockReaddirSync: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.resetModules();
        mockReadFileSync = vi.fn();
        mockReaddirSync = vi.fn().mockReturnValue([]);
        mockConnection = {
            query: vi.fn(),
            execute: vi.fn(),
            release: vi.fn(),
        };
        mockPool = {
            getConnection: vi.fn().mockResolvedValue(mockConnection),
            query: vi.fn(),
        };
        vi.doMock("node:fs", () => ({
            existsSync: vi.fn().mockReturnValue(true),
            readFileSync: mockReadFileSync,
            readdirSync: mockReaddirSync,
        }));
        vi.doMock("../src/database/pool.js", () => ({
            getDatabasePool: vi.fn().mockReturnValue(mockPool),
        }));
    });

    it("should execute SQL statements sequentially excluding comments", async () => {
        const { runMigrations, REQUIRED_TABLES } = await import("../src/database/migrations.js");
        // First call returns schema.sql with 2 statements
        mockReadFileSync
            .mockReturnValueOnce("-- comment\nCREATE TABLE test1 (id INT);\n-- another\nCREATE TABLE test2 (id INT);");
        
        // Table verification (using pool.query)
        mockPool.query.mockResolvedValueOnce([REQUIRED_TABLES.map(t => ({ TABLE_NAME: t }))]);
        mockPool.query.mockResolvedValueOnce([[{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_unicode_ci" }]]);
        mockPool.query.mockResolvedValueOnce([[{ version: "10.4.11" }]]);
        
        // Connection queries for schema statements
        mockConnection.query.mockResolvedValue([{}]);
        // Connection queries for nullable column checks (4 columns x 2 queries each = 8 checks)
        // Each column: first query = check IS_NULLABLE, second = ALTER if needed
        // For this test, assume all columns are already nullable (IS_NULLABLE = YES)
        // Connection queries for nullable column checks (4 columns)
        // isColumnNullable uses connection.query
        mockConnection.query.mockResolvedValue([[{ IS_NULLABLE: "YES" }]]);

        await runMigrations();

        // Verify schema statements executed via connection.query (2 from schema + 4 from isColumnNullable)
        expect(mockConnection.query).toHaveBeenCalledTimes(6);
        expect(mockConnection.query).toHaveBeenNthCalledWith(1, "CREATE TABLE test1 (id INT)");
        expect(mockConnection.query).toHaveBeenNthCalledWith(2, "CREATE TABLE test2 (id INT)");
        expect(mockConnection.release).toHaveBeenCalled();
    });

    it("should release connection after a SQL error", async () => {
        const { runMigrations } = await import("../src/database/migrations.js");
        mockReadFileSync.mockReturnValue("FAIL;");
        mockConnection.query.mockRejectedValue(new Error("SQL Error"));

        await expect(runMigrations()).rejects.toThrow("Migration SQL failed: SQL Error");
        expect(mockConnection.release).toHaveBeenCalled();
    });

    it("should throw clear error listing missing tables", async () => {
        const { runMigrations, REQUIRED_TABLES } = await import("../src/database/migrations.js");
        mockReadFileSync.mockReturnValue("SELECT 1;");
        
        // Table verification returns only first table
        mockPool.query.mockResolvedValueOnce([[{ TABLE_NAME: REQUIRED_TABLES[0] }]]);
        
        // All nullable columns are already nullable (no ALTER needed)
        // isColumnNullable uses connection.query
        mockConnection.query.mockResolvedValue([[{ IS_NULLABLE: "YES" }]]);

        await expect(runMigrations()).rejects.toThrow(
            `Table verification failed. Missing tables: ${REQUIRED_TABLES.slice(1).join(", ")}`
        );
    });

    it("should pass configured database name to information_schema queries", async () => {
        const { runMigrations, REQUIRED_TABLES } = await import("../src/database/migrations.js");
        mockReadFileSync.mockReturnValue("SELECT 1;");
        
        // Table verification returns all required tables
        mockPool.query.mockResolvedValueOnce([REQUIRED_TABLES.map(t => ({ TABLE_NAME: t }))]);
        mockPool.query.mockResolvedValueOnce([[{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_unicode_ci" }]]);
        mockPool.query.mockResolvedValueOnce([[{ version: "1.0" }]]);

        // All nullable columns are already nullable
        // isColumnNullable uses connection.query, ALTER uses connection.execute
        mockConnection.query.mockResolvedValue([[{ IS_NULLABLE: "YES" }]]);

        await runMigrations();
        expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("WHERE TABLE_SCHEMA = ?"), ["nsw_transit"]);
        expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("WHERE SCHEMA_NAME = ?"), ["nsw_transit"]);
    });

    it("should trigger ALTER for NOT NULL columns", async () => {
        const { runMigrations, REQUIRED_TABLES } = await import("../src/database/migrations.js");
        mockReadFileSync.mockReturnValue("SELECT 1;");
        
        mockPool.query.mockResolvedValueOnce([REQUIRED_TABLES.map(t => ({ TABLE_NAME: t }))]);
        mockPool.query.mockResolvedValueOnce([[{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_unicode_ci" }]]);
        mockPool.query.mockResolvedValueOnce([[{ version: "10.4.11" }]]);

        // Track calls to query (used for both isColumnNullable checks and ALTER statements)
        const queryCalls: string[] = [];
        mockConnection.query.mockImplementation((sql: string) => {
            queryCalls.push(sql);
            if (sql.includes("information_schema.COLUMNS")) {
                // isColumnNullable returns NOT NULL (needs ALTER)
                return Promise.resolve([[{ IS_NULLABLE: "NO" }]]);
            }
            // ALTER statements succeed
            return Promise.resolve([{}]);
        });

        await runMigrations();

        // 4 ALTER statements should be executed via connection.query
        const alterCalls = queryCalls.filter(call => call.includes("ALTER TABLE"));
        expect(alterCalls.length).toBe(4);
        expect(alterCalls[0]!).toContain("ALTER TABLE gtfs_stops MODIFY stop_lat");
        expect(alterCalls[1]!).toContain("ALTER TABLE gtfs_stops MODIFY stop_lon");
        expect(alterCalls[2]!).toContain("ALTER TABLE gtfs_stop_times MODIFY arrival_time");
        expect(alterCalls[3]!).toContain("ALTER TABLE gtfs_stop_times MODIFY departure_time");
    });

    it("should skip ALTER for already nullable columns", async () => {
        const { runMigrations, REQUIRED_TABLES } = await import("../src/database/migrations.js");
        mockReadFileSync.mockReturnValue("SELECT 1;");
        
        mockPool.query.mockResolvedValueOnce([REQUIRED_TABLES.map(t => ({ TABLE_NAME: t }))]);
        mockPool.query.mockResolvedValueOnce([[{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_unicode_ci" }]]);
        mockPool.query.mockResolvedValueOnce([[{ version: "10.4.11" }]]);

        // All columns already nullable - isColumnNullable uses connection.query
        mockConnection.query.mockResolvedValue([[{ IS_NULLABLE: "YES" }]]);

        await runMigrations();

        // No ALTER statements should be executed
        const alterCalls = mockConnection.execute.mock.calls.filter(
            (call: unknown[]) => (call[0] as string).includes("ALTER TABLE")
        );
        expect(alterCalls.length).toBe(0);
    });

    it("should execute exactly zero ALTER when all four columns already nullable", async () => {
        const { runMigrations, REQUIRED_TABLES } = await import("../src/database/migrations.js");
        mockReadFileSync.mockReturnValue("SELECT 1;");
        
        mockPool.query.mockResolvedValueOnce([REQUIRED_TABLES.map(t => ({ TABLE_NAME: t }))]);
        mockPool.query.mockResolvedValueOnce([[{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_unicode_ci" }]]);
        mockPool.query.mockResolvedValueOnce([[{ version: "10.4.11" }]]);

        // All columns already nullable - isColumnNullable uses connection.query
        mockConnection.query.mockResolvedValue([[{ IS_NULLABLE: "YES" }]]);

        await runMigrations();

        // Verify no ALTER TABLE calls were made
        expect(mockConnection.execute).not.toHaveBeenCalledWith(
            expect.stringContaining("ALTER TABLE gtfs_stops")
        );
        expect(mockConnection.execute).not.toHaveBeenCalledWith(
            expect.stringContaining("ALTER TABLE gtfs_stop_times")
        );
    });

    it("should always release connection on success and failure", async () => {
        const { runMigrations, REQUIRED_TABLES } = await import("../src/database/migrations.js");
        mockReadFileSync.mockReturnValue("SELECT 1;");
        
        mockPool.query.mockResolvedValueOnce([REQUIRED_TABLES.map(t => ({ TABLE_NAME: t }))]);
        mockPool.query.mockResolvedValueOnce([[{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_unicode_ci" }]]);
        mockPool.query.mockResolvedValueOnce([[{ version: "10.4.11" }]]);
        // isColumnNullable uses connection.query
        mockConnection.query.mockResolvedValue([[{ IS_NULLABLE: "YES" }]]);

        await runMigrations();
        expect(mockConnection.release).toHaveBeenCalled();

        // Reset and test error case
        vi.resetModules();
        mockConnection.release.mockClear();
        mockConnection.query.mockRejectedValue(new Error("Connection error"));
        
        vi.doMock("node:fs", () => ({
            readFileSync: mockReadFileSync,
        }));
        vi.doMock("../src/database/pool.js", () => ({
            getDatabasePool: vi.fn().mockReturnValue(mockPool),
        }));

        const { runMigrations: runMigrations2 } = await import("../src/database/migrations.js");
        
        await expect(runMigrations2()).rejects.toThrow();
        expect(mockConnection.release).toHaveBeenCalled();
    });

    it("should execute allowlisted migration file 20260728-fix-id-collations.sql", async () => {
        const { REQUIRED_TABLES } = await import("../src/database/migrations.js");
        
        // Override readdirSync to return the allowlisted file
        const mockReaddirSync = vi.fn().mockReturnValue(["20260728-fix-id-collations.sql"]);
        vi.doMock("node:fs", () => ({
            existsSync: vi.fn().mockReturnValue(true),
            readFileSync: mockReadFileSync,
            readdirSync: mockReaddirSync,
        }));
        const { runMigrations: runMigrations2 } = await import("../src/database/migrations.js");
        
        mockReadFileSync
            .mockReturnValueOnce("SELECT 1;")                     // schema.sql
            .mockReturnValueOnce("SELECT 1;");                    // 20260728-fix-id-collations.sql
        
        mockPool.query.mockResolvedValue([REQUIRED_TABLES.map(t => ({ TABLE_NAME: t }))]);
        mockPool.query.mockResolvedValue([[{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_unicode_ci" }]]);
        mockPool.query.mockResolvedValue([[{ version: "10.4.11" }]]);
        
        mockConnection.query.mockReset();
        mockConnection.query
            .mockResolvedValueOnce([{}])   // schema SELECT 1
            .mockResolvedValueOnce([[{ IS_NULLABLE: "YES" }]])  // nullable check 1
            .mockResolvedValueOnce([[{ IS_NULLABLE: "YES" }]])  // nullable check 2
            .mockResolvedValueOnce([[{ IS_NULLABLE: "YES" }]])  // nullable check 3
            .mockResolvedValueOnce([[{ IS_NULLABLE: "YES" }]])  // nullable check 4
            .mockResolvedValueOnce([{}]);  // migration SELECT 1

        await runMigrations2();

        const readFileCalls = mockReadFileSync.mock.calls;
        const collationFileCall = readFileCalls.find(
            (call: unknown[]) => (call[0] as string).includes("20260728-fix-id-collations.sql")
        );
        expect(collationFileCall).toBeDefined();
    });

    it("should reject runMigrations when a migration SQL statement fails", async () => {
        const { REQUIRED_TABLES } = await import("../src/database/migrations.js");
        
        // Override readdirSync to return the allowlisted file
        const mockReaddirSync = vi.fn().mockReturnValue(["20260728-fix-id-collations.sql"]);
        vi.doMock("node:fs", () => ({
            existsSync: vi.fn().mockReturnValue(true),
            readFileSync: mockReadFileSync,
            readdirSync: mockReaddirSync,
        }));
        const { runMigrations: runMigrations2 } = await import("../src/database/migrations.js");
        
        mockReadFileSync
            .mockReturnValueOnce("SELECT 1;")                     // schema.sql
            .mockReturnValueOnce("ALTER TABLE nonexistent.x;");   // 20260728-fix-id-collations.sql (fails)
        
        // pool.query should use per-call resolves since it's called 3 times
        mockPool.query
            .mockResolvedValueOnce([REQUIRED_TABLES.map(t => ({ TABLE_NAME: t }))])
            .mockResolvedValueOnce([[{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_unicode_ci" }]])
            .mockResolvedValueOnce([[{ version: "10.4.11" }]]);
        
        mockConnection.query.mockReset();
        mockConnection.query
            .mockResolvedValueOnce([{}])   // schema SELECT 1
            .mockResolvedValueOnce([[{ IS_NULLABLE: "YES" }]])  // nullable check 1
            .mockResolvedValueOnce([[{ IS_NULLABLE: "YES" }]])  // nullable check 2
            .mockResolvedValueOnce([[{ IS_NULLABLE: "YES" }]])  // nullable check 3
            .mockResolvedValueOnce([[{ IS_NULLABLE: "YES" }]])  // nullable check 4
            .mockRejectedValueOnce(new Error("Table 'nsw_transit.nonexistent' doesn't exist"));  // migration ALTER

        await expect(runMigrations2()).rejects.toThrow(
            "Migration 20260728-fix-id-collations.sql failed: Table 'nsw_transit.nonexistent' doesn't exist"
        );
        expect(mockConnection.release).toHaveBeenCalled();
    });
});

describe("DatabaseConfig interface", () => {
    it("should export DatabaseConfig interface", async () => {
        const config: DatabaseConfig = {
            host: "127.0.0.1",
            port: 3306,
            user: "root",
            password: "",
            database: "nsw_transit",
            connectionLimit: 5,
        };

        expect(config.host).toBe("127.0.0.1");
        expect(config.port).toBe(3306);
        expect(config.user).toBe("root");
        expect(config.password).toBe("");
        expect(config.database).toBe("nsw_transit");
        expect(config.connectionLimit).toBe(5);
    });
});