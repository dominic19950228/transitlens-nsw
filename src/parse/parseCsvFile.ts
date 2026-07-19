/**
 * Streaming CSV file parser using csv-parse.
 * Uses async iterator pattern for reliable backpressure.
 */

import { createReadStream } from "node:fs";
import { parse, type Options as CsvOptions } from "csv-parse";
import type { ParseIssue } from "./types.js";
import {
    validateHeaders,
    parsers,
    type ParseContext,
} from "./recordParsers.js";

export interface BatchResult<T> {
    records: readonly T[];
    issues: readonly ParseIssue[];
    processedRows: number;
    acceptedRows: number;
    rejectedRows: number;
    warningCount: number;
    errorCount: number;
}

export type BatchCallback<T> = (batch: BatchResult<T>) => void | Promise<void>;

/**
 * Parse a GTFS CSV file using streaming via csv-parse.
 * Uses async iterator for reliable backpressure.
 * Calls onBatch for each batch of records (immediately when batch is full,
 * and once more with remaining records at end).
 * Returns a promise that resolves when all batches have been delivered.
 */
export async function parseCsvFile<T>(
    filePath: string,
    fileName: string,
    batchSize: number,
    onBatch: BatchCallback<T>
): Promise<void> {
    const parserOptions: CsvOptions = {
        delimiter: ",",
        columns: true,
        skip_empty_lines: true,
        trim: false,
        relax_quotes: false,
        relax_column_count: true,
        bom: true,
        encoding: "utf-8",
        record_delimiter: ["\n", "\r\n"],
        escape: '"',
        quote: '"',
        skip_records_with_error: false,
    };

    // Create parser and connect to read stream
    const parser = parse(parserOptions);
    const readStream = createReadStream(filePath, { encoding: "utf-8" });
    readStream.pipe(parser);

    let headerRow = 0;
    let headersValid = false;

    const ctx: ParseContext = { fileName, row: 0 };

    // Current batch state
    let currentBatch: T[] = [];
    let currentIssues: ParseIssue[] = [];
    let batchProcessed = 0;
    let batchAccepted = 0;
    let batchRejected = 0;
    let batchWarnings = 0;
    let batchErrors = 0;

    // Track pending async operations for backpressure
    let pendingBatch: Promise<void> | null = null;

    async function flushBatch(): Promise<void> {
        if (currentBatch.length === 0 && currentIssues.length === 0 && batchProcessed === 0) {
            return;
        }

        // Copy current state
        const batchCopy = [...currentBatch];
        const issuesCopy = [...currentIssues];
        const processedCopy = batchProcessed;
        const acceptedCopy = batchAccepted;
        const rejectedCopy = batchRejected;
        const warningsCopy = batchWarnings;
        const errorsCopy = batchErrors;

        // Reset batch state
        currentBatch = [];
        currentIssues = [];
        batchProcessed = 0;
        batchAccepted = 0;
        batchRejected = 0;
        batchWarnings = 0;
        batchErrors = 0;

        // Await any previous batch to provide backpressure
        if (pendingBatch) {
            await pendingBatch;
        }

        // Deliver and track this batch
        const batchResult: BatchResult<T> = {
            records: batchCopy,
            issues: issuesCopy,
            processedRows: processedCopy,
            acceptedRows: acceptedCopy,
            rejectedRows: rejectedCopy,
            warningCount: warningsCopy,
            errorCount: errorsCopy,
        };

        const result = onBatch(batchResult);
        pendingBatch = result instanceof Promise ? result : Promise.resolve();
        await pendingBatch;
        pendingBatch = null;
    }

    try {
        // Process rows using async iterator
        for await (const row of parser) {
            ctx.row++;
            headerRow++;

            // Validate headers on first row
            if (!headersValid) {
                headersValid = true;
                const headers = Object.keys(row as Record<string, string>);
                const headerResult = validateHeaders(fileName, headers);
                if (!headerResult.valid) {
                    // Missing required headers - stop processing with error
                    throw new Error(`Missing required headers: ${headerResult.missing.join(", ")}`);
                }
            }

            batchProcessed++;

            // Get parser for this file type
            const rowParser = parsers[fileName];
            if (!rowParser) {
                // Unknown file type, skip
                continue;
            }

            // Parse and validate the row
            const result = rowParser(row as Record<string, string>, ctx);

            // Accumulate issues
            for (const issue of result.issues) {
                currentIssues.push(issue);
            }
            batchWarnings += result.warningCount;
            batchErrors += result.errorCount;

            // If valid, add to batch
            if (result.record !== null) {
                batchAccepted++;
                currentBatch.push(result.record as T);

                // Flush immediately when batch is full
                if (currentBatch.length >= batchSize) {
                    await flushBatch();
                }
            } else {
                batchRejected++;
            }
        }

        // Flush any remaining records at end
        await flushBatch();
    } catch (err) {
        // Handle stream errors
        if (err instanceof Error && !err.message.includes("Missing required headers")) {
            throw err;
        }
        // Re-throw header errors
        throw err;
    }
}