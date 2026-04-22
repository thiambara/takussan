/**
 * Canonical response envelopes emitted by the Takussan Laravel API.
 *
 * The backend consistently returns `{ data, meta, links }` for paginated
 * collections (via `spatie/laravel-query-builder`) and `{ data, message? }`
 * for single-resource responses. Error responses follow Laravel's default
 * `{ message, errors? }` shape.
 *
 * Keep these in sync with the API envelope — see `takussan-api` resources
 * and `docs/spatie-query-builder.md`.
 */

export type PaginationMeta = {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from?: number | null;
  to?: number | null;
};

export type PaginationLinks = {
  first: string | null;
  last: string | null;
  prev: string | null;
  next: string | null;
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: PaginationMeta;
  links: PaginationLinks;
};

export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type ApiErrorBody = {
  message: string;
  errors?: Record<string, string[]>;
};

/**
 * Query parameters honored by the backend via `spatie/laravel-query-builder`.
 * Callers of {@link buildQueryString} should prefer this shape over raw
 * strings so we keep using `fields[table]`, `filter[]`, `include=`, `sort=`
 * and never fetch-all / filter client-side.
 *
 * See CLAUDE.md → "API — Conventions frontend" and
 * `docs/spatie-query-builder.md`.
 */
export type SpatieQueryParams = {
  /** Sparse fieldsets — `fields[properties]=id,title`. Always provide. */
  fields?: Record<string, string | readonly string[]>;
  /** Filters — `filter[status]=active`, `filter[price_min]=50000`, ... */
  filter?: Record<string, string | number | boolean | readonly (string | number)[] | null | undefined>;
  /** Eager-loaded relations — `include=address,owner` or counts. */
  include?: string | readonly string[];
  /** Sort spec — `sort=-created_at`. Prefix with `-` for descending. */
  sort?: string | readonly string[];
  page?: number;
  per_page?: number;
  /** Escape hatch for any other query params (search boxes, etc.). */
  extra?: Record<string, string | number | boolean | null | undefined>;
};
