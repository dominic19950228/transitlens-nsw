/**
 * Tests for readFeedManifest() using temporary directories.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFeedManifest } from "../src/import/importRepository.js";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("readFeedManifest", () => {
    let tempDir: string;

    beforeEach(async () => {
        // Create a unique temp directory for each test
        const dirName = `manifest-test-${Date.now()}-${Math.random()}`;
        const created = await mkdir(join(tmpdir(), dirName), { recursive: true });
        tempDir = created ?? join(tmpdir(), dirName);
    });

    afterEach(async () => {
        // Clean up temp directory
        try {
            await rm(tempDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    it("returns null when manifest file is missing", async () => {
        const result = await readFeedManifest(tempDir);
        expect(result).toBeNull();
    });

    it("returns manifest with sourceZip.sha256 when valid", async () => {
        const manifest = {
            schemaVersion: 1,
            generatedAt: "2026-07-19T12:00:00Z",
            sourceZip: {
                sha256: "abc123def456",
                sizeBytes: 12345678,
            },
            files: [
                { name: "agency.txt", records: 1, sizeBytes: 100 },
            ],
        };

        await writeFile(join(tempDir, "feed-manifest.json"), JSON.stringify(manifest));
        const result = await readFeedManifest(tempDir);

        expect(result).not.toBeNull();
        expect(result?.sourceZip?.sha256).toBe("abc123def456");
    });

    it("parses valid manifest without sourceZip hash", async () => {
        const manifest = {
            schemaVersion: 1,
            generatedAt: "2026-07-19T12:00:00Z",
            files: [
                { name: "agency.txt", records: 1, sizeBytes: 100 },
            ],
        };

        await writeFile(join(tempDir, "feed-manifest.json"), JSON.stringify(manifest));
        const result = await readFeedManifest(tempDir);

        expect(result).not.toBeNull();
        expect(result?.schemaVersion).toBe(1);
        expect(result?.files).toHaveLength(1);
    });

    it("throws 'Malformed feed manifest' when JSON is invalid", async () => {
        await writeFile(join(tempDir, "feed-manifest.json"), "{ invalid json {{{");

        await expect(readFeedManifest(tempDir)).rejects.toThrow("Malformed feed manifest");
    });

    it("throws 'Failed to read feed manifest' when read fails non-ENOENT", async () => {
        // Reset modules and mock readFile to simulate a permission-denied error
        vi.resetModules();
        
        const mockReadFile = vi.fn().mockImplementation(async () => {
            const error = new Error("permission denied") as NodeJS.ErrnoException;
            error.code = "EACCES";
            throw error;
        });
        
        vi.doMock("node:fs/promises", () => ({
            readFile: mockReadFile,
        }));
        vi.doMock("node:path", () => ({
            join: (...args: string[]) => args.join("/"),
        }));
        
        const { readFeedManifest } = await import("../src/import/importRepository.js");
        
        await expect(readFeedManifest("/some/path")).rejects.toThrow("Failed to read feed manifest");
    });
});