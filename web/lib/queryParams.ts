import { z } from "zod";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const MAX_SEARCH_LENGTH = 200;

/**
 * Shared query contract for paginated GTFS list endpoints.
 * Unknown/invalid values are rejected rather than silently coerced so that
 * clients get a deterministic 400 instead of unexpected page sizes.
 */
export const paginationQuerySchema = z.object({
  search: z.string().trim().max(MAX_SEARCH_LENGTH).default(""),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface QueryIssue {
  field: string;
  message: string;
}

/** Parse `search`, `limit` and `offset` from a request's search params. */
export function parsePaginationQuery(params: URLSearchParams) {
  return paginationQuerySchema.safeParse({
    search: params.get("search") ?? undefined,
    limit: params.get("limit") ?? undefined,
    offset: params.get("offset") ?? undefined,
  });
}

/** Convert Zod issues into a small JSON-friendly payload for API responses. */
export function formatQueryIssues(error: z.ZodError): QueryIssue[] {
  return error.issues.map((issue) => ({
    field: issue.path.join(".") || "query",
    message: issue.message,
  }));
}
