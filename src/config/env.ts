import "dotenv/config";

const GTFS_DOWNLOAD_DIR = process.env.GTFS_DOWNLOAD_DIR || "./data/gtfs";
const GTFS_EXTRACTION_DIR = process.env.GTFS_EXTRACTION_DIR || "./data/gtfs/extracted";
const TFNSW_API_TOKEN = process.env.TFNSW_API_TOKEN;
const TFNSW_GTFS_URL = process.env.TFNSW_GTFS_URL || "https://api.transport.nsw.gov.au/v1/publictransport/timetables/complete/gtfs";
const GTFS_DOWNLOAD_TIMEOUT_MS = process.env.GTFS_DOWNLOAD_TIMEOUT_MS ? Number(process.env.GTFS_DOWNLOAD_TIMEOUT_MS) : 600000;
const GTFS_MAX_ARCHIVE_ENTRIES = process.env.GTFS_MAX_ARCHIVE_ENTRIES ? Number(process.env.GTFS_MAX_ARCHIVE_ENTRIES) : 1000;
const GTFS_MAX_SINGLE_FILE_BYTES = process.env.GTFS_MAX_SINGLE_FILE_BYTES ? Number(process.env.GTFS_MAX_SINGLE_FILE_BYTES) : 10 * 1024 * 1024 * 1024; // 10GB
const GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES = process.env.GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES ? Number(process.env.GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES) : 20 * 1024 * 1024 * 1024; // 20GB

// Parse-specific environment variables
const GTFS_PARSE_BATCH_SIZE = process.env.GTFS_PARSE_BATCH_SIZE ? Number(process.env.GTFS_PARSE_BATCH_SIZE) : 10000;
const GTFS_PARSE_MAX_ISSUES = process.env.GTFS_PARSE_MAX_ISSUES ? Number(process.env.GTFS_PARSE_MAX_ISSUES) : 1000;

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

/**
 * Validate environment variables for parse commands.
 * Does not require TFNSW_API_TOKEN.
 */
export function validateParseEnv(): void {
    if (!Number.isFinite(GTFS_PARSE_BATCH_SIZE) || GTFS_PARSE_BATCH_SIZE <= 0) {
        throw new Error("GTFS_PARSE_BATCH_SIZE must be a positive integer");
    }

    if (!Number.isFinite(GTFS_PARSE_MAX_ISSUES) || GTFS_PARSE_MAX_ISSUES <= 0) {
        throw new Error("GTFS_PARSE_MAX_ISSUES must be a positive integer");
    }
}

export {
    GTFS_DOWNLOAD_DIR,
    GTFS_EXTRACTION_DIR,
    TFNSW_API_TOKEN,
    TFNSW_GTFS_URL,
    GTFS_DOWNLOAD_TIMEOUT_MS,
    GTFS_MAX_ARCHIVE_ENTRIES,
    GTFS_MAX_SINGLE_FILE_BYTES,
    GTFS_MAX_TOTAL_UNCOMPRESSED_BYTES,
    GTFS_PARSE_BATCH_SIZE,
    GTFS_PARSE_MAX_ISSUES,
};

export interface DatabaseConfig {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    connectionLimit: number;
}

export function getDatabaseConfig(): DatabaseConfig {
    const host = process.env.DB_HOST;
    const port = Number(process.env.DB_PORT);
    const user = process.env.DB_USER;
    const password = process.env.DB_PASSWORD || "";
    const database = process.env.DB_NAME;
    const connectionLimit = Number(process.env.DB_CONNECTION_LIMIT);

    if (!host) throw new Error("DB_HOST must not be empty");
    if (!Number.isInteger(port) || port <= 0) throw new Error("DB_PORT must be a positive integer");
    if (!user) throw new Error("DB_USER must not be empty");
    if (!database) throw new Error("DB_NAME must not be empty");
    if (!Number.isInteger(connectionLimit) || connectionLimit <= 0) throw new Error("DB_CONNECTION_LIMIT must be a positive integer");

    return { host, port, user, password, database, connectionLimit };
}