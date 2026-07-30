/**
 * Batch insert functions for GTFS files.
 * Uses parameterized multi-row INSERT statements.
 */

import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import type { GtfsFileName } from "../parse/types.js";
import { FILE_TO_TABLE_MAPPING } from "./types.js";

/**
 * Wrapper error for database insert failures with context.
 */
export class DatabaseInsertError extends Error {
    constructor(
        public readonly fileName: string,
        public readonly batchRowCount: number,
        public readonly cause: unknown
    ) {
        const causeMessage = cause instanceof Error ? cause.message : String(cause);
        const mysqlCode = cause instanceof Error && "code" in cause
            ? String((cause as Error & { code: string }).code)
            : "";
        const codeSuffix = mysqlCode ? ` - ${mysqlCode}` : "";
        super(
            `Database insert failed for ${fileName} batch of ${batchRowCount} rows:${codeSuffix} ${causeMessage}`
        );
        this.name = "DatabaseInsertError";
    }
}

/**
 * Insert records using parameterized multi-row query.
 * Records are chunked by insertBatchSize.
 * 
 * @throws DatabaseInsertError if any chunk insertion fails
 */
export async function insertBatch(
    connection: PoolConnection,
    importId: number,
    fileName: GtfsFileName,
    records: readonly unknown[],
    insertBatchSize: number
): Promise<number> {
    const mapping = FILE_TO_TABLE_MAPPING[fileName];
    if (!mapping) {
        // Unknown file - skip silently
        return 0;
    }

    const { table, columns } = mapping;

    // Numeric accumulator for total inserted
    let totalInserted = 0;

    // Chunk the records
    for (let i = 0; i < records.length; i += insertBatchSize) {
        const chunk = records.slice(i, i + insertBatchSize);
        try {
            const inserted = await insertChunk(connection, importId, table, columns, chunk);
            totalInserted += inserted;
        } catch (error) {
            throw new DatabaseInsertError(fileName, chunk.length, error);
        }
    }

    return totalInserted;
}

/**
 * Insert a single chunk of records using parameterized multi-row INSERT.
 */
async function insertChunk(
    connection: PoolConnection,
    importId: number,
    table: string,
    columns: string[],
    records: readonly unknown[]
): Promise<number> {
    if (records.length === 0) {
        return 0;
    }

    // Build parameterized multi-row INSERT
    const placeholders = records.map(() => "(" + columns.map(() => "?").join(", ") + ")").join(", ");

    // Flatten values: for each record, prepend importId and map values
    const values: unknown[] = [];
    for (const record of records) {
        const rec = record as Record<string, unknown>;
        values.push(importId);
        for (const col of columns) {
            // Skip feed_import_id column (already added)
            if (col === "feed_import_id") continue;
            // Map GTFS camelCase to database snake_case
            const dbValue = mapValue(rec, col);
            values.push(dbValue);
        }
    }

    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders}`;

    const [result] = await connection.query<ResultSetHeader>(sql, values as (string | number | boolean | null)[]);
    return Number(result.affectedRows);
}

function snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Map GTFS record values to database values.
 * Handles null mapping for optional missing fields.
 * Keeps GTFS dates and times in original YYYYMMDD and HH:MM:SS format.
 */
function mapValue(record: Record<string, unknown>, column: string): unknown {
    const camelKey = snakeToCamel(column);
    const value = record[camelKey] !== undefined ? record[camelKey] : record[column];

    // Map null/undefined or empty string to SQL NULL
    if (value === null || value === undefined || value === "") {
        return null;
    }

    // Keep GTFS times as strings (including "25:15:00" style for over-24h times)
    if (column.includes("time") && typeof value === "string") {
        return value;
    }

    // Keep GTFS dates unchanged (YYYYMMDD format stored as CHAR(8))
    if (column === "date" || column.endsWith("_date")) {
        return value;
    }

    // Convert booleans to 0/1 for TINYINT
    if (typeof value === "boolean") {
        return value ? 1 : 0;
    }

    // Return numeric values as-is
    if (typeof value === "number") {
        return value;
    }

    // Return strings as-is
    return value;
}