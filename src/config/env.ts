import "dotenv/config";

const GTFS_DOWNLOAD_DIR = process.env.GTFS_DOWNLOAD_DIR || "./data/gtfs";
const GTFS_EXTRACTION_DIR = process.env.GTFS_EXTRACTION_DIR || "./data/gtfs/extracted";
const TFNSW_API_TOKEN = process.env.TFNSW_API_TOKEN;
const TFNSW_GTFS_URL = process.env.TFNSW_GTFS_URL || "https://api.transport.nsw.gov.au/v1/publictransport/timetables/complete/gtfs";
const GTFS_DOWNLOAD_TIMEOUT_MS = process.env.GTFS_DOWNLOAD_TIMEOUT_MS ? Number(process.env.GTFS_DOWNLOAD_TIMEOUT_MS) : 600000;
const GTFS_MAX_ARCHIVE_ENTRIES = process.env.GTFS_MAX_ARCHIVE_ENTRIES ? Number(process.env.GTFS_MAX_ARCHIVE_ENTRIES) : 1000;
const GTFS_MAX_SINGLE_FILE_BYTES = process.env.GTFS_MAX_SINGLE_FILE_BYTES ? Number(process.env.GTFS_MAX_SINGLE_FILE_BYTES) : 10 * 1024 * 1024 * 1024; // 10GB
const GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES = process.env.GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES ? Number(process.env.GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES) : 20 * 1024 * 1024 * 1024; // 20GB

/**
 * Validate environment variables for download commands.
 * Throws if TFNSW_API_TOKEN is missing.
 */
export function validateDownloadEnv(): void {
  if (!TFNSW_API_TOKEN) {
    throw new Error("TFNSW_API_TOKEN environment variable is required for download commands");
  }

  // Validate timeout is a positive number
  if (!Number.isFinite(GTFS_DOWNLOAD_TIMEOUT_MS) || GTFS_DOWNLOAD_TIMEOUT_MS <= 0) {
    throw new Error("GTFS_DOWNLOAD_TIMEOUT_MS must be a positive number");
  }

  // Validate URL is a valid URL
  try {
    new URL(TFNSW_GTFS_URL);
  } catch {
    throw new Error("TFNSW_GTFS_URL must be a valid URL");
  }
}

/**
 * Validate environment variables for extraction commands.
 * Does not require TFNSW_API_TOKEN.
 */
export function validateExtractionEnv(): void {
  // Validate numeric limits are positive numbers
  if (!Number.isFinite(GTFS_MAX_ARCHIVE_ENTRIES) || GTFS_MAX_ARCHIVE_ENTRIES <= 0) {
    throw new Error("GTFS_MAX_ARCHIVE_ENTRIES must be a positive integer");
  }

  if (!Number.isFinite(GTFS_MAX_SINGLE_FILE_BYTES) || GTFS_MAX_SINGLE_FILE_BYTES <= 0) {
    throw new Error("GTFS_MAX_SINGLE_FILE_BYTES must be a positive integer");
  }

  if (!Number.isFinite(GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES) || GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES <= 0) {
    throw new Error("GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES must be a positive integer");
  }
}

export { GTFS_DOWNLOAD_DIR, GTFS_EXTRACTION_DIR, TFNSW_API_TOKEN, TFNSW_GTFS_URL, GTFS_DOWNLOAD_TIMEOUT_MS, GTFS_MAX_ARCHIVE_ENTRIES, GTFS_MAX_SINGLE_FILE_BYTES, GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES };