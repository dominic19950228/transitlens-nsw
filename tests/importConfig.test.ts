/**
 * Tests for getImportConfig()
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getImportConfig } from "../src/import/importConfig.js";

const ORIGINAL_ENV = process.env.GTFS_IMPORT_BATCH_SIZE;

describe("getImportConfig", () => {
    beforeEach(() => {
        // Clean slate for each test
        delete process.env.GTFS_IMPORT_BATCH_SIZE;
    });

    afterEach(() => {
        // Restore original state
        if (ORIGINAL_ENV !== undefined) {
            process.env.GTFS_IMPORT_BATCH_SIZE = ORIGINAL_ENV;
        } else {
            delete process.env.GTFS_IMPORT_BATCH_SIZE;
        }
    });

    it("returns default 1000 when variable is absent", () => {
        delete process.env.GTFS_IMPORT_BATCH_SIZE;
        const config = getImportConfig();
        expect(config.insertBatchSize).toBe(1000);
    });

    it("returns default 1000 when variable is empty string", () => {
        process.env.GTFS_IMPORT_BATCH_SIZE = "";
        const config = getImportConfig();
        expect(config.insertBatchSize).toBe(1000);
    });

    it("throws error when value is zero", () => {
        process.env.GTFS_IMPORT_BATCH_SIZE = "0";
        expect(() => getImportConfig()).toThrow("GTFS_IMPORT_BATCH_SIZE must be a positive integer: 0");
    });

    it("throws error when value is negative", () => {
        process.env.GTFS_IMPORT_BATCH_SIZE = "-100";
        expect(() => getImportConfig()).toThrow("GTFS_IMPORT_BATCH_SIZE must be a positive integer: -100");
    });

    it("throws error when value is a decimal", () => {
        process.env.GTFS_IMPORT_BATCH_SIZE = "500.5";
        expect(() => getImportConfig()).toThrow("GTFS_IMPORT_BATCH_SIZE must be a positive integer: 500.5");
    });

    it("throws error when value is non-numeric", () => {
        process.env.GTFS_IMPORT_BATCH_SIZE = "abc";
        expect(() => getImportConfig()).toThrow("GTFS_IMPORT_BATCH_SIZE must be a positive integer: abc");
    });

    it("accepts a positive integer", () => {
        process.env.GTFS_IMPORT_BATCH_SIZE = "500";
        const config = getImportConfig();
        expect(config.insertBatchSize).toBe(500);
    });
});