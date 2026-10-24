import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_SEARCH_LENGTH,
  formatQueryIssues,
  parsePaginationQuery,
} from './queryParams';

describe('parsePaginationQuery', () => {
  it('applies defaults when no parameters are supplied', () => {
    const result = parsePaginationQuery(new URLSearchParams());

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ search: '', limit: DEFAULT_LIMIT, offset: 0 });
  });

  it('parses and trims valid parameters', () => {
    const result = parsePaginationQuery(
      new URLSearchParams({ search: '  central  ', limit: '20', offset: '40' })
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ search: 'central', limit: 20, offset: 40 });
  });

  it('accepts the maximum page size', () => {
    const result = parsePaginationQuery(new URLSearchParams({ limit: String(MAX_LIMIT) }));

    expect(result.success).toBe(true);
    expect(result.data?.limit).toBe(MAX_LIMIT);
  });

  it('rejects a page size above the maximum', () => {
    const result = parsePaginationQuery(new URLSearchParams({ limit: String(MAX_LIMIT + 1) }));

    expect(result.success).toBe(false);
    expect(formatQueryIssues(result.error!).map((issue) => issue.field)).toContain('limit');
  });

  it('rejects zero, negative and fractional page sizes', () => {
    for (const limit of ['0', '-5', '2.5', 'abc', '']) {
      const result = parsePaginationQuery(new URLSearchParams({ limit }));
      expect(result.success, `limit=${limit} should be rejected`).toBe(false);
    }
  });

  it('rejects negative and fractional offsets', () => {
    for (const offset of ['-1', '1.5', 'nope']) {
      const result = parsePaginationQuery(new URLSearchParams({ offset }));
      expect(result.success, `offset=${offset} should be rejected`).toBe(false);
    }
  });

  it('rejects an over-long search term', () => {
    const result = parsePaginationQuery(
      new URLSearchParams({ search: 'a'.repeat(MAX_SEARCH_LENGTH + 1) })
    );

    expect(result.success).toBe(false);
    expect(formatQueryIssues(result.error!)[0].field).toBe('search');
  });
});

describe('formatQueryIssues', () => {
  it('returns a field and message for each issue', () => {
    const result = parsePaginationQuery(new URLSearchParams({ limit: '999', offset: '-2' }));

    expect(result.success).toBe(false);
    const issues = formatQueryIssues(result.error!);

    expect(issues).toHaveLength(2);
    expect(issues.map((issue) => issue.field).sort()).toEqual(['limit', 'offset']);
    expect(issues.every((issue) => issue.message.length > 0)).toBe(true);
  });
});
