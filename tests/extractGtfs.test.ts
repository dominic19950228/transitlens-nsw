/**
 * Tests for GTFS ZIP Extractor
 * Uses Vitest with generated ZIP fixtures.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createWriteStream } from "node:fs";
import { extractGtfs } from "../src/extract/extractGtfs.js";
import {
  ZipFileNotFoundError,
  MissingRequiredFileError,
  ZipTooManyFilesError,
  ZipFileTooLargeError,
  ZipTotalTooLargeError,
} from "../src/extract/extractGtfs.js";
import { createHash } from "node:crypto";
import { ZipArchive } from "archiver";

// Test directory
const TEST_DIR = "./data/test-extract";

// Helper: Create a minimal valid ZIP with GTFS files
async function createTestZip(
  files: Record<string, string>,
  zipPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 0 } });

    output.on("close", resolve);
    archive.on("error", reject);

    archive.pipe(output);
    for (const [name, content] of Object.entries(files)) {
      archive.append(content, { name });
    }
    archive.finalize();
  });
}

// Helper: Create minimal GTFS content
function minimalAgency(): string {
  return `agency_id,agency_name,agency_url,agency_timezone\n1,TfNSW,https://transportnsw.info,Australia/Sydney\n`;
}

function minimalStops(): string {
  return `stop_id,stop_name,stop_lat,stop_lon\n1,Central,1.0,1.0\n`;
}

function minimalRoutes(): string {
  return `route_id,agency_id,route_short_name,route_long_name,route_type\n1,1,T1,City Express,2\n`;
}

function minimalTrips(): string {
  return `route_id,service_id,trip_id\n1,1,1\n`;
}

function minimalStopTimes(): string {
  return `trip_id,arrival_time,departure_time,stop_id,stop_sequence\n1,08:00:00,08:00:00,1,1\n`;
}

function minimalCalendar(): string {
  return `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n1,1,1,1,1,1,0,0,20260101,20261231\n`;
}

// Helper: Create full valid GTFS ZIP
async function createValidGtfsZip(zipPath: string): Promise<void> {
  await createTestZip(
    {
      "agency.txt": minimalAgency(),
      "stops.txt": minimalStops(),
      "routes.txt": minimalRoutes(),
      "trips.txt": minimalTrips(),
      "stop_times.txt": minimalStopTimes(),
      "calendar.txt": minimalCalendar(),
    },
    zipPath
  );
}

// Helper: Calculate SHA-256 of a file
async function calculateFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

describe("extractGtfs", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  // Test 1: Successful extraction
  it("should extract valid GTFS ZIP", async () => {
    const zipPath = join(TEST_DIR, "test-feed.zip");
    await createValidGtfsZip(zipPath);

    const result = await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    expect(result.extractionDirectory).toContain("test-feed");
    expect(result.manifestPath).toContain("feed-manifest.json");

    // Verify extraction directory exists
    const extractedFiles = await readdir(result.extractionDirectory);
    expect(extractedFiles).toContain("agency.txt");
    expect(extractedFiles).toContain("stops.txt");
    expect(extractedFiles).toContain("routes.txt");
    expect(extractedFiles).toContain("trips.txt");
    expect(extractedFiles).toContain("stop_times.txt");
    expect(extractedFiles).toContain("calendar.txt");
    expect(extractedFiles).toContain("feed-manifest.json");
  });

  // Test 2: Wrapper directory in ZIP
  it("should handle files in wrapper directory", async () => {
    const zipPath = join(TEST_DIR, "wrapper-test.zip");
    await createTestZip(
      {
        "gtfs-feed/agency.txt": minimalAgency(),
        "gtfs-feed/stops.txt": minimalStops(),
        "gtfs-feed/routes.txt": minimalRoutes(),
        "gtfs-feed/trips.txt": minimalTrips(),
        "gtfs-feed/stop_times.txt": minimalStopTimes(),
        "gtfs-feed/calendar.txt": minimalCalendar(),
      },
      zipPath
    );

    const result = await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    const extractedFiles = await readdir(result.extractionDirectory);
    // Only root-level files should be extracted
    expect(extractedFiles).toContain("agency.txt");
    expect(extractedFiles).toContain("stops.txt");
  });

  // Test 3: Uppercase filenames
  it("should normalize uppercase GTFS filenames to lowercase", async () => {
    const zipPath = join(TEST_DIR, "uppercase-test.zip");
    await createTestZip(
      {
        "AGENCY.TXT": minimalAgency(),
        "STOPS.TXT": minimalStops(),
        "ROUTES.TXT": minimalRoutes(),
        "TRIPS.TXT": minimalTrips(),
        "STOP_TIMES.TXT": minimalStopTimes(),
        "CALENDAR.TXT": minimalCalendar(),
      },
      zipPath
    );

    const result = await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    const extractedFiles = await readdir(result.extractionDirectory);
    expect(extractedFiles).toContain("agency.txt");
    expect(extractedFiles).toContain("stops.txt");
    expect(extractedFiles).not.toContain("AGENCY.TXT");
  });

  // Test 4: calendar.txt only
  it("should accept calendar.txt as valid service file", async () => {
    const zipPath = join(TEST_DIR, "calendar-only.zip");
    await createTestZip(
      {
        "agency.txt": minimalAgency(),
        "stops.txt": minimalStops(),
        "routes.txt": minimalRoutes(),
        "trips.txt": minimalTrips(),
        "stop_times.txt": minimalStopTimes(),
        "calendar.txt": minimalCalendar(),
      },
      zipPath
    );

    const result = await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    const extractedFiles = await readdir(result.extractionDirectory);
    expect(extractedFiles).toContain("calendar.txt");
  });

  // Test 5: Missing required file
  it("should fail when a required file is missing", async () => {
    const zipPath = join(TEST_DIR, "missing-required.zip");
    await createTestZip(
      {
        "agency.txt": minimalAgency(),
        "stops.txt": minimalStops(),
        // Missing routes.txt
        "trips.txt": minimalTrips(),
        "stop_times.txt": minimalStopTimes(),
        "calendar.txt": minimalCalendar(),
      },
      zipPath
    );

    await expect(
      extractGtfs({
        zipFilePath: zipPath,
        outputDirectory: TEST_DIR,
      })
    ).rejects.toThrow(/routes\.txt/);
  });

  // Test 6: Duplicate filenames (case-insensitive)
  it("should reject duplicate normalized filenames", async () => {
    const zipPath = join(TEST_DIR, "duplicate-test.zip");
    await createTestZip(
      {
        "agency.txt": minimalAgency(),
        "stops.txt": minimalStops(),
        "routes.txt": minimalRoutes(),
        "trips.txt": minimalTrips(),
        "stop_times.txt": minimalStopTimes(),
        "calendar.txt": minimalCalendar(),
        "AGENCY.TXT": minimalAgency(), // Duplicate
      },
      zipPath
    );

    await expect(
      extractGtfs({
        zipFilePath: zipPath,
        outputDirectory: TEST_DIR,
      })
    ).rejects.toThrow(/duplicate/i);
  });

  // Test 7: Single file size limit
  it("should enforce maximum single file size limit", async () => {
    const zipPath = join(TEST_DIR, "large-file.zip");
    const largeContent = "x".repeat(1000);

    await createTestZip(
      {
        "agency.txt": minimalAgency(),
        "stops.txt": minimalStops(),
        "routes.txt": minimalRoutes(),
        "trips.txt": minimalTrips(),
        "stop_times.txt": minimalStopTimes(),
        "calendar.txt": minimalCalendar(),
        "shapes.txt": largeContent,
      },
      zipPath
    );

    await expect(
      extractGtfs({
        zipFilePath: zipPath,
        outputDirectory: TEST_DIR,
        maxSingleFileBytes: 100,
      })
    ).rejects.toThrow(ZipFileTooLargeError);
  });

  // Test 8: Total size limit
  it("should enforce maximum total uncompressed size limit", async () => {
    const zipPath = join(TEST_DIR, "too-large.zip");

    await createTestZip(
      {
        "agency.txt": minimalAgency(),
        "stops.txt": minimalStops(),
        "routes.txt": minimalRoutes(),
        "trips.txt": minimalTrips(),
        "stop_times.txt": minimalStopTimes(),
        "calendar.txt": minimalCalendar(),
        "shapes.txt": "x".repeat(500),
        "feed_info.txt": "y".repeat(500),
      },
      zipPath
    );

    await expect(
      extractGtfs({
        zipFilePath: zipPath,
        outputDirectory: TEST_DIR,
        maxTotalBytes: 200,
      })
    ).rejects.toThrow(ZipTotalTooLargeError);
  });

  // Test 9: ZIP file not found
  it("should fail when ZIP file does not exist", async () => {
    await expect(
      extractGtfs({
        zipFilePath: join(TEST_DIR, "nonexistent.zip"),
        outputDirectory: TEST_DIR,
      })
    ).rejects.toThrow(ZipFileNotFoundError);
  });

  // Test 10: Entry limit
  it("should enforce maximum archive entries limit", async () => {
    const zipPath = join(TEST_DIR, "too-many-entries.zip");

    // Create ZIP with many files
    const files: Record<string, string> = {
      "agency.txt": minimalAgency(),
      "stops.txt": minimalStops(),
      "routes.txt": minimalRoutes(),
      "trips.txt": minimalTrips(),
      "stop_times.txt": minimalStopTimes(),
      "calendar.txt": minimalCalendar(),
    };

    // Add 10 extra files
    for (let i = 0; i < 10; i++) {
      files[`extra_${i}.txt`] = `extra content ${i}`;
    }

    await createTestZip(files, zipPath);

    await expect(
      extractGtfs({
        zipFilePath: zipPath,
        outputDirectory: TEST_DIR,
        maxEntries: 5,
      })
    ).rejects.toThrow(ZipTooManyFilesError);
  });

  // Test 11: Manifest creation
  it("should create valid feed-manifest.json", async () => {
    const zipPath = join(TEST_DIR, "manifest-test.zip");
    await createValidGtfsZip(zipPath);

    const result = await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    const manifestContent = await readFile(result.manifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent);

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sourceZip.fileName).toBe("manifest-test.zip");
    expect(manifest.sourceZip.sha256).toHaveLength(64);
    expect(manifest.extractedAt).toBeDefined();
    expect(manifest.requiredFiles).toContain("agency.txt");
    expect(manifest.files).toBeInstanceOf(Array);
    expect(manifest.totalFiles).toBeGreaterThan(0);
    expect(manifest.totalUncompressedBytes).toBeGreaterThan(0);
  });

  // Test 12: Source ZIP hash
  it("should calculate correct SHA-256 of source ZIP", async () => {
    const zipPath = join(TEST_DIR, "hash-test.zip");
    await createValidGtfsZip(zipPath);

    const expectedHash = await calculateFileHash(zipPath);

    const result = await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    const manifestContent = await readFile(result.manifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent);

    expect(manifest.sourceZip.sha256).toBe(expectedHash);
  });

  // Test 13: File hashes
  it("should calculate SHA-256 for each extracted file", async () => {
    const zipPath = join(TEST_DIR, "file-hashes.zip");
    await createValidGtfsZip(zipPath);

    const result = await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    const manifestContent = await readFile(result.manifestPath, "utf-8");
    const manifest = JSON.parse(manifestContent);

    for (const fileEntry of manifest.files) {
      expect(fileEntry.sha256).toHaveLength(64);
      expect(fileEntry.sizeBytes).toBeGreaterThan(0);

      // Verify actual file hash
      const actualHash = await calculateFileHash(
        join(result.extractionDirectory, fileEntry.fileName)
      );
      expect(actualHash).toBe(fileEntry.sha256);
    }
  });

  // Test 14: Atomic final directory
  it("should create final directory atomically (no .part suffix)", async () => {
    const zipPath = join(TEST_DIR, "atomic-test.zip");
    await createValidGtfsZip(zipPath);

    const result = await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    // Final directory should not have .part suffix
    expect(result.extractionDirectory).not.toContain(".part");

    // And it should exist
    const stats = await stat(result.extractionDirectory);
    expect(stats.isDirectory()).toBe(true);
  });

  // Test 15: Cleanup after failure
  it("should clean up temporary directory after failure", async () => {
    const zipPath = join(TEST_DIR, "cleanup-fail.zip");

    await createTestZip(
      {
        "agency.txt": minimalAgency(),
        "stops.txt": minimalStops(),
        // Missing required files
      },
      zipPath
    );

    try {
      await extractGtfs({
        zipFilePath: zipPath,
        outputDirectory: TEST_DIR,
      });
    } catch {
      // Expected to fail
    }

    // No .part directories should exist
    const files = await readdir(TEST_DIR);
    const partDirs = files.filter((f) => f.includes(".part"));
    expect(partDirs).toHaveLength(0);
  });

  // Test 16: Source ZIP preserved
  it("should preserve the source ZIP after extraction", async () => {
    const zipPath = join(TEST_DIR, "preserve-source.zip");
    await createValidGtfsZip(zipPath);

    await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    // Source ZIP should still exist
    const stats = await stat(zipPath);
    expect(stats.isFile()).toBe(true);
  });

  // Test 17: Idempotency
  it("should return existing extraction when source ZIP unchanged", async () => {
    const zipPath = join(TEST_DIR, "idempotent.zip");
    await createValidGtfsZip(zipPath);

    // First extraction
    const result1 = await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    // Second extraction should return same path
    const result2 = await extractGtfs({
      zipFilePath: zipPath,
      outputDirectory: TEST_DIR,
    });

    expect(result1.extractionDirectory).toBe(result2.extractionDirectory);
    expect(result1.manifestPath).toBe(result2.manifestPath);
  });
});