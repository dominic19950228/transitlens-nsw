/**
 * GTFS Extractor - Step 2 of NSW Transit Platform
 * Extracts TfNSW Complete GTFS ZIP file using streaming (unzipper).
 */

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import * as unzipper from "unzipper";

// Required GTFS text files
const REQUIRED_GTFS_FILES = [
  "agency.txt",
  "stops.txt",
  "routes.txt",
  "trips.txt",
  "stop_times.txt",
] as const;

// GTFS files that define service availability (one of these is required)
const SERVICE_FILES = ["calendar.txt", "calendar_dates.txt"] as const;

// Optional GTFS files
const OPTIONAL_GTFS_FILES = [
  "feed_info.txt",
  "shapes.txt",
  "frequencies.txt",
  "transfers.txt",
  "pathways.txt",
  "levels.txt",
  "translations.txt",
] as const;

// All recognized GTFS files
const ALL_GTFS_FILES = [
  ...REQUIRED_GTFS_FILES,
  ...SERVICE_FILES,
  ...OPTIONAL_GTFS_FILES,
] as const;

export type GtfsFileName = (typeof ALL_GTFS_FILES)[number];

export interface ExtractGtfsOptions {
  zipFilePath: string;
  outputDirectory: string;
  validateRequired?: boolean;
  cleanOnFailure?: boolean;
  maxFiles?: number;
  maxSingleFileBytes?: number;
  maxTotalBytes?: number;
}

export interface ExtractGtfsResult {
  extractedPath: string;
  extractedFiles: string[];
  extractedAt: string;
  zipFilePath: string;
  zipFileSize: number;
  totalExtractedBytes: number;
}

// Custom error classes

export class ExtractorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractorError";
  }
}

export class ZipFileNotFoundError extends ExtractorError {
  constructor(filePath: string) {
    super(`ZIP file not found: ${filePath}`);
    this.name = "ZipFileNotFoundError";
  }
}

export class NotZipFileError extends ExtractorError {
  constructor(reason: string) {
    super(`Invalid ZIP file: ${reason}`);
    this.name = "NotZipFileError";
  }
}

export class EmptyZipError extends ExtractorError {
  constructor() {
    super("ZIP file is empty");
    this.name = "EmptyZipError";
  }
}

export class ExtractionFailedError extends ExtractorError {
  constructor(cause: string) {
    super(`Extraction failed: ${cause}`);
    this.name = "ExtractionFailedError";
  }
}

export class AtomicRenameError extends ExtractorError {
  constructor(cause: string) {
    super(`Failed to finalize extraction: ${cause}`);
    this.name = "AtomicRenameError";
  }
}

export class MissingRequiredFileError extends ExtractorError {
  missingFiles: string[];

  constructor(missingFiles: string[]) {
    super(`Missing required GTFS files: ${missingFiles.join(", ")}`);
    this.name = "MissingRequiredFileError";
    this.missingFiles = missingFiles;
  }
}

export class InvalidGtfsStructureError extends ExtractorError {
  constructor(reason: string) {
    super(`Invalid GTFS structure: ${reason}`);
    this.name = "InvalidGtfsStructureError";
  }
}

export class ZipTooManyFilesError extends ExtractorError {
  limit: number;
  count: number;

  constructor(limit: number, count: number) {
    super(`ZIP contains ${count} files, exceeding limit of ${limit}`);
    this.name = "ZipTooManyFilesError";
    this.limit = limit;
    this.count = count;
  }
}

export class ZipFileTooLargeError extends ExtractorError {
  fileName: string;
  sizeBytes: number;
  limitBytes: number;

  constructor(fileName: string, sizeBytes: number, limitBytes: number) {
    super(`File ${fileName} is ${sizeBytes} bytes, exceeding limit of ${limitBytes}`);
    this.name = "ZipFileTooLargeError";
    this.fileName = fileName;
    this.sizeBytes = sizeBytes;
    this.limitBytes = limitBytes;
  }
}

export class ZipTotalTooLargeError extends ExtractorError {
  totalBytes: number;
  limitBytes: number;

  constructor(totalBytes: number, limitBytes: number) {
    super(`Total uncompressed size ${totalBytes} bytes exceeds limit of ${limitBytes}`);
    this.name = "ZipTotalTooLargeError";
    this.totalBytes = totalBytes;
    this.limitBytes = limitBytes;
  }
}

/**
 * Validate that the ZIP file exists and is readable.
 */
async function validateZipFile(zipFilePath: string): Promise<number> {
  try {
    const stats = await stat(zipFilePath);
    if (!stats.isFile()) {
      throw new ZipFileNotFoundError(zipFilePath);
    }
    if (stats.size === 0) {
      throw new EmptyZipError();
    }
    return stats.size;
  } catch (err) {
    if (err instanceof ExtractorError) {
      throw err;
    }
    throw new ZipFileNotFoundError(zipFilePath);
  }
}

/**
 * Validate output directory path.
 */
function validateOutputDirectory(outputDir: string): void {
  if (!outputDir || outputDir.trim() === "") {
    throw new ExtractionFailedError("Output directory cannot be empty");
  }
}

/**
 * Get timestamp in ISO format.
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Validate that extracted files contain required GTFS files.
 */
function validateGtfsStructure(extractedFiles: string[]): string[] {
  const missingFiles: string[] = [];
  const extractedLower = extractedFiles.map((f) => f.toLowerCase());

  for (const required of REQUIRED_GTFS_FILES) {
    if (!extractedLower.includes(required.toLowerCase())) {
      missingFiles.push(required);
    }
  }

  const hasServiceFile = SERVICE_FILES.some((serviceFile) =>
    extractedLower.includes(serviceFile.toLowerCase())
  );

  if (!hasServiceFile) {
    missingFiles.push(...SERVICE_FILES);
  }

  return missingFiles;
}

/**
 * Check if a filename is a recognized GTFS file.
 */
function isGtfsFile(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return ALL_GTFS_FILES.some((gtfsFile) => gtfsFile.toLowerCase() === lowerName);
}

/**
 * Extract GTFS ZIP file to output directory (atomic).
 * Steps:
 * 1. Extract to a temporary subdirectory
 * 2. Validate structure
 * 3. Return result (no rename; caller decides to finalize)
 */
export async function extractGtfs(
  options: ExtractGtfsOptions
): Promise<ExtractGtfsResult> {
  const {
    zipFilePath,
    outputDirectory,
    validateRequired = true,
    cleanOnFailure = true,
    maxFiles = 100,
    maxSingleFileBytes = 10 * 1024 * 1024 * 1024, // 10 GiB
    maxTotalBytes = 20 * 1024 * 1024 * 1024, // 20 GiB
  } = options;

  // Validate inputs
  const zipFileSize = await validateZipFile(zipFilePath);
  validateOutputDirectory(outputDirectory);

  // Ensure output directory exists
  await mkdir(outputDirectory, { recursive: true });

  const extractedAt = getTimestamp();

  // Create temporary extraction directory with a unique name
  const timestampForDir = `${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const tempDirName = `extraction-${timestampForDir}`;
  const tempDirPath = join(outputDirectory, tempDirName);
  let tempDirExists = false;

  const extractedFiles: string[] = [];
  let totalExtractedBytes = 0;
  let fileCount = 0;

  try {
    await mkdir(tempDirPath, { recursive: true });
    tempDirExists = true;

    // Use unzipper.Parse() for streaming extraction
    await new Promise<void>((resolve, reject) => {
      const readStream = createReadStream(zipFilePath);
      const parseStream = unzipper.Parse();

      readStream.on("error", (err: Error) => {
        reject(new ExtractionFailedError(`Failed to read ZIP: ${err.message}`));
      });

      parseStream.on("error", (err: Error) => {
        reject(new ExtractionFailedError(`Failed to parse ZIP: ${err.message}`));
      });

      parseStream.on("close", () => {
        resolve();
      });

      parseStream.on("entry", (entry: unzipper.Entry) => {
        const fileName = basename(entry.path);

        // Skip non-GTFS files and directories
        if (!isGtfsFile(fileName) || entry.type === "Directory") {
          entry.autodrain();
          return;
        }

        // Enforce file count limit
        fileCount++;
        if (fileCount > maxFiles) {
          entry.autodrain();
          // Don't reject outright; track and handle at end
          return;
        }

        // Check individual file size
        const fileSize = entry.vars.compressedSize || 0;
        if (fileSize > maxSingleFileBytes) {
          entry.autodrain();
          reject(new ZipFileTooLargeError(fileName, fileSize, maxSingleFileBytes));
          return;
        }

        const destPath = join(tempDirPath, fileName);
        const writeStream = createWriteStream(destPath);

        writeStream.on("error", (err) => {
          reject(new ExtractionFailedError(`Failed to write ${fileName}: ${err.message}`));
        });

        entry.pipe(writeStream);

        entry.on("end", () => {
          extractedFiles.push(fileName);
          totalExtractedBytes += fileSize;
        });
      });

      readStream.pipe(parseStream);
    });

    // After streaming, check file count limit
    if (fileCount > maxFiles) {
      throw new ZipTooManyFilesError(maxFiles, fileCount);
    }

    // Check total size limit
    if (totalExtractedBytes > maxTotalBytes) {
      throw new ZipTotalTooLargeError(totalExtractedBytes, maxTotalBytes);
    }

    if (extractedFiles.length === 0) {
      throw new EmptyZipError();
    }

    // Validate GTFS structure if requested
    if (validateRequired) {
      const missingFiles = validateGtfsStructure(extractedFiles);
      if (missingFiles.length > 0) {
        throw new MissingRequiredFileError(missingFiles);
      }
    }

    // Optional ZIP signature check (quick validation)
    // unzipper already validated, but we do a simple check
    const headerBuffer = Buffer.alloc(4);
    const { open } = await import("node:fs/promises");
    const headerFd = await open(zipFilePath, "r");
    try {
      await headerFd.read(headerBuffer, 0, 4, 0);
      if (headerBuffer[0] !== 0x50 || headerBuffer[1] !== 0x4b) {
        throw new NotZipFileError("Invalid ZIP signature");
      }
    } finally {
      await headerFd.close();
    }

    return {
      extractedPath: tempDirPath,
      extractedFiles: extractedFiles.sort(),
      extractedAt,
      zipFilePath,
      zipFileSize,
      totalExtractedBytes,
    };
  } catch (err) {
    // Clean up temp directory on failure
    if (cleanOnFailure && tempDirExists) {
      try {
        await rm(tempDirPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    throw err;
  }
}