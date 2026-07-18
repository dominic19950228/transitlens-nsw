/**
 * CLI for NSW Transit Platform - GTFS Downloader & Extractor
 * Step 1: Download
 * Step 2: Extract GTFS ZIP
 */

import { config } from "dotenv";
import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { downloadGtfs } from "./download/downloadGtfs.js";
import { extractGtfs } from "./extract/extractGtfs.js";
import {
  loadEnv,
  EnvValidationError,
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
  ZipFileNotFoundError as ExtractZipNotFoundError,
  NotZipFileError as ExtractNotZipError,
  EmptyZipError as ExtractEmptyZipError,
  ExtractionFailedError,
  MissingRequiredFileError,
  InvalidGtfsStructureError,
  ZipTooManyFilesError,
  ZipFileTooLargeError,
  ZipTotalTooLargeError,
  AtomicRenameError as ExtractAtomicRenameError,
} from "./extract/extractGtfs.js";

// Load .env file if present
config();

// Command name from process.argv
type CliCommand = "download" | "extract" | "extract-latest";

interface CliResult {
  success: boolean;
  exitCode: number;
  message: string;
}

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString()} bytes`;
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

function formatExtractOutput(result: Awaited<ReturnType<typeof extractGtfs>>): string {
  const lines = [
    "GTFS extraction completed",
    `Source ZIP: ${result.zipFilePath}`,
    `Extracted to: ${result.extractedPath}`,
    `Files extracted: ${result.extractedFiles.length}`,
    `Total uncompressed size: ${formatBytes(result.totalExtractedBytes)}`,
    `Extracted at: ${result.extractedAt}`,
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
      if (extname(file).toLowerCase() === ".zip") {
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
    return `Error: Unexpected content type from server.`;
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
  if (err instanceof ExtractZipNotFoundError) {
    return "Error: ZIP file not found. Please check the file path.";
  }
  if (err instanceof ExtractNotZipError) {
    return "Error: File is not a valid ZIP archive.";
  }
  if (err instanceof ExtractEmptyZipError) {
    return "Error: ZIP file is empty.";
  }
  if (err instanceof ExtractionFailedError) {
    return `Error: Extraction failed. ${err.message}`;
  }
  if (err instanceof MissingRequiredFileError) {
    return `Error: Missing required GTFS files: ${err.missingFiles.join(", ")}`;
  }
  if (err instanceof InvalidGtfsStructureError) {
    return `Error: Invalid GTFS structure. ${err.message}`;
  }
  if (err instanceof ZipTooManyFilesError) {
    return `Error: ZIP contains too many files (${err.count}), limit is ${err.limit}.`;
  }
  if (err instanceof ZipFileTooLargeError) {
    return `Error: File ${err.fileName} in ZIP is too large (${formatBytes(err.sizeBytes)}), limit is ${formatBytes(err.limitBytes)}.`;
  }
  if (err instanceof ZipTotalTooLargeError) {
    return `Error: Total uncompressed size (${formatBytes(err.totalBytes)}) exceeds limit (${formatBytes(err.limitBytes)}).`;
  }
  if (err instanceof ExtractAtomicRenameError) {
    return "Error: Failed to finalize extraction. Please check disk permissions.";
  }
  if (err instanceof EnvValidationError) {
    return `Error: Environment configuration error: ${err.message}`;
  }
  if (err instanceof HttpError) {
    return `Error: HTTP error ${err.status} ${err.statusText}.`;
  }

  // Generic fallback
  return `Error: ${err.message}`;
}

async function handleDownload(env: ReturnType<typeof loadEnv>): Promise<CliResult> {
  try {
    const result = await downloadGtfs({
      url: env.gtfsUrl,
      apiToken: env.apiToken,
      outputDirectory: env.downloadDir,
      timeoutMs: env.timeoutMs,
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

async function handleExtract(
  zipFilePath: string,
  env: ReturnType<typeof loadEnv>
): Promise<CliResult> {
  try {
    const result = await extractGtfs({
      zipFilePath,
      outputDirectory: env.extractionDir,
      validateRequired: true,
      cleanOnFailure: true,
      maxFiles: env.maxArchiveFiles,
      maxSingleFileBytes: env.maxSingleFileBytes,
      maxTotalBytes: env.maxTotalUncompressedBytes,
    });

    return {
      success: true,
      exitCode: 0,
      message: formatExtractOutput(result),
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

async function handleExtractLatest(env: ReturnType<typeof loadEnv>): Promise<CliResult> {
  try {
    const latestZip = await findLatestZipFile(env.downloadDir);
    return await handleExtract(latestZip, env);
  } catch (err) {
    const errorMessage = err instanceof Error ? formatError(err) : "An unexpected error occurred.";
    // Check if it's the "no zip files" error, give a nicer message
    if (err instanceof Error && err.message.startsWith("No .zip files")) {
      return {
        success: false,
        exitCode: 1,
        message: `Error: No downloaded GTFS ZIP found in ${env.downloadDir}. Run 'npm run gtfs:download' first.`,
      };
    }
    return {
      success: false,
      exitCode: 1,
      message: errorMessage,
    };
  }
}

function getCommand(): CliCommand {
  const arg = process.argv[2];
  if (!arg || arg === "download") return "download";
  if (arg === "extract") return "extract";
  if (arg === "extract-latest") return "extract-latest";

  console.error(`Unknown command: ${arg}`);
  console.error("Usage:");
  console.error("  npx tsx src/cli.ts              - Download GTFS (default)");
  console.error("  npx tsx src/cli.ts download      - Download GTFS");
  console.error("  npx tsx src/cli.ts extract <file> - Extract a specific ZIP");
  console.error("  npx tsx src/cli.ts extract-latest - Extract most recent ZIP in download directory");
  process.exit(1);
}

async function main(): Promise<CliResult> {
  try {
    // Load and validate environment
    const env = loadEnv();
    const command = getCommand();

    switch (command) {
      case "download":
        return await handleDownload(env);

      case "extract": {
        const zipArg = process.argv[3];
        if (!zipArg) {
          return {
            success: false,
            exitCode: 1,
            message: "Error: Please specify the ZIP file to extract.\nUsage: npx tsx src/cli.ts extract <path-to-zip>",
          };
        }
        return await handleExtract(zipArg, env);
      }

      case "extract-latest":
        return await handleExtractLatest(env);
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

// Run CLI
const result = await main();
console.log(result.message);
process.exit(result.exitCode);
