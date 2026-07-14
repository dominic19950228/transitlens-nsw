/**
 * File hashing utilities for NSW Transit Platform
 */

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

/**
 * Calculate SHA-256 hash of a file using streaming.
 * Does not load the entire file into memory.
 */
export async function calculateFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    let streamError: Error | null = null;

    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });

    stream.on("error", (err) => {
      streamError = err;
      reject(new HashingError(`Failed to read file for hashing: ${err.message}`));
    });

    stream.on("end", () => {
      if (!streamError) {
        const digest = hash.digest("hex");
        resolve(digest);
      }
    });
  });
}

/**
 * Get file size in bytes.
 */
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await stat(filePath);
  return stats.size;
}

export class HashingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HashingError";
  }
}
