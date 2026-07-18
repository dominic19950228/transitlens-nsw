/**
 * CSV Parser Utility - Streaming, memory-efficient CSV parsing
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Transform } from "node:stream";

import { pipeline } from "node:stream/promises";

export interface CsvParseOptions {
  hasHeader?: boolean;
  skipEmptyLines?: boolean;
}

export interface CsvParseResult<T> {
  records: T[];
  rows: number;
  bytes: number;
  errors: CsvParseError[];
}

export interface CsvParseError {
  row: number;
  message: string;
}

/**
 * Parse a single CSV file from the extracted GTFS directory.
 * Uses readline + streaming to avoid loading entire file into memory.
 */
export async function parseCsvFile<T extends Record<string, string>>(
  filePath: string,
  options: CsvParseOptions = {}
): Promise<CsvParseResult<T>> {
  const { hasHeader = true, skipEmptyLines = true } = options;

  const bytes = (await stat(filePath)).size;
  const records: T[] = [];
  const errors: CsvParseError[] = [];

  if (bytes === 0) {
    return { records, rows: 0, bytes, errors };
  }

  const readStream = createReadStream(filePath);
  const rl = createInterface({ input: readStream, crlfDelay: Infinity });

  let headers: string[] = [];
  let rowNumber = 0;
  let headerProcessed = false;

  for await (const line of rl) {
    rowNumber++;

    // Process header
    if (hasHeader && !headerProcessed) {
      headers = parseRow(line);
      headerProcessed = true;
      continue;
    }

    // Skip empty lines
    if (skipEmptyLines && line.trim() === "") {
      rowNumber--;
      continue;
    }

    const values = parseRow(line);

    if (values.length === 0) {
      rowNumber--;
      continue;
    }

    if (headers.length === 0) {
      // No header - use numeric keys
      const record: Record<string, string> = {};
      values.forEach((v, i) => {
        record[`col_${i}`] = v;
      });
      records.push(record as T);
    } else if (values.length !== headers.length) {
      errors.push({
        row: rowNumber,
        message: `Column count mismatch: expected ${headers.length}, got ${values.length}`,
      });
      // Still push with available values (padded with empty strings)
      const record: Record<string, string> = {};
      headers.forEach((h, i) => {
        record[h] = values[i] ?? "";
      });
      records.push(record as T);
    } else {
      const record: Record<string, string> = {};
      headers.forEach((h, i) => {
        record[h] = values[i];
      });
      records.push(record as T);
    }
  }

  return {
    records,
    rows: records.length,
    bytes,
    errors,
  };
}

/**
 * Parse a CSV row handling quoted fields and commas.
 */
function parseRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let isInQuotedField = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (isInQuotedField) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          isInQuotedField = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"') {
        isInQuotedField = true;
        i++;
      } else if (char === ",") {
        fields.push(current.trim());
        current = "";
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  // Add the last field
  fields.push(current.trim());

  return fields;
}

/**
 * Parse a CSV string (for small files or testing).
 */
export function parseCsvString<T extends Record<string, string>>(
  content: string,
  options: CsvParseOptions = {}
): CsvParseResult<T> {
  const { hasHeader = true, skipEmptyLines = true } = options;

  const bytes = Buffer.byteLength(content, "utf8");
  const records: T[] = [];
  const errors: CsvParseError[] = [];

  if (!content.trim()) {
    return { records, rows: 0, bytes, errors };
  }

  const lines = content.split(/\r?\n/).filter((l) => !skipEmptyLines || l.trim() !== "");
  if (lines.length === 0) {
    return { records, rows: 0, bytes, errors };
  }

  const headers = hasHeader ? parseRow(lines[0]) : [];
  let rowNumber = 0;

  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    rowNumber++;
    const values = parseRow(lines[i]);

    if (headers.length === 0) {
      // No header - use numeric keys
      const record: Record<string, string> = {};
      values.forEach((v, idx) => {
        record[`col_${idx}`] = v;
      });
      records.push(record as T);
    } else if (values.length !== headers.length) {
      errors.push({
        row: rowNumber,
        message: `Column count mismatch: expected ${headers.length}, got ${values.length}`,
      });
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h] = values[idx] ?? "";
      });
      records.push(record as T);
    } else {
      const record: Record<string, string> = {};
      headers.forEach((h, idx) => {
        record[h] = values[idx];
      });
      records.push(record as T);
    }
  }

  return {
    records,
    rows: rowNumber,
    bytes,
    errors,
  };
}
