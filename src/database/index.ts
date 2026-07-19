/**
 * Database module exports.
 */

export { getDatabasePool, closeDatabasePool } from "./pool.js";
export { runMigrations, REQUIRED_TABLES, type MigrationResult } from "./migrations.js";