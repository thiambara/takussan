import type { SpatieQueryParams } from '@/types/api';

// Base URL without /api suffix — used by apiRequest (which includes /api in its paths)
const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

// API base with /api suffix — used by apiFetch
const API_BASE = `${API_URL}/api`;
const SUPPORTED_LOCALES = new Set(['fr', 'en', 'wo']);

function clientLocaleCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;

  const cookie = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith('NEXT_LOCALE='));
  const locale = cookie ? decodeURIComponent(cookie.split('=')[1] ?? '') : '';

  return SUPPORTED_LOCALES.has(locale) ? locale : undefined;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Accept': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
  formData?: boolean;
  /**
   * Locale to forward to the backend via `Accept-Language` for localized
   * responses (error messages, mail templates, etc.). Optional — the backend
   * falls back to its default when absent.
   */
  locale?: string;
  signal?: AbortSignal;
  /**
   * Active profile composite id (e.g. `agent:5`) forwarded as `X-Profile-Id`
   * so the backend resolves the spatie team scope without relying on a
   * browser-bound cookie. Set by SSR fetchers — see TCK-141 / TCK-143.
   */
  activeProfileId?: string;
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
  ) {
    super(`API error ${status}`);
  }

  /**
   * Convenience — returns the server-provided message when available,
   * otherwise a generic fallback. Useful for toasts.
   */
  get displayMessage(): string {
    if (this.data && typeof this.data === 'object' && 'message' in this.data) {
      const raw = (this.data as { message?: unknown }).message;
      if (typeof raw === 'string' && raw.length > 0) return raw;
    }
    return `API error ${this.status}`;
  }

  /**
   * Typed access to Laravel-style validation errors (`status === 422`).
   */
  get validationErrors(): Record<string, string[]> | undefined {
    if (
      this.status === 422 &&
      this.data &&
      typeof this.data === 'object' &&
      'errors' in this.data
    ) {
      const raw = (this.data as { errors?: unknown }).errors;
      if (raw && typeof raw === 'object') return raw as Record<string, string[]>;
    }
    return undefined;
  }
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, token, headers = {}, formData = false, locale, signal, activeProfileId }: RequestOptions = {},
): Promise<T> {
  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };

  if (!formData) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (token) {
    requestHeaders['Authorization'] = `Bearer ${token}`;
  }

  const requestLocale = clientLocaleCookie() ?? locale;
  if (requestLocale && !requestHeaders['Accept-Language']) {
    requestHeaders['Accept-Language'] = requestLocale;
  }

  if (activeProfileId && !requestHeaders['X-Profile-Id']) {
    requestHeaders['X-Profile-Id'] = activeProfileId;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined
      ? formData ? (body as BodyInit) : JSON.stringify(body)
      : undefined,
    signal,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data as T;
}

/**
 * Serialize spatie/laravel-query-builder params. Prefer this over manual
 * `URLSearchParams` so every caller gets the canonical shape:
 *
 *   ?filter[status]=active&include=owner&fields[properties]=id,title&sort=-created_at
 *
 * See CLAUDE.md → "API — Conventions frontend" and
 * `docs/spatie-query-builder.md`.
 */
export function buildQueryString(params: SpatieQueryParams): string {
  const qs = new URLSearchParams();

  if (params.fields) {
    for (const [table, cols] of Object.entries(params.fields)) {
      const value: string = Array.isArray(cols)
        ? (cols as readonly string[]).join(',')
        : (cols as string);
      if (value) qs.set(`fields[${table}]`, value);
    }
  }

  if (params.filter) {
    for (const [key, value] of Object.entries(params.filter)) {
      if (value === null || value === undefined || value === '') continue;
      if (Array.isArray(value)) {
        qs.set(`filter[${key}]`, (value as readonly (string | number)[]).join(','));
      } else {
        qs.set(`filter[${key}]`, String(value));
      }
    }
  }

  if (params.include) {
    const value: string = Array.isArray(params.include)
      ? (params.include as readonly string[]).join(',')
      : (params.include as string);
    if (value) qs.set('include', value);
  }

  if (params.sort) {
    const value: string = Array.isArray(params.sort)
      ? (params.sort as readonly string[]).join(',')
      : (params.sort as string);
    if (value) qs.set('sort', value);
  }

  if (typeof params.page === 'number') qs.set('page', String(params.page));
  if (typeof params.per_page === 'number') qs.set('per_page', String(params.per_page));

  if (params.extra) {
    for (const [key, value] of Object.entries(params.extra)) {
      if (value === null || value === undefined || value === '') continue;
      qs.set(key, String(value));
    }
  }

  return qs.toString();
}
