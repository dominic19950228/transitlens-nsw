import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat, rename, readFile, writeFile, access } from "node:fs/promises";
import { join, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";
import unzipper from "unzipper";
import { isPathSafe } from "./pathSafety.js";

const REQUIRED_GTFS = ["agency.txt", "stops.txt", "routes.txt", "trips.txt", "stop_times.txt"] as const;
const SERVICE_GTFS = ["calendar.txt", "calendar_dates.txt"] as const;

export interface ExtractGtfsOptions {
  zipFilePath: string;
  outputDirectory: string;
  maxEntries?: number;
  maxSingleFileBytes?: number;
  maxTotalBytes?: number;
}

export interface ExtractGtfsResult {
  extractionDirectory: string;
  manifestPath: string;
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

export class UnsafePathError extends ExtractorError {
  constructor(path: string) {
    super(`Unsafe archive path detected: ${path}`);
    this.name = "UnsafePathError";
  }
}

export class SymlinkNotAllowedError extends ExtractorError {
  constructor(path: string) {
    super(`Symbolic links are not allowed: ${path}`);
    this.name = "SymlinkNotAllowedError";
  }
}

export class DuplicateFileError extends ExtractorError {
  constructor(fileName: string) {
    super(`Duplicate normalized filename detected: ${fileName}`);
    this.name = "DuplicateFileError";
  }
}

export class ExtractionConflictError extends ExtractorError {
  existingDir: string;

  constructor(existingDir: string, message: string) {
    super(message);
    this.name = "ExtractionConflictError";
    this.existingDir = existingDir;
  }
}

// Generate unique temporary directory name using timestamp
function generateTempDirName(baseDir: string, zipBasename: string): string {
  const timestamp = Date.now();
  return join(baseDir, `${zipBasename}.part.${timestamp}`);
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
 * Get timestamp in ISO format (UTC).
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Validate that extracted files contain required GTFS files.
 */
function validateGtfsStructure(
  extractedFiles: Set<string>,
  hasCalendar: boolean,
  hasCalendarDates: boolean
): string[] {
  const missingFiles: string[] = [];

  for (const required of REQUIRED_GTFS) {
    if (!extractedFiles.has(required.toLowerCase())) {
      missingFiles.push(required);
    }
  }

  // Require at least one of calendar.txt or calendar_dates.txt
  if (!hasCalendar && !hasCalendarDates) {
    missingFiles.push(...SERVICE_GTFS);
  }

  return missingFiles;
}

/**
 * Calculate SHA-256 hash of a file using streaming.
 */
async function calculateFileHash(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

/**
 * Check if an entry is a recognized GTFS filename.
 */
function isRecognizedGtfsFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    REQUIRED_GTFS.includes(lower as typeof REQUIRED_GTFS[number]) ||
    SERVICE_GTFS.includes(lower as typeof SERVICE_GTFS[number]) ||
    lower === "feed_info.txt" ||
    lower === "shapes.txt" ||
    lower === "frequencies.txt" ||
    lower === "transfers.txt" ||
    lower === "pathways.txt" ||
    lower === "levels.txt" ||
    lower === "translations.txt" ||
    lower === "attributions.txt" ||
    lower === "fare_attributes.txt" ||
    lower === "fare_rules.txt"
  );
}

class HashTransform extends Transform {
  private hash = createHash("sha256");
  private byteCount = 0;
  constructor(private fileName: string, private maxBytes: number) {
    super();
  }
  _transform(chunk: Buffer, _: BufferEncoding, cb: TransformCallback) {
    this.byteCount += chunk.length;
    if (this.byteCount > this.maxBytes) {
      return cb(new ZipFileTooLargeError(this.fileName, this.byteCount, this.maxBytes));
    }
    this.hash.update(chunk);
    cb(null, chunk);
  }
  get result() {
    return { size: this.byteCount, sha256: this.hash.digest("hex") };
  }
}

async function extractStreamToFile(
  entry: unzipper.File,
  outputPath: string,
  maxSingleFileBytes: number
): Promise<{ size: number; sha256: string }> {
  const hashTransform = new HashTransform(basename(outputPath), maxSingleFileBytes);
  await pipeline(entry.stream(), hashTransform, createWriteStream(outputPath));
  return hashTransform.result;
}

/**
 * Extract GTFS ZIP file to output directory atomically.
 * Uses streaming for memory-efficient extraction.
 */
export async function extractGtfs(
  options: ExtractGtfsOptions
): Promise<ExtractGtfsResult> {
  const {
    zipFilePath,
    outputDirectory,
    maxEntries = 1000,
    maxSingleFileBytes = 10 * 1024 * 1024 * 1024, // 10GB default
    maxTotalBytes = 20 * 1024 * 1024 * 1024, // 20GB default
  } = options;

  // Validate inputs
  const zipFileSize = await validateZipFile(zipFilePath);
  const zipBasename = basename(zipFilePath, ".zip");
  const finalDir = join(outputDirectory, zipBasename);

  // Check for existing extraction (idempotency)
  try {
    await access(finalDir);
    // Directory exists - check manifest
    const manifestPath = join(finalDir, "feed-manifest.json");
    try {
      const manifestContent = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestContent);
      const existingHash = manifest.sourceZip?.sha256;
      if (existingHash) {
        const currentHash = await calculateFileHash(zipFilePath);
        if (existingHash === currentHash) {
          // Same source - return existing extraction
          return {
            extractionDirectory: finalDir,
            manifestPath,
          };
        }
      }
      // Different source or missing hash - conflict
      throw new ExtractionConflictError(
        finalDir,
        `Extraction directory already exists with different source: ${finalDir}`
      );
    } catch (err) {
      if (err instanceof ExtractionConflictError) {
        throw err;
      }
      // Invalid manifest - conflict
      throw new ExtractionConflictError(
        finalDir,
        `Existing extraction directory has invalid manifest: ${finalDir}`
      );
    }
  } catch (err) {
    if (err instanceof ExtractionConflictError) {
      throw err;
    }
    // Directory doesn't exist - proceed with extraction
  }

  // Ensure output directory exists
  await mkdir(outputDirectory, { recursive: true });

  // Create unique temporary extraction directory
  const tempDirPath = generateTempDirName(outputDirectory, zipBasename);
  let tempDirExists = false;

  const extractedFiles = new Set<string>();
  const fileHashes: Record<string, { size: number; sha256: string }> = {};
  let totalExtractedBytes = 0;
  let entryCount = 0;
  let hasCalendar = false;
  let hasCalendarDates = false;
  const normalizedNames = new Set<string>();

  try {
    await mkdir(tempDirPath, { recursive: true });
    tempDirExists = true;

    // Open ZIP file using unzipper
    const directory = await unzipper.Open.file(zipFilePath);

    for (const entry of directory.files) {
      // Skip directories
      if (entry.type === "Directory") {
        continue;
      }

      entryCount++;
      if (entryCount > maxEntries) {
        throw new ZipTooManyFilesError(maxEntries, entryCount);
      }

      // Get the final path component only (basename)
      const entryBasename = basename(entry.path);
      const entryPath = entry.path;

      // Validate path safety - throw on unsafe paths (not skip)
      if (!isPathSafe(entryPath)) {
        throw new UnsafePathError(entryPath);
      }

      // Normalize to lowercase for GTFS files
      const normalizedName = entryBasename.toLowerCase();

      // Only extract recognized GTFS filenames
      if (!isRecognizedGtfsFile(normalizedName)) {
        // Not a GTFS file we care about, skip it (but still count toward limit)
        continue;
      }

      // Check for duplicate normalized filenames using Set
      if (normalizedNames.has(normalizedName)) {
        throw new DuplicateFileError(normalizedName);
      }
      normalizedNames.add(normalizedName);

      // Track service calendar files
      if (normalizedName === "calendar.txt") hasCalendar = true;
      if (normalizedName === "calendar_dates.txt") hasCalendarDates = true;

      const outputPath = join(tempDirPath, normalizedName);

      // Extract using streaming with size tracking
      try {
        const result = await extractStreamToFile(entry, outputPath, maxSingleFileBytes);

        totalExtractedBytes += result.size;
        if (totalExtractedBytes > maxTotalBytes) {
          // Clean up the file we just wrote
          await rm(outputPath, { force: true });
          throw new ZipTotalTooLargeError(totalExtractedBytes, maxTotalBytes);
        }

        extractedFiles.add(normalizedName);
        fileHashes[normalizedName] = result;
      } catch (err) {
        if (
          err instanceof ZipFileTooLargeError ||
          err instanceof ZipTotalTooLargeError ||
          err instanceof ExtractionFailedError
        ) {
          throw err;
        }
        // Clean up partial file
        try {
          await rm(outputPath, { force: true });
        } catch { /* ignore */ }
        throw new ExtractionFailedError(
          `Failed to extract ${normalizedName}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Validate GTFS structure
    const missing = validateGtfsStructure(extractedFiles, hasCalendar, hasCalendarDates);
    if (missing.length > 0) {
      throw new MissingRequiredFileError(missing);
    }

    // Calculate source ZIP hash for manifest
    const sourceHash = await calculateFileHash(zipFilePath);

    // Build manifest with stable ordering
    const sortedFileNames = Object.keys(fileHashes).sort();
    const manifest = {
      schemaVersion: 1,
      sourceZip: {
        fileName: basename(zipFilePath),
        filePath: zipFilePath,
        sizeBytes: zipFileSize,
        sha256: sourceHash,
      },
      extractedAt: getTimestamp(),
      extractionDirectory: finalDir,
      requiredFiles: [...REQUIRED_GTFS].sort(),
      optionalFiles: sortedFileNames.filter(
        (f) =>
          !REQUIRED_GTFS.includes(f as typeof REQUIRED_GTFS[number]) &&
          !SERVICE_GTFS.includes(f as typeof SERVICE_GTFS[number])
      ),
      missingRequiredFiles: [],
      files: sortedFileNames.map((name) => ({
        fileName: name,
        relativePath: name,
        sizeBytes: fileHashes[name].size,
        sha256: fileHashes[name].sha256,
      })),
      totalFiles: extractedFiles.size,
      totalUncompressedBytes: totalExtractedBytes,
    };

    // Write manifest
    await writeFile(join(tempDirPath, "feed-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    // Atomically rename temp directory to final
    await rename(tempDirPath, finalDir);
    tempDirExists = false;

    return {
      extractionDirectory: finalDir,
      manifestPath: join(finalDir, "feed-manifest.json"),
    };
  } catch (err) {
    // Clean up temp directory on failure
    if (tempDirExists) {
      await rm(tempDirPath, { recursive: true, force: true }).catch(() => {});
    }
    throw err;
  }
}