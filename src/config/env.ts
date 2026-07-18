/**
 * Environment configuration and validation for NSW Transit Platform
 */

export const DEFAULT_GTFS_URL =
  "https://api.transport.nsw.gov.au/v1/publictransport/timetables/complete/gtfs";
export const DEFAULT_DOWNLOAD_DIR = "./data/gtfs";
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
export const DEFAULT_EXTRACTION_DIR = "./data/gtfs/extracted";
export const DEFAULT_MAX_ARCHIVE_FILES = 100;
export const DEFAULT_MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB
export const DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES = 20 * 1024 * 1024 * 1024; // 20 GiB

export interface EnvConfig {
  apiToken: string;
  gtfsUrl: string;
  downloadDir: string;
  timeoutMs: number;
  extractionDir: string;
  maxArchiveFiles: number;
  maxSingleFileBytes: number;
  maxTotalUncompressedBytes: number;
}

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * Load and validate environment variables for GTFS downloader and extractor.
 */
export function loadEnv(): EnvConfig {
  const apiToken = process.env.TFNSW_API_TOKEN;
  const gtfsUrl = process.env.TFNSW_GTFS_URL;
  const downloadDir = process.env.GTFS_DOWNLOAD_DIR;
  const timeoutStr = process.env.GTFS_TIMEOUT_MS;
  const extractionDir = process.env.GTFS_EXTRACTION_DIR;
  const maxArchiveFilesStr = process.env.GTFS_MAX_ARCHIVE_FILES;
  const maxSingleFileBytesStr = process.env.GTFS_MAX_SINGLE_FILE_BYTES;
  const maxTotalUncompressedBytesStr = process.env.GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES;

  if (!apiToken) {
    throw new EnvValidationError(
      "Missing required environment variable: TFNSW_API_TOKEN"
    );
  }

  if (apiToken.trim() === "") {
    throw new EnvValidationError(
      "TFNSW_API_TOKEN cannot be empty or whitespace only"
    );
  }

  const finalUrl = gtfsUrl?.trim() || DEFAULT_GTFS_URL;
  try {
    new URL(finalUrl);
  } catch {
    throw new EnvValidationError(`Invalid TFNSW_GTFS_URL: ${finalUrl}`);
  }

  const finalDownloadDir = downloadDir?.trim() || DEFAULT_DOWNLOAD_DIR;
  if (!finalDownloadDir) {
    throw new EnvValidationError("GTFS_DOWNLOAD_DIR cannot be empty");
  }

  const finalTimeoutMs = timeoutStr ? parseInt(timeoutStr, 10) : DEFAULT_TIMEOUT_MS;
  if (isNaN(finalTimeoutMs) || finalTimeoutMs <= 0) {
    throw new EnvValidationError(
      `Invalid GTFS_TIMEOUT_MS value: ${timeoutStr}. Must be a positive integer.`
    );
  }

  const finalExtractionDir = extractionDir?.trim() || DEFAULT_EXTRACTION_DIR;
  if (!finalExtractionDir) {
    throw new EnvValidationError("GTFS_EXTRACTION_DIR cannot be empty");
  }

  const finalMaxArchiveFiles = maxArchiveFilesStr
    ? parseInt(maxArchiveFilesStr, 10)
    : DEFAULT_MAX_ARCHIVE_FILES;
  if (isNaN(finalMaxArchiveFiles) || finalMaxArchiveFiles <= 0) {
    throw new EnvValidationError(
      `Invalid GTFS_MAX_ARCHIVE_FILES value: ${maxArchiveFilesStr}. Must be a positive integer.`
    );
  }

  const finalMaxSingleFileBytes = maxSingleFileBytesStr
    ? parseInt(maxSingleFileBytesStr, 10)
    : DEFAULT_MAX_SINGLE_FILE_BYTES;
  if (isNaN(finalMaxSingleFileBytes) || finalMaxSingleFileBytes <= 0) {
    throw new EnvValidationError(
      `Invalid GTFS_MAX_SINGLE_FILE_BYTES value: ${maxSingleFileBytesStr}. Must be a positive integer.`
    );
  }

  const finalMaxTotalUncompressedBytes = maxTotalUncompressedBytesStr
    ? parseInt(maxTotalUncompressedBytesStr, 10)
    : DEFAULT_MAX_TOTAL_UNCOMPRESSED_BYTES;
  if (isNaN(finalMaxTotalUncompressedBytes) || finalMaxTotalUncompressedBytes <= 0) {
    throw new EnvValidationError(
      `Invalid GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES value: ${maxTotalUncompressedBytesStr}. Must be a positive integer.`
    );
  }

  return {
    apiToken: apiToken.trim(),
    gtfsUrl: finalUrl,
    downloadDir: finalDownloadDir,
    timeoutMs: finalTimeoutMs,
    extractionDir: finalExtractionDir,
    maxArchiveFiles: finalMaxArchiveFiles,
    maxSingleFileBytes: finalMaxSingleFileBytes,
    maxTotalUncompressedBytes: finalMaxTotalUncompressedBytes,
  };
}
