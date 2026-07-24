/**
 * Repository functions for GTFS import operations.
 * All functions accept a transaction connection for atomic operations.
 */

import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import type { ImportStats, FeedManifest } from "./types.js";

export interface CreatePendingImportParams {
    connection: PoolConnection;
    sourceDirectory: string;
    sourceArchiveSha256: string | null;
    startedAt: Date;
}

export interface CompleteImportParams {
    connection: PoolConnection;
    importId: number;
    completedAt: Date;
    stats: ImportStats;
}

export interface MarkImportFailedParams {
    connection: PoolConnection;
    importId: number;
    completedAt: Date;
    stats: ImportStats;
}

/**
 * Create a pending import record inside a transaction.
 * Returns the new import ID.
 */
export async function createPendingImport(
    params: CreatePendingImportParams
): Promise<number> {
    const { connection, sourceDirectory, sourceArchiveSha256, startedAt } = params;

    const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO gtfs_feed_imports 
         (source_directory, source_archive_sha256, status, is_active, started_at)
         VALUES (?, ?, 'pending', 0, ?)`,
        [sourceDirectory, sourceArchiveSha256, startedAt]
    );

    return Number(result.insertId);
}

/**
 * Complete an import by updating its status and stats.
 * Marks as active and sets completed_at.
 * 
 * IMPORTANT: Caller must validate success conditions before calling:
 * - errorCount === 0
 * - totalAcceptedRows > 0
 */
export async function completeImport(params: CompleteImportParams): Promise<void> {
    const { connection, importId, completedAt, stats } = params;

    await connection.execute<ResultSetHeader>(
        `UPDATE gtfs_feed_imports 
         SET status = 'completed',
             is_active = 1,
             completed_at = ?,
             total_processed_rows = ?,
             total_accepted_rows = ?,
             total_rejected_rows = ?,
             warning_count = ?,
             error_count = ?
         WHERE id = ?`,
        [
            completedAt,
            stats.totalProcessedRows,
            stats.totalAcceptedRows,
            stats.totalRejectedRows,
            stats.warningCount,
            stats.errorCount,
            importId,
        ]
    );
}

/**
 * Mark an import as failed with stats preserved.
 * Does NOT mark as active.
 * 
 * Use this after rollback to record the failed import metadata.
 * 
 * @throws Error if the import row is not found (affectedRows !== 1)
 */
export async function markImportFailed(params: MarkImportFailedParams): Promise<void> {
    const { connection, importId, completedAt, stats } = params;

    const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE gtfs_feed_imports 
         SET status = 'failed',
             is_active = 0,
             completed_at = ?,
             total_processed_rows = ?,
             total_accepted_rows = ?,
             total_rejected_rows = ?,
             warning_count = ?,
             error_count = ?
         WHERE id = ?`,
        [
            completedAt,
            stats.totalProcessedRows,
            stats.totalAcceptedRows,
            stats.totalRejectedRows,
            stats.warningCount,
            stats.errorCount,
            importId,
        ]
    );

    // Verify the row was actually updated
    if (result.affectedRows !== 1) {
        throw new Error(`Failed import metadata row was not found: importId=${importId}`);
    }
}

/**
 * Deactivate all previously active imports.
 * Must be called inside the same transaction before completeImport.
 */
export async function deactivatePreviousActiveImport(
    connection: PoolConnection,
    excludeImportId: number
): Promise<void> {
    await connection.execute<ResultSetHeader>(
        `UPDATE gtfs_feed_imports 
         SET is_active = 0 
         WHERE is_active = 1 AND id != ?`,
        [excludeImportId]
    );
}

/**
 * Read the feed manifest from a directory.
 * - Returns null if the manifest file is missing (ENOENT).
 * - Throws if the manifest file exists but contains invalid JSON.
 * - Throws if the file cannot be read for a reason other than not-found.
 */
export async function readFeedManifest(
    directory: string
): Promise<FeedManifest | null> {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");

    const manifestPath = join(directory, "feed-manifest.json");

    // Try to read file - if it doesn't exist, return null silently
    let content: string;
    try {
        content = await readFile(manifestPath, "utf-8");
    } catch (err: unknown) {
        // If file doesn't exist, return null silently (allow direct import)
        if (err instanceof Error && "code" in err && err.code === "ENOENT") {
            return null;
        }
        // For any other error (permission denied, etc.), throw clear error
        throw new Error(`Failed to read feed manifest: ${err instanceof Error ? err.message : String(err)}`);
    }

    // File exists, try to parse JSON
    try {
        return JSON.parse(content) as FeedManifest;
    } catch (err: unknown) {
        // JSON parse error
        throw new Error(`Malformed feed manifest: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/**
 * Check if a GTFS file exists in the directory.
 */
export async function checkGtfsFileExists(
    directory: string,
    fileName: string
): Promise<boolean> {
    const { access } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const { constants } = await import("node:fs");

    try {
        await access(join(directory, fileName), constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if a directory exists and is actually a directory.
 * Returns false if path doesn't exist, is a file, or is not accessible.
 */
export async function checkDirectoryExists(directory: string): Promise<boolean> {
    const { stat } = await import("node:fs/promises");

    try {
        const stats = await stat(directory);
        return stats.isDirectory();
    } catch {
        return false;
    }
}