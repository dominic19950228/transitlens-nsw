/**
 * CLI for NSW Transit Platform - GTFS Downloader, Extractor & Parser
 * Step 1: Download
 * Step 2: Extract GTFS ZIP
 * Step 3: Parse and validate extracted GTFS CSV files
 * Step 4A: Database migration
 */

import { config } from "dotenv";
import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { downloadGtfs } from "./download/downloadGtfs.js";
import { extractGtfs } from "./extract/extractGtfs.js";
import { parseGtfs, parseLatestExtraction } from "./parse/index.js";
import { runMigrations, closeDatabasePool } from "./database/index.js";
import {
    validateDownloadEnv,
    validateExtractionEnv,
    validateParseEnv,
    getDatabaseConfig,
    GTFS_DOWNLOAD_DIR,
    GTFS_EXTRACTION_DIR,
    GTFS_PARSE_BATCH_SIZE,
    GTFS_PARSE_MAX_ISSUES,
    TFNSW_API_TOKEN,
    TFNSW_GTFS_URL,
    GTFS_DOWNLOAD_TIMEOUT_MS,
    GTFS_MAX_ARCHIVE_ENTRIES,
    GTFS_MAX_SINGLE_FILE_BYTES,
    GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES,
} from "./config/env.js";
import {
    MissingTokenError,
    InvalidURLError,
    TimeoutError,
    NetworkError,
    HttpError,
    UnauthorizedError,
    ForbiddenError,
    EmptyResponseError,
    ContentTypeError,
    NotZipFileError,
    DiskWriteError,
    HashingFailureError,
    AtomicRenameError as DownloadAtomicRenameError,
} from "./download/downloadGtfs.js";
import {
    ExtractorError,
    ExtractionConflictError,
    MissingRequiredFileError,
    InvalidGtfsStructureError,
    ZipTooManyFilesError,
    ZipFileTooLargeError,
    ZipTotalTooLargeError,
    UnsafePathError,
    DuplicateFileError,
} from "./extract/extractGtfs.js";

// Load .env file if present
config();

// Command name from process.argv
type CliCommand = "download" | "extract" | "extract-latest" | "parse" | "parse-latest" | "db-migrate";

interface CliResult {
    success: boolean;
    exitCode: number;
    message: string;
}

function formatBytes(bytes: number): string {
    return `${bytes.toLocaleString()} bytes`;
}

function formatNumber(num: number): string {
    return num.toLocaleString();
}

function formatDownloadOutput(result: Awaited<ReturnType<typeof downloadGtfs>>): string {
    const lines = [
        "GTFS download completed",
        `File: ${result.filePath}`,
        `Size: ${formatBytes(result.sizeBytes)}`,
        `SHA-256: ${result.sha256.slice(0, 12)}...`,
        `Downloaded at: ${result.downloadedAt}`,
    ];
    return lines.join("\n");
}

function formatExtractOutput(
    result: Awaited<ReturnType<typeof extractGtfs>>,
    sourceZipPath: string
): string {
    const lines = [
        "GTFS extraction completed",
        `Source: ${sourceZipPath}`,
        `Directory: ${result.extractionDirectory}`,
        `Manifest: ${result.manifestPath}`,
    ];
    return lines.join("\n");
}

function formatParseOutput(
    result: Awaited<ReturnType<typeof parseGtfs>>,
    directory: string
): string {
    const sampleIssues = result.issues.slice(0, 5);
    const lines: string[] = [
        "GTFS parsing completed",
        `Directory: ${directory}`,
        `Files processed: ${result.files.length}`,
        `Rows processed: ${formatNumber(result.totalProcessedRows)}`,
        `Rows accepted: ${formatNumber(result.totalAcceptedRows)}`,
        `Rows rejected: ${formatNumber(result.totalRejectedRows)}`,
        `Warnings: ${formatNumber(result.warningCount)}`,
        `Errors: ${formatNumber(result.errorCount)}`,
    ];

    if (result.issuesTruncated) {
        lines.push(`Issues (truncated at ${formatNumber(result.issues.length)} shown):`);
    } else if (result.issues.length > 0) {
        lines.push(`Issues (${result.issues.length} total):`);
    }

    // Show up to 5 sample issues
    for (const issue of sampleIssues) {
        const fieldInfo = issue.field ? ` field=${issue.field}` : "";
        const valueInfo = issue.value ? ` value="${issue.value}"` : "";
        lines.push(`  Row ${issue.row}: ${issue.message}${fieldInfo}${valueInfo}`);
    }

    return lines.join("\n");
}

function formatMigrationOutput(result: Awaited<ReturnType<typeof runMigrations>>): string {
    const lines = [
        "Database migration completed",
        `Database: ${getDatabaseConfig().database}`,
        `Server: ${result.serverVersion}`,
        `Character set: ${result.charset}`,
        `Collation: ${result.collation}`,
        `Tables verified: ${result.tablesVerified}`,
    ];
    return lines.join("\n");
}

/**
 * Find the most recent .zip file in a directory.
 */
async function findLatestZipFile(directory: string): Promise<string> {
    try {
        const files = await readdir(directory);
        const zipFiles: { name: string; mtime: Date }[] = [];

        for (const file of files) {
            // Only consider completed .zip files, ignore .part files
            if (extname(file).toLowerCase() === ".zip" && !file.endsWith(".part")) {
                const filePath = join(directory, file);
                const stats = await stat(filePath);
                zipFiles.push({ name: filePath, mtime: stats.mtime });
            }
        }

        if (zipFiles.length === 0) {
            throw new Error(`No .zip files found in ${directory}`);
        }

        // Sort by modification time descending
        zipFiles.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        return zipFiles[0].name;
    } catch (err) {
        if (err instanceof Error && err.message.startsWith("No .zip files")) {
            throw err;
        }
        throw new Error(`Failed to scan ${directory}: ${err instanceof Error ? err.message : String(err)}`);
    }
}

function formatError(err: Error): string {
    // Download-specific errors
    if (err instanceof MissingTokenError) {
        return "Error: Missing API token. Please set TFNSW_API_TOKEN environment variable.";
    }
    if (err instanceof UnauthorizedError) {
        return "Error: Authentication failed (HTTP 401). Please check your API token.";
    }
    if (err instanceof ForbiddenError) {
        return "Error: Access forbidden (HTTP 403). Please check your API permissions.";
    }
    if (err instanceof TimeoutError) {
        return "Error: Request timed out. The server took too long to respond.";
    }
    if (err instanceof NetworkError) {
        return "Error: Network failure. Please check your internet connection.";
    }
    if (err instanceof EmptyResponseError) {
        return "Error: Received empty response from server.";
    }
    if (err instanceof ContentTypeError) {
        return "Error: Unexpected content type from server.";
    }
    if (err instanceof NotZipFileError) {
        return "Error: Server response is not a valid ZIP file.";
    }
    if (err instanceof DiskWriteError) {
        return "Error: Failed to write file to disk. Please check disk space and permissions.";
    }
    if (err instanceof HashingFailureError) {
        return "Error: Failed to calculate file hash.";
    }
    if (err instanceof DownloadAtomicRenameError) {
        return "Error: Failed to finalize download. Please check disk permissions.";
    }
    if (err instanceof InvalidURLError) {
        return "Error: Invalid URL configuration.";
    }
    // Extraction-specific errors
    if (err instanceof ExtractorError) {
        if (err instanceof UnsafePathError) {
            return `Error: Unsafe path detected in archive: ${err.message}`;
        }
        if (err instanceof DuplicateFileError) {
            return `Error: Duplicate filename detected in archive: ${err.message}`;
        }
        if (err instanceof ExtractionConflictError) {
            return `Error: Extraction conflict. ${err.message}`;
        }
        return `Error: Extraction failed. ${err.message}`;
    }
    if (err instanceof MissingRequiredFileError) {
        return `Error: Missing required GTFS files: ${err.missingFiles.join(", ")}`;
    }
    if (err instanceof InvalidGtfsStructureError) {
        return `Error: Invalid GTFS structure. ${err.message}`;
    }
    if (err instanceof ZipTooManyFilesError) {
        return `Error: ZIP contains ${err.count} files, limit is ${err.limit}.`;
    }
    if (err instanceof ZipFileTooLargeError) {
        return `Error: File ${err.fileName} is ${formatBytes(err.sizeBytes)}, limit is ${formatBytes(err.limitBytes)}.`;
    }
    if (err instanceof ZipTotalTooLargeError) {
        return `Error: Total uncompressed size is ${formatBytes(err.totalBytes)}, limit is ${formatBytes(err.limitBytes)}.`;
    }
    if (err instanceof HttpError) {
        return `Error: HTTP error ${err.status} ${err.statusText}.`;
    }

    // Generic fallback
    return `Error: ${err.message}`;
}

async function handleDownload(): Promise<CliResult> {
    try {
        validateDownloadEnv();

        const result = await downloadGtfs({
            url: TFNSW_GTFS_URL,
            apiToken: TFNSW_API_TOKEN!,
            outputDirectory: GTFS_DOWNLOAD_DIR,
            timeoutMs: GTFS_DOWNLOAD_TIMEOUT_MS,
        });

        return {
            success: true,
            exitCode: 0,
            message: formatDownloadOutput(result),
        };
    } catch (err) {
        const errorMessage = err instanceof Error ? formatError(err) : "An unexpected error occurred.";
        return {
            success: false,
            exitCode: 1,
            message: errorMessage,
        };
    }
}

async function handleExtract(zipFilePath: string): Promise<CliResult> {
    try {
        validateExtractionEnv();

        const result = await extractGtfs({
            zipFilePath,
            outputDirectory: GTFS_EXTRACTION_DIR,
            maxEntries: GTFS_MAX_ARCHIVE_ENTRIES,
            maxSingleFileBytes: GTFS_MAX_SINGLE_FILE_BYTES,
            maxTotalBytes: GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES,
        });

        return {
            success: true,
            exitCode: 0,
            message: formatExtractOutput(result, zipFilePath),
        };
    } catch (err) {
        const errorMessage = err instanceof Error ? formatError(err) : "An unexpected error occurred.";
        return {
            success: false,
            exitCode: 1,
            message: errorMessage,
        };
    }
}

async function handleExtractLatest(): Promise<CliResult> {
    try {
        validateExtractionEnv();

        const latestZip = await findLatestZipFile(GTFS_DOWNLOAD_DIR);
        return await handleExtract(latestZip);
    } catch (err) {
        const errorMessage = err instanceof Error ? formatError(err) : "An unexpected error occurred.";
        if (err instanceof Error && err.message.startsWith("No .zip files")) {
            return {
                success: false,
                exitCode: 1,
                message: `Error: No downloaded GTFS ZIP found in ${GTFS_DOWNLOAD_DIR}. Run 'npm run gtfs:download' first.`,
            };
        }
        return {
            success: false,
            exitCode: 1,
            message: errorMessage,
        };
    }
}

async function handleParse(directory: string): Promise<CliResult> {
    try {
        validateParseEnv();

        const result = await parseGtfs({
            extractedDirectory: directory,
            batchSize: GTFS_PARSE_BATCH_SIZE,
            maxIssues: GTFS_PARSE_MAX_ISSUES,
            onBatch: async (
                _fileName: string,
                _records: readonly unknown[]
            ): Promise<void> => {
                // No-retention consumer; stats handled natively
            },
        });

        return {
            success: true,
            exitCode: 0,
            message: formatParseOutput(result, directory),
        };
    } catch (err) {
        const errorMessage = err instanceof Error ? formatError(err) : "An unexpected error occurred.";
        return {
            success: false,
            exitCode: 1,
            message: errorMessage,
        };
    }
}

async function handleParseLatest(): Promise<CliResult> {
    try {
        validateParseEnv();

        const { result, directory } = await parseLatestExtraction(
            GTFS_EXTRACTION_DIR,
            GTFS_PARSE_BATCH_SIZE,
            GTFS_PARSE_MAX_ISSUES
        );

        return {
            success: true,
            exitCode: 0,
            message: formatParseOutput(result, directory),
        };
    } catch (err) {
        const errorMessage = err instanceof Error ? formatError(err) : "An unexpected error occurred.";
        if (err instanceof Error && err.message.includes("No completed extractions")) {
            return {
                success: false,
                exitCode: 1,
                message: `Error: No completed GTFS extractions found in ${GTFS_EXTRACTION_DIR}. Run 'npm run gtfs:extract' or 'npm run gtfs:extract:latest' first.`,
            };
        }
        return {
            success: false,
            exitCode: 1,
            message: errorMessage,
        };
    }
}

async function handleDbMigrate(): Promise<CliResult> {
    try {
        // Validate database environment variables
        getDatabaseConfig();

        // Run migrations
        const result = await runMigrations();

        return {
            success: true,
            exitCode: 0,
            message: formatMigrationOutput(result),
        };
    } catch (err) {
        const errorMessage = err instanceof Error ? formatError(err) : "An unexpected error occurred.";
        return {
            success: false,
            exitCode: 1,
            message: errorMessage,
        };
    } finally {
        // Always close the pool
        await closeDatabasePool();
    }
}

function getCommand(): CliCommand {
    const arg = process.argv[2];
    if (!arg || arg === "download") return "download";
    if (arg === "extract") return "extract";
    if (arg === "extract-latest") return "extract-latest";
    if (arg === "parse") return "parse";
    if (arg === "parse-latest") return "parse-latest";
    if (arg === "db-migrate") return "db-migrate";

    console.error(`Unknown command: ${arg}`);
    process.exit(1);
}

async function main(): Promise<CliResult> {
    try {
        const command = getCommand();

        switch (command) {
            case "download":
                return await handleDownload();

            case "extract": {
                const zipArg = process.argv[3];
                if (!zipArg) {
                    return { success: false, exitCode: 1, message: "Error: Please specify the ZIP file." };
                }
                return await handleExtract(zipArg);
            }

            case "extract-latest":
                return await handleExtractLatest();

            case "parse": {
                const dirArg = process.argv[3];
                if (!dirArg) {
                    return { success: false, exitCode: 1, message: "Error: Please specify the extraction directory." };
                }
                return await handleParse(dirArg);
            }

            case "parse-latest":
                return await handleParseLatest();

            case "db-migrate":
                return await handleDbMigrate();
        }
    } catch (err) {
        const errorMessage = err instanceof Error ? formatError(err) : "An unexpected error occurred.";
        return {
            success: false,
            exitCode: 1,
            message: errorMessage,
        };
    }
}

const result = await main();
console.log(result.message);
process.exit(result.exitCode);