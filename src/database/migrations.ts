/**
 * Database migrations module.
 * Executes schema.sql against the configured database.
 */

import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDatabasePool } from "./pool.js";
import { getDatabaseConfig } from "../config/env.js";

const REQUIRED_TABLES = [
    "gtfs_feed_imports",
    "gtfs_agencies",
    "gtfs_stops",
    "gtfs_routes",
    "gtfs_trips",
    "gtfs_stop_times",
    "gtfs_calendar",
    "gtfs_calendar_dates",
    "gtfs_shapes",
    "gtfs_feed_info",
    "gtfs_frequencies",
    "gtfs_transfers",
] as const;

export interface MigrationResult {
    success: boolean;
    tablesVerified: number;
    charset?: string;
    collation?: string;
    serverVersion?: string;
}

/**
 * Run database migrations.
 * Reads schema.sql and executes it safely against the database.
 * Verifies all required tables exist after migration.
 */
export async function runMigrations(): Promise<MigrationResult> {
    const pool = getDatabasePool();

    // Read schema file
    const schemaPath = join(process.cwd(), "database", "schema.sql");
    let schemaContent: string;
    try {
        schemaContent = readFileSync(schemaPath, "utf-8");
    } catch {
        throw new Error(`Schema file not found: ${schemaPath}`);
    }

    // Remove comment lines and split by semicolons
    const executableSql = schemaContent
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n");

    const statements = executableSql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

    // Execute each statement using a dedicated connection
    let connection = await pool.getConnection();
    try {
        for (const statement of statements) {
            try {
                await connection.query(statement);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Migration SQL failed: ${message}`);
            }
        }
    } finally {
        connection.release();
    }

    // Verify required tables using validated config
    const config = getDatabaseConfig();
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?`,
        [config.database]
    );

    const existingTables = new Set(rows.map((r) => r["TABLE_NAME"] as string));
    const missingTables = REQUIRED_TABLES.filter((t) => !existingTables.has(t));

    if (missingTables.length > 0) {
        throw new Error(
            `Table verification failed. Missing tables: ${missingTables.join(", ")}`
        );
    }

    // Get charset and collation info
    const [schemaRows] = await pool.query<mysql.RowDataPacket[]>(
        `SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME
         FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
        [config.database]
    );

    const charset = schemaRows[0]?.["DEFAULT_CHARACTER_SET_NAME"];
    const collation = schemaRows[0]?.["DEFAULT_COLLATION_NAME"];

    // Get server version
    const [versionRows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT VERSION() AS version"
    );
    const serverVersion = versionRows[0]?.["version"];

    return {
        success: true,
        tablesVerified: REQUIRED_TABLES.length,
        charset,
        collation,
        serverVersion,
    };
}

export { REQUIRED_TABLES };