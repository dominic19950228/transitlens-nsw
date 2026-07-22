/**
 * Find and return the latest completed GTFS extraction directory.
 * Searches for directories containing feed-manifest.json, excludes .part directories.
 * Only directories with valid JSON manifests are considered.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

interface ExtractionDirEntry {
    path: string;
    mtime: Date;
}

/**
 * Find all completed extraction directories in base directory.
 * A completed extraction has a valid feed-manifest.json file.
 * Excludes .part directories and non-directories.
 */
async function findExtractionDirectories(baseDir: string): Promise<ExtractionDirEntry[]> {
    const entries: ExtractionDirEntry[] = [];

    let items;
    try {
        items = await readdir(baseDir, { withFileTypes: true });
    } catch {
        // Directory doesn't exist or can't be read - throw a useful error
        throw new Error(`Cannot read extraction directory: ${baseDir}`);
    }

    for (const item of items) {
        // Skip .part directories (incomplete extractions)
        if (item.name.includes(".part")) {
            continue;
        }

        if (!item.isDirectory()) {
            continue;
        }

        const dirPath = join(baseDir, item.name);

        // Check for valid feed-manifest.json
        try {
            const content = await readFile(join(dirPath, "feed-manifest.json"), "utf-8");
            // Validate JSON
            JSON.parse(content);
        } catch {
            // Missing manifest or malformed JSON - skip
            continue;
        }

        const stats = await stat(dirPath);
        entries.push({ path: dirPath, mtime: stats.mtime });
    }

    return entries;
}

/**
 * Find and return the latest completed extraction directory.
 * @param baseDirectory - Base directory to search for extractions
 * @returns Directory path of the newest valid extraction
 * @throws Error if no completed extractions found
 */
export async function findLatestExtraction(
    baseDirectory: string
): Promise<string> {
    const directories = await findExtractionDirectories(baseDirectory);

    if (directories.length === 0) {
        throw new Error(`No completed extractions found in ${baseDirectory}`);
    }

    // Sort by modification time descending, pick newest
    directories.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    const latest = directories[0];

    return latest.path;
}