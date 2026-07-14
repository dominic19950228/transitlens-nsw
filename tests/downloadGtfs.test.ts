/**
 * Tests for GTFS Downloader
 * Uses Vitest with mocked fetch and local HTTP server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, Server } from "node:http";
import { mkdir, rm, writeFile, unlink } from "node:fs/promises";
import { join, normalize } from "node:path";
import { downloadGtfs } from "../src/download/downloadGtfs.js";

// Test directory
const TEST_DIR = "./data/test-gtfs";

// Helper: Create a minimal valid ZIP file (just headers, minimal content)
function createMinimalZipBuffer(): Buffer {
  // ZIP local file header signature
  const buffer = Buffer.alloc(30);
  buffer.writeUInt32LE(0x04034b50, 0); // Local file header signature
  buffer.writeUInt16LE(20, 4); // Version needed to extract
  buffer.writeUInt16LE(0, 6); // General purpose bit flag
  buffer.writeUInt16LE(0, 8); // Compression method
  buffer.writeUInt16LE(0, 10); // Last mod file time
  buffer.writeUInt16LE(0, 12); // Last mod file date
  buffer.writeUInt32LE(0, 14); // CRC-32
  buffer.writeUInt32LE(0, 18); // Compressed size
  buffer.writeUInt32LE(0, 22); // Uncompressed size
  buffer.writeUInt16LE(5, 26); // File name length
  buffer.writeUInt16LE(0, 28); // Extra field length
  buffer.write("test", 30); // File name
  return buffer;
}

// Helper: Create HTML response
function createHtmlResponse(): string {
  return `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body><h1>Something went wrong</h1></body>
</html>`;
}

// Helper: Create JSON error response
function createJsonErrorResponse(): string {
  return JSON.stringify({ error: "Unauthorized", message: "Invalid API key" });
}

interface MockServerOptions {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string | Buffer;
  delayMs?: number;
}

// Helper: Create a mock server
function createMockServer(options: MockServerOptions = {}): Server {
  const {
    statusCode = 200,
    headers = { "Content-Type": "application/zip" },
    body = createMinimalZipBuffer(),
    delayMs = 0,
  } = options;

  return createServer((req, res) => {
    // Log headers for test verification
    (req as NodeJS.EventEmitter & { receivedHeaders: Record<string, string> }).receivedHeaders = req.headers as Record<string, string>;

    setTimeout(() => {
      res.writeHead(statusCode, headers);
      if (body) {
        res.end(body);
      } else {
        res.end();
      }
    }, delayMs);
  });
}

describe("downloadGtfs", () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // Test 1: Successful download
  it("should download ZIP successfully", async () => {
    const server = createMockServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const result = await downloadGtfs({
        url: `http://localhost:${port}/gtfs`,
        apiToken: "test-token-123",
        outputDirectory: TEST_DIR,
      });

      expect(result.fileName).toMatch(/^tfnsw-complete-gtfs-\d{8}T\d{6}Z-[a-f0-9]{12}\.zip$/);
      expect(result.sha256).toHaveLength(64);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.downloadedAt).toBeDefined();
      expect(result.contentType).toBe("application/zip");
      expect(result.filePath.replace(/\\/g, "/")).toContain(normalize(TEST_DIR).replace(/\\/g, "/"));
    } finally {
      server.close();
    }
  });

  // Test 2: Correct Authorization header is sent
  it("should send correct Authorization header", async () => {
    let receivedHeaders: Record<string, string> = {};
    const server = createServer((req, res) => {
      receivedHeaders = req.headers as Record<string, string>;
      res.writeHead(200, { "Content-Type": "application/zip" });
      res.end(createMinimalZipBuffer());
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await downloadGtfs({
        url: `http://localhost:${port}/gtfs`,
        apiToken: "my-secret-token",
        outputDirectory: TEST_DIR,
      });

      expect(receivedHeaders["authorization"]).toBe("apikey my-secret-token");
      expect(receivedHeaders["accept"]).toBe("application/zip");
    } finally {
      server.close();
    }
  });

  // Test 3: Missing token should fail
  it("should fail when token is missing", async () => {
    await expect(
      downloadGtfs({
        url: "https://api.example.com/gtfs",
        apiToken: "",
        outputDirectory: TEST_DIR,
      })
    ).rejects.toThrow("Missing API token");

    await expect(
      downloadGtfs({
        url: "https://api.example.com/gtfs",
        apiToken: "   ",
        outputDirectory: TEST_DIR,
      })
    ).rejects.toThrow("Missing API token");
  });

  // Test 4: HTTP 401 should fail with specific error
  it("should fail with UnauthorizedError on HTTP 401", async () => {
    const server = createMockServer({
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: createJsonErrorResponse(),
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await expect(
        downloadGtfs({
          url: `http://localhost:${port}/gtfs`,
          apiToken: "invalid-token",
          outputDirectory: TEST_DIR,
        })
      ).rejects.toThrow("401 Unauthorized");
    } finally {
      server.close();
    }
  });

  // Test 5: HTTP 500 should fail
  it("should fail with HttpError on HTTP 500", async () => {
    const server = createMockServer({
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      body: "Internal Server Error",
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await expect(
        downloadGtfs({
          url: `http://localhost:${port}/gtfs`,
          apiToken: "test-token",
          outputDirectory: TEST_DIR,
        })
      ).rejects.toThrow("500");
    } finally {
      server.close();
    }
  });

  // Test 6: HTML response should fail
  it("should fail when response body is HTML", async () => {
    const server = createMockServer({
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: createHtmlResponse(),
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await expect(
        downloadGtfs({
          url: `http://localhost:${port}/gtfs`,
          apiToken: "test-token",
          outputDirectory: TEST_DIR,
        })
      ).rejects.toThrow("not a valid ZIP file");
    } finally {
      server.close();
    }
  });

  // Test 7: JSON error response should fail
  it("should fail when response body is JSON error", async () => {
    const server = createMockServer({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: createJsonErrorResponse(),
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await expect(
        downloadGtfs({
          url: `http://localhost:${port}/gtfs`,
          apiToken: "test-token",
          outputDirectory: TEST_DIR,
        })
      ).rejects.toThrow("not a valid ZIP file");
    } finally {
      server.close();
    }
  });

  // Test 8: Non-ZIP signature should fail
  it("should fail when response does not have ZIP signature", async () => {
    const invalidZip = Buffer.from("This is not a ZIP file content");
    const server = createMockServer({
      statusCode: 200,
      headers: { "Content-Type": "application/zip" },
      body: invalidZip,
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await expect(
        downloadGtfs({
          url: `http://localhost:${port}/gtfs`,
          apiToken: "test-token",
          outputDirectory: TEST_DIR,
        })
      ).rejects.toThrow("not a valid ZIP file");
    } finally {
      server.close();
    }
  });

  // Test 9: Timeout should fail
  it("should fail on timeout", async () => {
    const server = createServer((req, res) => {
      // Never respond - simulates timeout
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await expect(
        downloadGtfs({
          url: `http://localhost:${port}/gtfs`,
          apiToken: "test-token",
          outputDirectory: TEST_DIR,
          timeoutMs: 500,
        })
      ).rejects.toThrow("timed out");
    } finally {
      server.close();
    }
  });

  // Test 10: Part file should be cleaned up on failure
  it("should delete .part file on download failure", async () => {
    const invalidZip = Buffer.from("Not a valid ZIP");
    const server = createMockServer({
      statusCode: 200,
      headers: { "Content-Type": "application/zip" },
      body: invalidZip,
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      await expect(
        downloadGtfs({
          url: `http://localhost:${port}/gtfs`,
          apiToken: "test-token",
          outputDirectory: TEST_DIR,
        })
      ).rejects.toThrow();

      // Check no .part files exist
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(TEST_DIR);
      const partFiles = files.filter((f) => f.endsWith(".part"));
      expect(partFiles).toHaveLength(0);
    } finally {
      server.close();
    }
  });

  // Test 11: Filename includes timestamp and hash
  it("should include timestamp and hash in filename", async () => {
    const server = createMockServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const result = await downloadGtfs({
        url: `http://localhost:${port}/gtfs`,
        apiToken: "test-token",
        outputDirectory: TEST_DIR,
      });

      // Filename should match pattern: tfnsw-complete-gtfs-YYYYMMDDTHHmmssZ-<hash12>.zip
      expect(result.fileName).toMatch(
        /^tfnsw-complete-gtfs-\d{8}T\d{6}Z-[a-f0-9]{12}\.zip$/
      );
      // Hash in filename should match actual SHA-256 prefix
      const hashInFilename = result.fileName.match(/([a-f0-9]{12})\.zip$/)?.[1];
      expect(hashInFilename).toBe(result.sha256.slice(0, 12));
    } finally {
      server.close();
    }
  });

  // Test 12: Return correct size and SHA-256
  it("should return correct size and SHA-256", async () => {
    const zipContent = createMinimalZipBuffer();
    const server = createMockServer({
      body: zipContent,
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const result = await downloadGtfs({
        url: `http://localhost:${port}/gtfs`,
        apiToken: "test-token",
        outputDirectory: TEST_DIR,
      });

      expect(result.sizeBytes).toBe(zipContent.length);
      expect(result.sha256).toBeDefined();
      expect(result.sha256).toHaveLength(64);
    } finally {
      server.close();
    }
  });

  // Test 13: Should not overwrite previous successful downloads
  it("should not overwrite previous downloads", async () => {
    const server = createMockServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const result1 = await downloadGtfs({
        url: `http://localhost:${port}/gtfs`,
        apiToken: "test-token",
        outputDirectory: TEST_DIR,
      });

      // Wait a moment to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result2 = await downloadGtfs({
        url: `http://localhost:${port}/gtfs`,
        apiToken: "test-token",
        outputDirectory: TEST_DIR,
      });

      expect(result1.fileName).not.toBe(result2.fileName);

      // Both files should exist
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(TEST_DIR);
      expect(files.filter((f) => f.endsWith(".zip"))).toHaveLength(2);
    } finally {
      server.close();
    }
  });
});
