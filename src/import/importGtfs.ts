/**
 * GTFS Import orchestrator.
 * Step 4B: Stream parsed GTFS batches and insert into MariaDB.
 */

import { parseGtfs } from "../parse/parseGtfs.js";
import { findLatestExtraction } from "./findLatestExtraction.js";
import type { GtfsFileName } from "../parse/types.js";
import type { ImportGtfsOptions, ImportGtfsResult, ImportStats } from "./types.js";
import { FILE_TO_TABLE_MAPPING } from "./types.js";

import {
    createPendingImport,
    completeImport,
    markImportFailed,
    deactivatePreviousActiveImport,
    readFeedManifest,
    checkGtfsFileExists,
    checkDirectoryExists,
} from "./importRepository.js";

import { insertBatch } from "./batchInserters.js";
import { getDatabasePool } from "../database/pool.js";
import type { PoolConnection } from "mysql2/promise";

// Required GTFS files
const REQUIRED_FILES: GtfsFileName[] = [
    "agency.txt",
    "stops.txt",
    "routes.txt",
    "trips.txt",
    "stop_times.txt",
] as const;

// Calendar files - at least one is required
const CALENDAR_FILES: GtfsFileName[] = [
    "calendar.txt",
    "calendar_dates.txt",
] as const;

const DEFAULT_PARSE_BATCH_SIZE = 10000;
const DEFAULT_INSERT_BATCH_SIZE = 1000;
const DEFAULT_MAX_ISSUES = 1000;

/**
 * Validation error for import failures.
 */
export class ImportValidationError extends Error {
    readonly errorCount: number;
    readonly acceptedRows: number;

    constructor(message: string, errorCount: number, acceptedRows: number) {
        super(message);
        this.name = "ImportValidationError";
        this.errorCount = errorCount;
        this.acceptedRows = acceptedRows;
    }
}

/**
 * Validate import options.
 * @throws Error if options are invalid
 */
function validateOptions(options: ImportGtfsOptions): void {
    if (!options.extractedDirectory) {
        throw new Error("Extracted directory is required");
    }
    if (options.parseBatchSize !== undefined && (!Number.isInteger(options.parseBatchSize) || options.parseBatchSize <= 0)) {
        throw new Error("Parse batch size must be a positive integer");
    }
    if (options.insertBatchSize !== undefined && (!Number.isInteger(options.insertBatchSize) || options.insertBatchSize <= 0)) {
        throw new Error("Insert batch size must be a positive integer");
    }
    if (options.maxIssues !== undefined && (!Number.isInteger(options.maxIssues) || options.maxIssues <= 0)) {
        throw new Error("Max issues must be a positive integer");
    }
}

/**
 * Check required GTFS files exist.
 * @throws Error with missing files list
 */
async function checkRequiredFiles(directory: string): Promise<void> {
    const missing: string[] = [];

    for (const file of REQUIRED_FILES) {
        const exists = await checkGtfsFileExists(directory, file);
        if (!exists) {
            missing.push(file);
        }
    }

    // Check for at least one calendar file
    const hasCalendar = await Promise.all(
        CALENDAR_FILES.map((f) => checkGtfsFileExists(directory, f))
    );
    if (!hasCalendar.some(Boolean)) {
        missing.push("calendar.txt OR calendar_dates.txt");
    }

    if (missing.length > 0) {
        throw new Error(`Missing required GTFS files: ${missing.join(", ")}`);
    }
}

/**
 * Validate that the import succeeded before marking it complete.
 * @throws ImportValidationError if validation fails
 */
function validateImportSuccess(stats: ImportStats): void {
    if (stats.errorCount > 0) {
        throw new ImportValidationError(
            `Import failed with ${stats.errorCount} error(s)`,
            stats.errorCount,
            stats.totalAcceptedRows
        );
    }

    if (stats.totalAcceptedRows === 0) {
        throw new ImportValidationError(
            "Import failed: no rows were accepted",
            stats.errorCount,
            stats.totalAcceptedRows
        );
    }
}

/**
 * Import GTFS feed from an extracted directory.
 * Uses a single transaction for all operations.
 * 
 * Success conditions:
 * - Parser/import finishes without fatal exception
 * - errorCount === 0
 * - acceptedRows > 0
 * - All database inserts succeed
 * - Transaction commits successfully
 */
export async function importGtfs(
    options: ImportGtfsOptions
): Promise<ImportGtfsResult> {
    const {
        extractedDirectory,
        parseBatchSize = DEFAULT_PARSE_BATCH_SIZE,
        insertBatchSize = DEFAULT_INSERT_BATCH_SIZE,
        maxIssues = DEFAULT_MAX_ISSUES,
    } = options;

    // Validate options
    validateOptions(options);

    // Check directory exists and is a directory
    const dirExists = await checkDirectoryExists(extractedDirectory);
    if (!dirExists) {
        throw new Error("Extraction directory does not exist or is not a directory");
    }

    // Check required files
    await checkRequiredFiles(extractedDirectory);

    // Get manifest for SHA-256 (sourceZip.sha256 is the archive hash)
    const manifest = await readFeedManifest(extractedDirectory);
    const sourceSha256 = manifest?.sourceZip?.sha256 ?? null;

    // Get database connection from pool
    const pool = getDatabasePool();
    const connection = await pool.getConnection();

    // Initialize stats tracking
    const stats: ImportStats = {
        totalProcessedRows: 0,
        totalAcceptedRows: 0,
        totalRejectedRows: 0,
        warningCount: 0,
        errorCount: 0,
        rowsByFile: new Map(),
    };

    let importId: number | null = null;
    let importCreated = false;
    const startedAt = new Date();
    const completedAt = new Date();

    try {
        // Begin transaction
        await connection.beginTransaction();

        // Create pending import record
        importId = await createPendingImport({
            connection,
            sourceDirectory: extractedDirectory,
            sourceArchiveSha256: sourceSha256,
            startedAt,
        });
        importCreated = true;

        // Parse GTFS and insert batches
        const parseResult = await parseGtfs({
            extractedDirectory,
            batchSize: parseBatchSize,
            maxIssues,
            onBatch: async (fileName: GtfsFileName, records: readonly unknown[]): Promise<void> => {
                // Skip unknown files
                if (!FILE_TO_TABLE_MAPPING[fileName]) {
                    return;
                }

                // Insert batch and track row counts
                const inserted = await insertBatch(
                    connection,
                    importId!,
                    fileName,
                    records,
                    insertBatchSize
                );

                // Update file-specific count
                const currentCount = stats.rowsByFile.get(fileName) ?? 0;
                stats.rowsByFile.set(fileName, currentCount + inserted);
            },
        });

        // Update statistics from parser result
        stats.totalProcessedRows = parseResult.totalProcessedRows;
        stats.totalAcceptedRows = parseResult.totalAcceptedRows;
        stats.totalRejectedRows = parseResult.totalRejectedRows;
        stats.warningCount = parseResult.warningCount;
        stats.errorCount = parseResult.errorCount;

        // Validate success conditions BEFORE modifying any state
        // This ensures we don't deactivate the previous feed or mark completion
        // if the import had errors or no accepted rows
        validateImportSuccess(stats);

        // Validation passed: proceed with completing the import
        // 1. Deactivate previous active imports FIRST
        await deactivatePreviousActiveImport(connection, importId);

        // 2. Complete this import (marks as completed and active)
        await completeImport({
            connection,
            importId,
            completedAt,
            stats,
        });

        // 3. Commit transaction
        await connection.commit();

        // Convert rowsByFile to Record<string, number>
        const importedRowsByFile: Record<string, number> = {};
        for (const [fileName, count] of stats.rowsByFile) {
            importedRowsByFile[fileName] = count;
        }

        return {
            importId,
            extractedDirectory,
            status: "completed",
            completedAt: completedAt.toISOString(),
            totalProcessedRows: stats.totalProcessedRows,
            totalAcceptedRows: stats.totalAcceptedRows,
            totalRejectedRows: stats.totalRejectedRows,
            warningCount: stats.warningCount,
            errorCount: stats.errorCount,
            importedRowsByFile,
        };
    } catch (err) {
        // Rollback GTFS data transaction
        let rollbackErr: Error | null = null;
        try {
            await connection.rollback();
        } catch (e) {
            rollbackErr = e instanceof Error ? e : new Error(String(e));
        }

        // If both original error and rollback error exist, wrap in AggregateError
        if (rollbackErr) {
            const agg = new AggregateError([err, rollbackErr], "Import failed and rollback also failed");
            // Still try to record the failed import before throwing
            try {
                await recordFailedImport(connection, importId, importCreated, completedAt, stats);
            } catch {
                // Ignore recording errors, throw original
            }
            throw agg;
        }

        // Record the failed import metadata if we created the record
        // Use a separate connection/transaction to update after rollback
        if (importCreated && importId !== null) {
            try {
                await recordFailedImport(connection, importId, importCreated, completedAt, stats);
            } catch (recordErr) {
                // Log but don't mask the original error
                console.error("Failed to record import failure:", recordErr);
            }
        }

        // Re-throw original error
        throw err;
    } finally {
        // Always release connection
        connection.release();
    }
}

/**
 * Record a failed import after rollback.
 * Uses the existing connection (which is now in auto-commit mode after rollback).
 */
async function recordFailedImport(
    connection: PoolConnection,
    importId: number | null,
    importCreated: boolean,
    completedAt: Date,
    stats: ImportStats
): Promise<void> {
    if (!importCreated || importId === null) {
        return;
    }

    await markImportFailed({
        connection,
        importId,
        completedAt,
        stats,
    });
}

/**
 * Import the latest GTFS extraction.
 * Finds the most recent extraction directory with a manifest.
 */
export async function importGtfsLatest(
    options: Omit<ImportGtfsOptions, "extractedDirectory">
): Promise<ImportGtfsResult> {
    // Import GTFS_EXTRACTION_DIR from config
    const { GTFS_EXTRACTION_DIR } = await import("../config/env.js");

    const directory = await findLatestExtraction(GTFS_EXTRACTION_DIR);

    return importGtfs({
        extractedDirectory: directory,
        parseBatchSize: options.parseBatchSize,
        insertBatchSize: options.insertBatchSize,
        maxIssues: options.maxIssues,
    });
}