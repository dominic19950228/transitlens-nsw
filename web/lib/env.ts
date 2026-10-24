import { z } from "zod";

export const DEFAULT_CONNECTION_LIMIT = 5;
export const MAX_CONNECTION_LIMIT = 50;

/**
 * Database environment contract.
 * Parsed lazily (at pool creation) so `next build` never needs database
 * credentials, while a misconfigured deployment fails with one clear message.
 */
export const dbEnvSchema = z.object({
  DB_HOST: z.string().min(1, "DB_HOST must be set"),
  DB_PORT: z.coerce.number().int().min(1).max(65535),
  DB_USER: z.string().min(1, "DB_USER must be set"),
  DB_PASSWORD: z.string().default(""),
  DB_NAME: z.string().min(1, "DB_NAME must be set"),
  DB_CONNECTION_LIMIT: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CONNECTION_LIMIT)
    .default(DEFAULT_CONNECTION_LIMIT),
});

export interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}

export type EnvSource = Record<string, string | undefined>;

/** Validate process environment variables and return a typed pool config. */
export function parseDbEnv(env: EnvSource = process.env): DbConfig {
  const result = dbEnvSchema.safeParse({
    DB_HOST: env.DB_HOST,
    DB_PORT: env.DB_PORT,
    DB_USER: env.DB_USER,
    DB_PASSWORD: env.DB_PASSWORD,
    DB_NAME: env.DB_NAME,
    DB_CONNECTION_LIMIT: env.DB_CONNECTION_LIMIT,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid database environment configuration (${details})`);
  }

  const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_CONNECTION_LIMIT } = result.data;

  return {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    connectionLimit: DB_CONNECTION_LIMIT,
  };
}
