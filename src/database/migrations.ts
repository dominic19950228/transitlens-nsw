/**
 * Database migrations module.
 * Executes schema.sql against the configured database.
 */

import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDatabasePool } from "./pool.js";
import { getDatabaseConfig } from "../config/env.js";

/**
 * Parse SQL statements from a multi-statement SQL string.
 * Removes comment lines and splits by semicolon.
 */
export function parseSqlStatements(sql: string): string[] {
    return sql
        .split(/\r?\n/)
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

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

interface ColumnNullableInfo {
    tableName: string;
    columnName: string;
    alterStatement: string;
}

const NULLABLE_COLUMNS: ColumnNullableInfo[] = [
    {
        tableName: "gtfs_stops",
        columnName: "stop_lat",
        alterStatement: "ALTER TABLE gtfs_stops MODIFY stop_lat DECIMAL(10,7) NULL",
    },
    {
        tableName: "gtfs_stops",
        columnName: "stop_lon",
        alterStatement: "ALTER TABLE gtfs_stops MODIFY stop_lon DECIMAL(10,7) NULL",
    },
    {
        tableName: "gtfs_stop_times",
        columnName: "arrival_time",
        alterStatement: "ALTER TABLE gtfs_stop_times MODIFY arrival_time VARCHAR(32) NULL",
    },
    {
        tableName: "gtfs_stop_times",
        columnName: "departure_time",
        alterStatement: "ALTER TABLE gtfs_stop_times MODIFY departure_time VARCHAR(32) NULL",
    },
];

/**
 * Check if a column is nullable.
 */
async function isColumnNullable(
    connection: mysql.PoolConnection,
    database: string,
    tableName: string,
    columnName: string
): Promise<boolean> {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT IS_NULLABLE
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [database, tableName, columnName]
    );
    return rows.length > 0 && rows[0].IS_NULLABLE === "YES";
}

/**
 * Make nullable columns configurable (NULL) if not already nullable.
 * Uses conditional ALTER to prevent unnecessary table locks.
 */
async function migrateNullableColumns(connection: mysql.PoolConnection, database: string): Promise<number> {
    let alterCount = 0;

    for (const col of NULLABLE_COLUMNS) {
        const isNullable = await isColumnNullable(connection, database, col.tableName, col.columnName);

        if (!isNullable) {
            try {
                await connection.query(col.alterStatement);
                alterCount++;
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Failed to alter ${col.tableName}.${col.columnName}: ${message}`);
            }
        }
    }

    return alterCount;
}

/**
 * Run database migrations.
 * Reads schema.sql and executes it safely against the database.
 * Verifies all required tables exist after migration.
 */
export async function runMigrations(): Promise<MigrationResult> {
    const pool = getDatabasePool();
    const config = getDatabaseConfig();

    // Read schema file
    const schemaPath = join(process.cwd(), "database", "schema.sql");
    let schemaContent: string;
    try {
        schemaContent = readFileSync(schemaPath, "utf-8");
    } catch {
        throw new Error(`Schema file not found: ${schemaPath}`);
    }

    // Execute schema statements
    const schemaStatements = parseSqlStatements(schemaContent);

    let connection = await pool.getConnection();
    try {
        for (const statement of schemaStatements) {
            try {
                await connection.query(statement);
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Migration SQL failed: ${message}`);
            }
        }

        // Run conditional nullable column migration
        await migrateNullableColumns(connection, config.database);
    } finally {
        connection.release();
    }

    // Verify required tables using validated config
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