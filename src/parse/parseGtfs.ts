/**
 * GTFS Parse orchestrator.
 * Step 3: Stream and validate extracted GTFS CSV files.
 * Processes files sequentially using streaming, emitting bounded batches.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
    GtfsFileName,
    ParseIssue,
    ParsedFileStats,
    ParseGtfsOptions,
    ParseGtfsResult,
    ParsedRecord,
} from "./types.js";
import { parseCsvFile, type BatchResult } from "./parseCsvFile.js";

const DEFAULT_BATCH_SIZE = 10000;
const DEFAULT_MAX_ISSUES = 1000;

// Deterministic processing order
const FILE_ORDER: GtfsFileName[] = [
    "agency.txt",
    "stops.txt",
    "routes.txt",
    "trips.txt",
    "stop_times.txt",
    "calendar.txt",
    "calendar_dates.txt",
    "shapes.txt",
    "feed_info.txt",
    "frequencies.txt",
    "transfers.txt",
];

/**
 * Parse a full GTFS extraction directory.
 * Streams each file, validates rows, emits batches via onBatch.
 * No complete-feed arrays are stored in memory.
 */
export async function parseGtfs(
    options: ParseGtfsOptions
): Promise<ParseGtfsResult> {
    const {
        extractedDirectory,
        batchSize = DEFAULT_BATCH_SIZE,
        maxIssues = DEFAULT_MAX_ISSUES,
        onBatch,
    } = options;

    const parsedAt = new Date().toISOString();
    const files: ParsedFileStats[] = [];
    const allIssues: ParseIssue[] = [];
    let totalProcessedRows = 0;
    let totalAcceptedRows = 0;
    let totalRejectedRows = 0;
    let totalWarnings = 0;
    let totalErrors = 0;
    let issuesTruncated = false;

    // Determine which files are available from the extraction directory
    const manifest = await findManifest(extractedDirectory);
    const availableFiles = await findAvailableFiles(extractedDirectory, manifest);

    // Process files in deterministic order
    for (const fileName of FILE_ORDER) {
        if (!availableFiles.has(fileName)) {
            continue;
        }

        const filePath = join(extractedDirectory, fileName);
        const fileStats = await processFile(
            filePath,
            fileName,
            batchSize,
            maxIssues,
            allIssues,
            issuesTruncated,
            onBatch
        );

        files.push(fileStats);
        totalProcessedRows += fileStats.processedRows;
        totalAcceptedRows += fileStats.acceptedRows;
        totalRejectedRows += fileStats.rejectedRows;
        totalWarnings += fileStats.warningCount;
        totalErrors += fileStats.errorCount;
        issuesTruncated = allIssues.length >= maxIssues;
    }

    return {
        parsedAt,
        files,
        totalProcessedRows,
        totalAcceptedRows,
        totalRejectedRows,
        warningCount: totalWarnings,
        errorCount: totalErrors,
        issues: allIssues,
        issuesTruncated,
    };
}

async function processFile(
    filePath: string,
    fileName: string,
    batchSize: number,
    maxIssues: number,
    allIssues: ParseIssue[],
    issuesTruncated: boolean,
    onBatch: (
        fileName: GtfsFileName,
        records: readonly unknown[]
    ) => Promise<void>
): Promise<ParsedFileStats> {
    let processedRows = 0;
    let acceptedRows = 0;
    let rejectedRows = 0;
    let warningCount = 0;
    let errorCount = 0;
    let localIssuesTruncated = issuesTruncated;

    return new Promise<ParsedFileStats>((resolve) => {
        parseCsvFile<ParsedRecord>(
            filePath,
            fileName,
            batchSize,
            async (batch: BatchResult<ParsedRecord>) => {
                // Collect issues up to maxIssues
                for (const issue of batch.issues) {
                    if (!localIssuesTruncated && allIssues.length < maxIssues) {
                        allIssues.push(issue);
                    } else if (!localIssuesTruncated) {
                        localIssuesTruncated = true;
                    }
                }

                // Accumulate stats
                processedRows += batch.processedRows;
                acceptedRows += batch.acceptedRows;
                rejectedRows += batch.rejectedRows;
                warningCount += batch.warningCount;
                errorCount += batch.errorCount;

                // Deliver batch to consumer
                if (batch.records.length > 0) {
                    await onBatch(fileName as GtfsFileName, batch.records);
                }
            }
        ).then(() => {
            resolve({
                fileName,
                processedRows,
                acceptedRows,
                rejectedRows,
                warningCount,
                errorCount,
            });
        }).catch((err: Error) => {
            // File-level error: capture as issue, count as error
            if (!localIssuesTruncated && allIssues.length < maxIssues) {
                allIssues.push({
                    fileName,
                    row: 0,
                    message: err ? `File processing error: ${err.message}` : "Unknown file processing error",
                });
            }
            errorCount++;
            resolve({
                fileName,
                processedRows,
                acceptedRows,
                rejectedRows,
                warningCount,
                errorCount,
            });
        });
    });
}

async function findManifest(
    extractedDirectory: string
): Promise<Record<string, unknown> | null> {
    try {
        const manifestPath = join(extractedDirectory, "feed-manifest.json");
        const content = await readFile(manifestPath, "utf-8");
        return JSON.parse(content);
    } catch {
        return null;
    }
}

async function findAvailableFiles(
    directory: string,
    manifest: Record<string, unknown> | null
): Promise<Set<string>> {
    const available = new Set<string>();

    if (manifest && Array.isArray(manifest.files)) {
        for (const entry of manifest.files as Array<{ fileName?: string }>) {
            if (entry.fileName) {
                available.add(entry.fileName.toLowerCase());
            }
        }
        return available;
    }

    // Fallback: scan directory
    try {
        const files = await readdir(directory);
        for (const file of files) {
            const lower = file.toLowerCase();
            if (FILE_ORDER.includes(lower as GtfsFileName)) {
                available.add(lower);
            }
        }
    } catch {
        // Ignore directory read errors
    }

    return available;
}

/**
 * Parse the latest extraction directory.
 * Finds the most recently created extraction directory that contains feed-manifest.json.
 * Returns both the result and the directory path used.
 */
export async function parseLatestExtraction(
    extractionDir: string,
    batchSize?: number,
    maxIssues?: number
): Promise<{ result: ParseGtfsResult; directory: string }> {
    const directories = await findExtractionDirectories(extractionDir);

    if (directories.length === 0) {
        throw new Error(
            `No completed extractions found in ${extractionDir}`
        );
    }

    // Sort by modification time descending, pick newest
    directories.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const latest = directories[0];

    const result = await parseGtfs({
        extractedDirectory: latest.path,
        batchSize,
        maxIssues,
        onBatch: async (
            _fileName: GtfsFileName,
            _records: readonly unknown[]
        ): Promise<void> => {
            // No-retention consumer: just count rows (handled by stats)
        },
    });

    return { result, directory: latest.path };
}

interface ExtractionDirEntry {
    path: string;
    mtime: Date;
}

async function findExtractionDirectories(
    baseDir: string
): Promise<ExtractionDirEntry[]> {
    const entries: ExtractionDirEntry[] = [];

    try {
        const items = await readdir(baseDir, { withFileTypes: true });

        for (const item of items) {
            // Skip .part directories
            if (item.name.includes(".part")) {
                continue;
            }

            if (!item.isDirectory()) {
                continue;
            }

            const dirPath = join(baseDir, item.name);

            // Check for feed-manifest.json
            try {
                await readFile(join(dirPath, "feed-manifest.json"), "utf-8");
            } catch {
                continue; // No manifest, skip
            }

            const stats = await stat(dirPath);

            entries.push({ path: dirPath, mtime: stats.mtime });
        }
    } catch {
        // Directory doesn't exist or can't be read
    }

    return entries;
}