/**
 * CLI for NSW Transit Platform - GTFS Downloader
 * Step 1: TfNSW Complete GTFS Downloader
 */

import { config } from "dotenv";
import { downloadGtfs } from "./download/downloadGtfs.js";
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
  AtomicRenameError,
} from "./download/downloadGtfs.js";

// Load .env file if present
config();

interface CliResult {
  success: boolean;
  exitCode: number;
  message: string;
  result?: Awaited<ReturnType<typeof downloadGtfs>>;
}

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString()} bytes`;
}

function formatOutput(result: Awaited<ReturnType<typeof downloadGtfs>>): string {
  const lines = [
    "GTFS download completed",
    `File: ${result.filePath}`,
    `Size: ${formatBytes(result.sizeBytes)}`,
    `SHA-256: ${result.sha256.slice(0, 12)}...`,
    `Downloaded at: ${result.downloadedAt}`,
  ];
  return lines.join("\n");
}

function formatError(err: Error): string {
  // Generic safe error messages
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
    return `Error: Unexpected content type from server (${err.message}).`;
  }
  if (err instanceof NotZipFileError) {
    return `Error: Server response is not a valid ZIP file. ${err.message}`;
  }
  if (err instanceof DiskWriteError) {
    return "Error: Failed to write file to disk. Please check disk space and permissions.";
  }
  if (err instanceof HashingFailureError) {
    return "Error: Failed to calculate file hash.";
  }
  if (err instanceof AtomicRenameError) {
    return "Error: Failed to finalize file. Please check disk permissions.";
  }
  if (err instanceof InvalidURLError) {
    return "Error: Invalid URL configuration.";
  }
  if (err instanceof EnvValidationError) {
    return `Error: Environment configuration error: ${err.message}`;
  }
  if (err instanceof HttpError) {
    return `Error: HTTP error ${err.status} ${err.statusText}.`;
  }

  // Generic fallback - don't expose sensitive details
  return "Error: An unexpected error occurred during download.";
}

async function main(): Promise<CliResult> {
  try {
    // Load and validate environment
    const env = loadEnv();

    // Download GTFS
    const result = await downloadGtfs({
      url: env.gtfsUrl,
      apiToken: env.apiToken,
      outputDirectory: env.downloadDir,
      timeoutMs: env.timeoutMs,
    });

    return {
      success: true,
      exitCode: 0,
      message: formatOutput(result),
      result,
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

// Run CLI
const result = await main();
console.log(result.message);
process.exit(result.exitCode);
