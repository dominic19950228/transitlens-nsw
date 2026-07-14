/**
 * GTFS Downloader - Step 1 of NSW Transit Platform
 * Downloads TfNSW Complete GTFS ZIP file using streaming.
 */

import { createWriteStream } from "node:fs";
import { mkdir, rename, unlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { calculateFileSha256, getFileSize } from "../utils/fileHash.js";

// ZIP file signatures
const ZIP_SIGNATURES = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]), // local file header
  Buffer.from([0x50, 0x4b, 0x05, 0x06]), // end of central directory
  Buffer.from([0x50, 0x4b, 0x07, 0x08]), // zip64 format
];

export interface DownloadGtfsOptions {
  url: string;
  apiToken: string;
  outputDirectory: string;
  timeoutMs?: number;
}

export interface DownloadGtfsResult {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  downloadedAt: string;
  contentType: string | null;
}

// Custom error classes for specific failure scenarios

export class DownloaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloaderError";
  }
}

export class MissingTokenError extends DownloaderError {
  constructor() {
    super("Missing API token");
    this.name = "MissingTokenError";
  }
}

export class InvalidURLError extends DownloaderError {
  constructor(url: string) {
    super(`Invalid URL: ${url}`);
    this.name = "InvalidURLError";
  }
}

export class TimeoutError extends DownloaderError {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
  }
}

export class NetworkError extends DownloaderError {
  constructor(cause: string) {
    super(`Network failure: ${cause}`);
    this.name = "NetworkError";
  }
}

export class HttpError extends DownloaderError {
  status: number;
  statusText: string;
  bodyPreview: string | null;

  constructor(status: number, statusText: string, bodyPreview: string | null) {
    super(`HTTP ${status} ${statusText}${bodyPreview ? `: ${bodyPreview}` : ""}`);
    this.name = "HttpError";
    this.status = status;
    this.statusText = statusText;
    this.bodyPreview = bodyPreview;
  }
}

export class UnauthorizedError extends HttpError {
  constructor(bodyPreview: string | null) {
    super(401, "Unauthorized", bodyPreview);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends HttpError {
  constructor(bodyPreview: string | null) {
    super(403, "Forbidden", bodyPreview);
    this.name = "ForbiddenError";
  }
}

export class EmptyResponseError extends DownloaderError {
  constructor() {
    super("Empty response body");
    this.name = "EmptyResponseError";
  }
}

export class ContentTypeError extends DownloaderError {
  constructor(contentType: string | null) {
    super(`Unexpected Content-Type: ${contentType ?? "null"}`);
    this.name = "ContentTypeError";
  }
}

export class NotZipFileError extends DownloaderError {
  constructor(reason: string) {
    super(`Response is not a valid ZIP file: ${reason}`);
    this.name = "NotZipFileError";
  }
}

export class DiskWriteError extends DownloaderError {
  constructor(cause: string) {
    super(`Disk write failure: ${cause}`);
    this.name = "DiskWriteError";
  }
}

export class HashingFailureError extends DownloaderError {
  constructor(cause: string) {
    super(`Hashing failure: ${cause}`);
    this.name = "HashingFailureError";
  }
}

export class AtomicRenameError extends DownloaderError {
  constructor(cause: string) {
    super(`Atomic rename failure: ${cause}`);
    this.name = "AtomicRenameError";
  }
}

/**
 * Validate that the URL is well-formed.
 */
function validateUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) {
      throw new InvalidURLError(url);
    }
  } catch (err) {
    if (err instanceof InvalidURLError) {
      throw err;
    }
    throw new InvalidURLError(url);
  }
}

/**
 * Validate that the API token is present.
 */
function validateToken(apiToken: string): void {
  if (!apiToken || apiToken.trim() === "") {
    throw new MissingTokenError();
  }
}

/**
 * Validate that the output directory path is valid.
 */
function validateOutputDirectory(outputDir: string): void {
  if (!outputDir || outputDir.trim() === "") {
    throw new DownloaderError("Output directory cannot be empty");
  }
}

/**
 * Validate that a buffer starts with a known ZIP signature.
 */
function hasValidZipSignature(buffer: Buffer): boolean {
  return ZIP_SIGNATURES.some((sig) => buffer.compare(sig, 0, sig.length, 0, sig.length) === 0);
}

/**
 * Read first N bytes from a file for ZIP signature validation.
 */
async function readFileHeader(filePath: string, byteCount: number): Promise<Buffer> {
  const { open } = await import("node:fs/promises");
  const buffer = Buffer.alloc(byteCount);
  const fileHandle = await open(filePath, "r");
  try {
    await fileHandle.read(buffer, 0, byteCount, 0);
  } finally {
    await fileHandle.close();
  }
  return buffer;
}

/**
 * Extract preview from response body for error reporting (max 1KB).
 */
async function extractBodyPreview(response: Response, maxBytes = 1024): Promise<string | null> {
  try {
    const text = await response.text();
    return text.slice(0, maxBytes);
  } catch {
    return null;
  }
}

/**
 * Generate timestamp in ISO format.
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Format timestamp for filename (YYYYMMDDTHHmmssZ).
 */
function formatTimestampForFilename(date: Date): string {
  // Format: YYYYMMDDTHHmmssZ (no separators)
  // ISO: 2026-07-14T10:58:50.123Z -> 20260714T105850Z
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

/**
 * Main download function for TfNSW GTFS.
 * Downloads the ZIP file using streaming and validates the content.
 */
export async function downloadGtfs(
  options: DownloadGtfsOptions
): Promise<DownloadGtfsResult> {
  const { url, apiToken, outputDirectory, timeoutMs = 10 * 60 * 1000 } = options;

  // Validate inputs
  validateToken(apiToken);
  validateUrl(url);
  validateOutputDirectory(outputDirectory);

  // Ensure output directory exists
  await mkdir(outputDirectory, { recursive: true });

  const downloadedAt = getTimestamp();
  const timestampForFile = formatTimestampForFilename(new Date());
  const partFileName = `tfnsw-complete-gtfs-${timestampForFile}.part`;
  const partFilePath = join(outputDirectory, partFileName);
  const tempFileHandle = { path: partFilePath, exists: false };

  try {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: `apikey ${apiToken}`,
          Accept: "application/zip",
        },
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === "AbortError") {
        throw new TimeoutError(timeoutMs);
      }
      throw new NetworkError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timeoutId);
    }

    // Validate HTTP status
    if (!response.ok) {
      const bodyPreview = await extractBodyPreview(response);
      if (response.status === 401) {
        throw new UnauthorizedError(bodyPreview);
      }
      if (response.status === 403) {
        throw new ForbiddenError(bodyPreview);
      }
      throw new HttpError(response.status, response.statusText, bodyPreview);
    }

    // Check for empty response
    const contentLength = response.headers.get("Content-Length");
    if (contentLength !== null && parseInt(contentLength, 10) === 0) {
      throw new EmptyResponseError();
    }

    // Get content type for informational purposes
    const contentType = response.headers.get("Content-Type");

    // Stream response to file
    if (!response.body) {
      throw new EmptyResponseError();
    }

    try {
      tempFileHandle.exists = true;
      const writeStream = createWriteStream(partFilePath);
      await pipeline(response.body, writeStream);
    } catch (err) {
      throw new DiskWriteError(err instanceof Error ? err.message : String(err));
    }

    // Verify file size is greater than 0
    const stats = await stat(partFilePath);
    if (stats.size === 0) {
      throw new EmptyResponseError();
    }

    // Calculate SHA-256
    let sha256: string;
    try {
      sha256 = await calculateFileSha256(partFilePath);
    } catch (err) {
      throw new HashingFailureError(err instanceof Error ? err.message : String(err));
    }

    // Validate ZIP signature
    const headerBytes = await readFileHeader(partFilePath, 4);
    if (!hasValidZipSignature(headerBytes)) {
      // Try to detect what we got instead
      const textHeader = headerBytes.toString("utf8", 0, 4);
      let reason = "unknown format";

      if (textHeader.startsWith("{") || textHeader.startsWith("[")) {
        reason = "response contains JSON, possibly an error response";
      } else if (textHeader.toLowerCase().includes("html") || textHeader.includes("<")) {
        reason = "response contains HTML, possibly an error page";
      } else {
        reason = `file header: ${headerBytes.toString("hex")}`;
      }
      throw new NotZipFileError(reason);
    }

    // Generate final filename with timestamp and hash prefix
    const hashPrefix = sha256.slice(0, 12);
    const finalFileName = `tfnsw-complete-gtfs-${timestampForFile}-${hashPrefix}.zip`;
    const finalFilePath = join(outputDirectory, finalFileName);

    // Atomic rename
    try {
      await rename(partFilePath, finalFilePath);
      tempFileHandle.exists = false; // Rename succeeded, no longer a .part file
    } catch (err) {
      throw new AtomicRenameError(err instanceof Error ? err.message : String(err));
    }

    // Get final file size
    const finalSize = await getFileSize(finalFilePath);

    return {
      filePath: finalFilePath,
      fileName: finalFileName,
      sizeBytes: finalSize,
      sha256,
      downloadedAt,
      contentType,
    };
  } catch (err) {
    // Clean up .part file on any failure
    if (tempFileHandle.exists) {
      try {
        await unlink(partFilePath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw err;
  }
}
