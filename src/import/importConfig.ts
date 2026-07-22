/**
 * Runtime import configuration.
 */

export interface ImportConfig {
    insertBatchSize: number;
}

const DEFAULT_INSERT_BATCH_SIZE = 1000;

export function getImportConfig(): ImportConfig {
    const value = process.env.GTFS_IMPORT_BATCH_SIZE;
    if (value === undefined || value === "") {
        return { insertBatchSize: DEFAULT_INSERT_BATCH_SIZE };
    }
    const parsed = Number(value);
    if (Number.isNaN(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`GTFS_IMPORT_BATCH_SIZE must be a positive integer: ${value}`);
    }
    return { insertBatchSize: parsed };
}