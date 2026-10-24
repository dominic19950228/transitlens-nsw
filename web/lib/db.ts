/**
 * Server-only database module for TransitLens NSW web app.
 * Uses mysql2/promise with a lazy shared connection pool.
 * Protected by `server-only` import guard.
 */
import "server-only";

import mysql from "mysql2/promise";
import { parseDbEnv } from "./env";

export class NoActiveFeedError extends Error {
  readonly statusCode = 503;
  readonly errorCode = "NO_ACTIVE_FEED";

  constructor() {
    super("No active GTFS feed is available.");
    this.name = "NoActiveFeedError";
  }
}
function getConfig() {
  // Zod-validated and typed; throws a single descriptive error when invalid.
  return parseDbEnv();
}

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    const cfg = getConfig();
    pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
      connectionLimit: cfg.connectionLimit,
      supportBigNumbers: true,
    });
  }
  return pool;
}

/**
 * Execute a query and return the result rows.
 * Params are passed separately to prevent SQL injection.
 */
export async function query<T extends mysql.RowDataPacket[]>(
  sql: string,
  params: (string | number | boolean | null | Date)[] = []
): Promise<T> {
  const p = getPool();
  const [rows] = await p.execute<T>(sql, params);
  return rows;
}

/**
 * Get a dedicated connection from the pool (for transactions).
 */
export async function getConnection(): Promise<mysql.PoolConnection> {
  const p = getPool();
  return p.getConnection();
}

/**
 * Resolve the active feed ID.
 * Returns null if no active/completed feed exists.
 */
export async function resolveActiveFeedId(): Promise<number | null> {
  const rows = await query<mysql.RowDataPacket[]>(
    `SELECT id
     FROM gtfs_feed_imports
     WHERE status = 'completed'
       AND is_active = 1
     ORDER BY completed_at DESC
     LIMIT 1`
  );
  return rows.length > 0 ? Number(rows[0].id) : null;
}

/**
 * Ensure an active feed exists, throwing a standardised 503 error if not.
 */
export async function requireActiveFeedId(): Promise<number> {
  const id = await resolveActiveFeedId();
  if (id === null) {
    throw new NoActiveFeedError();
  }
  return id;
}

/**
 * Close the pool (used in tests or graceful shutdown).
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}