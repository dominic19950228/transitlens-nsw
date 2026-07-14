/**
 * Environment configuration and validation for NSW Transit Platform
 */

export const DEFAULT_GTFS_URL =
  "https://api.transport.nsw.gov.au/v1/publictransport/timetables/complete/gtfs";
export const DEFAULT_DOWNLOAD_DIR = "./data/gtfs";
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export interface EnvConfig {
  apiToken: string;
  gtfsUrl: string;
  downloadDir: string;
  timeoutMs: number;
}

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * Load and validate environment variables for GTFS downloader.
 */
export function loadEnv(): EnvConfig {
  const apiToken = process.env.TFNSW_API_TOKEN;
  const gtfsUrl = process.env.TFNSW_GTFS_URL;
  const downloadDir = process.env.GTFS_DOWNLOAD_DIR;
  const timeoutStr = process.env.GTFS_TIMEOUT_MS;

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

  const timeoutMs = timeoutStr ? parseInt(timeoutStr, 10) : DEFAULT_TIMEOUT_MS;
  if (isNaN(timeoutMs) || timeoutMs <= 0) {
    throw new EnvValidationError(
      `Invalid GTFS_TIMEOUT_MS value: ${timeoutStr}. Must be a positive integer.`
    );
  }

  return {
    apiToken: apiToken.trim(),
    gtfsUrl: finalUrl,
    downloadDir: finalDownloadDir,
    timeoutMs,
  };
}
