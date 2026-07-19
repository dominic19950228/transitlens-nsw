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

    beforeEach(async () => {
        vi.resetModules();
        mockReadFileSync = vi.fn();
        mockConnection = {
            query: vi.fn(),
            release: vi.fn(),
        };
        mockPool = {
            getConnection: vi.fn().mockResolvedValue(mockConnection),
            query: vi.fn(),
        };
        vi.doMock("node:fs", () => ({
            readFileSync: mockReadFileSync,
        }));
        vi.doMock("../src/database/pool.js", () => ({
            getDatabasePool: vi.fn().mockReturnValue(mockPool),
        }));
    });

    it("should execute SQL statements sequentially excluding comments", async () => {
        const { runMigrations, REQUIRED_TABLES } = await import("../src/database/migrations.js");
        mockReadFileSync.mockReturnValue(
            "-- comment\nCREATE TABLE test1 (id INT);\n-- another\nCREATE TABLE test2 (id INT);"
        );
        
        mockPool.query.mockResolvedValueOnce([REQUIRED_TABLES.map(t => ({ TABLE_NAME: t }))]);
        mockPool.query.mockResolvedValueOnce([[{ DEFAULT_CHARACTER_SET_NAME: "utf8mb4", DEFAULT_COLLATION_NAME: "utf8mb4_unicode_ci" }]]);
        mockPool.query.mockResolvedValueOnce([[{ version: "10.4.11" }]]);
        mockConnection.query.mockResolvedValue([{}]);

        await runMigrations();

        expect(mockConnection.query).toHaveBeenCalledTimes(2);
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
        
        mockPool.query.mockResolvedValueOnce([[{ TABLE_NAME: REQUIRED_TABLES[0] }]]);
        
        await expect(runMigrations()).rejects.toThrow(
            `Table verification failed. Missing tables: ${REQUIRED_TABLES.slice(1).join(", ")}`
        );
    });

    it("should pass configured database name to information_schema queries", async () => {
        const { runMigrations, REQUIRED_TABLES } = await import("../src/database/migrations.js");
        mockReadFileSync.mockReturnValue("SELECT 1;");
        
        mockPool.query.mockResolvedValueOnce([REQUIRED_TABLES.map(t => ({ TABLE_NAME: t }))]);
        mockPool.query.mockResolvedValueOnce([[{}]]);
        mockPool.query.mockResolvedValueOnce([[{ version: "1.0" }]]);

        await runMigrations();
        expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("WHERE TABLE_SCHEMA = ?"), ["nsw_transit"]);
        expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining("WHERE SCHEMA_NAME = ?"), ["nsw_transit"]);
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