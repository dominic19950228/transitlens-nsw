/**
 * Database connection pool module.
 * Lazy initialization for mysql2/promise.
 */

import mysql, { type Pool } from "mysql2/promise";
import { getDatabaseConfig } from "../config/env.js";

let pool: Pool | null = null;

/**
 * Get the database connection pool.
 * Creates the pool lazily on first call.
 * Reuses the same pool on subsequent calls.
 */
export function getDatabasePool(): Pool {
    if (!pool) {
        const config = getDatabaseConfig();
        pool = mysql.createPool({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
            connectionLimit: config.connectionLimit,
            waitForConnections: true,
            queueLimit: 0,
            charset: "utf8mb4",
        });
    }
    return pool;
}

/**
 * Close the database connection pool.
 * Safe to call even if no pool was created.
 * After closing, a later getDatabasePool() call may create a new pool.
 */
export async function closeDatabasePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}