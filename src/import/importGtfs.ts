/**
 * GTFS Import orchestrator.
 * Step 4B: Stream parsed GTFS batches and insert into MariaDB.
 * 
 * Transaction ordering:
 * - Successful import: create pending row (auto-commit) → begin transaction → parse/insert → 
 *                      deactivate → complete → commit → release
 * - Failed import:      rollback if transaction started → mark failed (auto-commit, fresh conn) → release → rethrow
 */

import { parseGtfs, BatchConsumerError } from "../parse/parseGtfs.js";
import { DatabaseInsertError } from "./batchInserters.js";
import { findLatestExtraction } from "./findLatestExtraction.js";
import type { GtfsFileName } from "../parse/types.js";
import type { ParseIssue } from "../parse/types.js";
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
 * May contain parser validation issues for diagnostic purposes.
 */
export class ImportValidationError extends Error {
    readonly errorCount: number;
    readonly acceptedRows: number;
    readonly issues?: readonly ParseIssue[];

    constructor(
        message: string,
        errorCount: number,
        acceptedRows: number,
        issues?: readonly ParseIssue[]
    ) {
        super(message);
        this.name = "ImportValidationError";
        this.errorCount = errorCount;
        this.acceptedRows = acceptedRows;
        this.issues = issues;
    }
}

/**
 * Maximum number of parse issues to include in error messages.
 */
const MAX_ISSUES_IN_ERROR = 5;

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
 * Format parse issues for error message.
 */
function formatIssuesForError(issues: readonly ParseIssue[]): string {
    const limited = issues.slice(0, MAX_ISSUES_IN_ERROR);
    return limited
        .map((issue) => {
            const parts = [`${issue.fileName}:${issue.row > 0 ? issue.row : "header"}`];
            if (issue.field) parts.push(issue.field);
            parts.push(issue.message);
            return parts.join(" ");
        })
        .join("; ");
}

/**
 * Validate that the import succeeded before marking it complete.
 * @throws ImportValidationError if validation fails
 */
function validateImportSuccess(
    stats: ImportStats,
    issues?: readonly ParseIssue[]
): void {
    if (stats.errorCount > 0) {
        let message = `Import failed with ${stats.errorCount} error(s)`;
        // Include first few issues for diagnostics
        if (issues && issues.length > 0) {
            message += `: ${formatIssuesForError(issues)}`;
        }
        throw new ImportValidationError(
            message,
            stats.errorCount,
            stats.totalAcceptedRows,
            issues ? issues.slice(0, MAX_ISSUES_IN_ERROR) : undefined
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
 * Extract a useful error message from caught errors.
 */
function extractErrorMessage(err: unknown): string | undefined {
    if (err instanceof DatabaseInsertError) {
        return err.message;
    }
    if (err instanceof BatchConsumerError) {
        return err.message;
    }
    if (err instanceof Error) {
        return err.message;
    }
    return undefined;
}

/**
 * Record failed import metadata using a fresh connection from the pool.
 * This is independent of the GTFS transaction connection.
 */
async function recordFailedImport(
    importId: number,
    completedAt: Date,
    stats: ImportStats,
    errorMessage?: string
): Promise<void> {
    const pool = getDatabasePool();
    const freshConnection = await pool.getConnection();
    try {
        await markImportFailed({
            connection: freshConnection,
            importId,
            completedAt,
            stats,
            errorMessage,
        });
    } finally {
        freshConnection.release();
    }
}

/**
 * Import GTFS feed from an extracted directory.
 * 
 * Success conditions:
 * - Parser/import finishes without fatal exception
 * - errorCount === 0
 * - acceptedRows > 0
 * - All database inserts succeed
 * - Transaction commits successfully
 * 
 * Transaction ordering (successful):
 * 1. acquire connection
 * 2. create pending import metadata row in auto-commit mode
 * 3. begin the GTFS transaction
 * 4. parse and insert GTFS data
 * 5. validate errorCount === 0 and acceptedRows > 0
 * 6. deactivate previous active feed inside the transaction
 * 7. mark new feed completed and active inside the transaction
 * 8. commit
 * 9. release connection
 * 
 * Transaction ordering (failed):
 * 1. roll back GTFS transaction if it has started
 * 2. leave previous active feed unchanged
 * 3. mark pending metadata row as failed using fresh connection (auto-commit)
 * 4. preserve all available summary counts
 * 5. set completed_at using actual failure time
 * 6. release connection
 * 7. rethrow original error
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

    // Track state for proper cleanup
    let importId: number | null = null;
    let transactionStarted = false;
    let connectionReleased = false;

    // Initialize stats tracking
    const stats: ImportStats = {
        totalProcessedRows: 0,
        totalAcceptedRows: 0,
        totalRejectedRows: 0,
        warningCount: 0,
        errorCount: 0,
        rowsByFile: new Map(),
    };

    const startedAt = new Date();

    // Helper to release connection exactly once
    const releaseConnection = (): void => {
        if (!connectionReleased) {
            connection.release();
            connectionReleased = true;
        }
    };

    try {
        // Step 1: Create pending import metadata row in auto-commit mode
        importId = await createPendingImport({
            connection,
            sourceDirectory: extractedDirectory,
            sourceArchiveSha256: sourceSha256,
            startedAt,
        });

        // Step 2: Begin the GTFS transaction
        await connection.beginTransaction();
        transactionStarted = true;

        // Step 3: Parse GTFS and insert batches
        const parseResult = await parseGtfs({
            extractedDirectory,
            batchSize: parseBatchSize,
            maxIssues,
            onBatch: async (fileName: GtfsFileName, records: readonly unknown[]): Promise<void> => {
                // Skip unknown files or intentionally unsupported files (e.g. shapes.txt)
                if (!FILE_TO_TABLE_MAPPING[fileName] || fileName === "shapes.txt") {
                    return;
                }

                if (importId === null) {
                    throw new Error("Import ID is null during batch insertion");
                }

                // Insert batch and track row counts
                const inserted = await insertBatch(
                    connection,
                    importId,
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

        // Step 4: Validate success conditions BEFORE modifying any state
        // Pass issues for better error messages
        validateImportSuccess(stats, parseResult.issues);

        // Step 5: Deactivate previous active imports FIRST (inside transaction)
        await deactivatePreviousActiveImport(connection, importId);

        // Step 6: Complete this import (marks as completed and active)
        // Create completion timestamp immediately before use
        const completedAt = new Date();
        await completeImport({
            connection,
            importId,
            completedAt,
            stats,
        });

        // Step 7: Commit transaction
        await connection.commit();
        // Mark transaction as ended so later errors won't try to rollback
        transactionStarted = false;

        // Step 8: Convert rowsByFile to Record<string, number>
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
        // Extract error message for persistence
        const errorMessage = extractErrorMessage(err);

        // Step 1 of failure handling: Roll back GTFS data transaction if started
        if (transactionStarted) {
            try {
                await connection.rollback();
            } catch (rollbackErr) {
                // Rollback failed - wrap both errors
                const agg = new AggregateError(
                    [err instanceof Error ? err : new Error(String(err)), rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr))],
                    "Import failed and rollback also failed"
                );
                // Try to record failure with fresh connection, then release and rethrow
                if (importId !== null) {
                    const completedAt = new Date();
                    try {
                        await recordFailedImport(importId, completedAt, stats, errorMessage);
                    } catch {
                        // Preserve the aggregate rollback error
                    }
                }
                releaseConnection();
                throw agg;
            }
            transactionStarted = false;
        }

        // Step 2: Record failed import metadata using fresh connection (auto-commit)
        if (importId !== null) {
            const completedAt = new Date();
            try {
                await recordFailedImport(importId, completedAt, stats, errorMessage);
            } catch (markErr) {
                // Don't let failure recording hide the original error
                console.error("Failed to record import failure:", markErr);
            }
        }

        // Step 3: Re-throw original error
        throw err;
    } finally {
        // Always release connection exactly once
        releaseConnection();
    }
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