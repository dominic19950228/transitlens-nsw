#!/usr/bin/env npx ts-node

/**
 * GTFS Nullability Analysis Script
 *
 * Streams CSV files to count blank/missing values in nullable columns.
 * Does not load complete files into memory.
 *
 * Usage: npx ts-node scripts/analyse-gtfs-nullability.ts <extracted-gtfs-dir>
 */

import { createReadStream, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";

interface CsvStats {
    totalRows: number;
    blankCounts: Map<string, number>;
}

function countBlanksInCsv(filePath: string, targetColumns: string[]): Promise<CsvStats> {
    return new Promise((resolve, reject) => {
        const stats: CsvStats = {
            totalRows: 0,
            blankCounts: new Map(),
        };

        // Initialize blank counts for all target columns
        for (const col of targetColumns) {
            stats.blankCounts.set(col, 0);
        }

        let headers: string[] = [];
        let targetIndices: number[] = [];
        let recordIndex = 0;

        const parser = createReadStream(filePath)
            .pipe(
                parse({
                    columns: false,
                    skip_empty_lines: true,
                    trim: true,
                })
            )
            .on("headers", (h: string[]) => {
                headers = h;
                targetIndices = targetColumns.map((col) => headers.indexOf(col));
            })
            .on("data", (record: string[]) => {
                recordIndex++;
                stats.totalRows = recordIndex;

                for (let i = 0; i < targetIndices.length; i++) {
                    const idx = targetIndices[i];
                    if (idx >= 0 && idx < record.length) {
                        const value = record[idx] ?? "";
                        if (value.trim() === "") {
                            const current = stats.blankCounts.get(targetColumns[i]) ?? 0;
                            stats.blankCounts.set(targetColumns[i], current + 1);
                        }
                    }
                }
            })
            .on("end", () => {
                resolve(stats);
            })
            .on("error", reject);
    });
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error("Usage: npx ts-node scripts/analyse-gtfs-nullability.ts <extracted-gtfs-dir>");
        process.exit(1);
    }

    const baseDir = args[0];

    console.log("=".repeat(60));
    console.log("GTFS Nullable Column Analysis");
    console.log("=".repeat(60));
    console.log(`Base directory: ${baseDir}`);
    console.log("");

    // Analyze stops.txt
    const stopsPath = join(baseDir, "stops.txt");
    try {
        const fileStats = statSync(stopsPath);
        console.log(`File: stops.txt (${(fileStats.size / 1024).toFixed(2)} KB)`);
    } catch {
        console.log("File: stops.txt [NOT FOUND]");
    }

    let stopsStats: CsvStats | null = null;
    try {
        stopsStats = await countBlanksInCsv(stopsPath, ["stop_lat", "stop_lon"]);
        console.log(`  Total rows: ${stopsStats.totalRows}`);
        console.log(`  stop_lat blank count: ${stopsStats.blankCounts.get("stop_lat") ?? 0}`);
        console.log(`  stop_lon blank count: ${stopsStats.blankCounts.get("stop_lon") ?? 0}`);
    } catch (err) {
        console.log(`  Error: ${err}`);
    }
    console.log("");

    // Analyze stop_times.txt
    const stopTimesPath = join(baseDir, "stop_times.txt");
    try {
        const fileStats = statSync(stopTimesPath);
        console.log(`File: stop_times.txt (${(fileStats.size / 1024).toFixed(2)} KB)`);
    } catch {
        console.log("File: stop_times.txt [NOT FOUND]");
    }

    let stopTimesStats: CsvStats | null = null;
    try {
        stopTimesStats = await countBlanksInCsv(stopTimesPath, ["arrival_time", "departure_time"]);
        console.log(`  Total rows: ${stopTimesStats.totalRows}`);
        console.log(`  arrival_time blank count: ${stopTimesStats.blankCounts.get("arrival_time") ?? 0}`);
        console.log(`  departure_time blank count: ${stopTimesStats.blankCounts.get("departure_time") ?? 0}`);
    } catch (err) {
        console.log(`  Error: ${err}`);
    }
    console.log("");

    // Summary
    console.log("=".repeat(60));
    console.log("JUSTIFICATION SUMMARY");
    console.log("=".repeat(60));
    console.log("");

    console.log("stop_lat, stop_lon:");
    console.log("  Nullable because: GTFS specification allows empty values for");
    console.log("  virtual/clustered stops and platform locations without coordinates.");
    const latBlanks = stopsStats?.blankCounts.get("stop_lat") ?? 0;
    if (latBlanks > 0) {
        console.log(`  Evidence: ${latBlanks} blank values in this feed (${((latBlanks / (stopsStats?.totalRows || 1)) * 100).toFixed(2)}%)`);
    } else {
        console.log(`  Evidence: ${latBlanks} blank values in this feed (GTFS semantics allow blanks)`);
    }
    console.log("");

    console.log("arrival_time, departure_time:");
    console.log("  Nullable because: GTFS allows omit times for interpolated stops.");
    const arrBlanks = stopTimesStats?.blankCounts.get("arrival_time") ?? 0;
    if (arrBlanks > 0) {
        console.log(`  Evidence: ${arrBlanks} blank values in this feed (${((arrBlanks / (stopTimesStats?.totalRows || 1)) * 100).toFixed(2)}%)`);
    } else {
        console.log(`  Evidence: ${arrBlanks} blank values in this feed (GTFS semantics allow blanks)`);
    }
}

main().catch(console.error);