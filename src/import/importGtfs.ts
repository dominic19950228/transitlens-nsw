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
 * Import GTFS feed from an extracted directory.
 * Uses a single transaction for all operations.
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
    const startedAt = new Date();

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

        // Deactivate previous active imports FIRST
        await deactivatePreviousActiveImport(connection, importId);

        // Complete import (marks as completed and active)
        const completedAt = new Date();
        await completeImport({
            connection,
            importId,
            completedAt,
            stats,
        });

        // Commit transaction
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
        // Rollback transaction
        let rollbackErr: Error | null = null;
        try {
            await connection.rollback();
        } catch (e) {
            rollbackErr = e instanceof Error ? e : new Error(String(e));
        }

        // If both original error and rollback error exist, wrap in AggregateError
        if (rollbackErr) {
            throw new AggregateError([err, rollbackErr], "Import failed and rollback also failed");
        }

        // Re-throw original error
        throw err;
    } finally {
        // Always release connection
        connection.release();
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
