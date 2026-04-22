// Base URL without /api suffix — used by apiRequest (which includes /api in its paths)
const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

// API base with /api suffix — used by apiFetch
const API_BASE = `${API_URL}/api`;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Accept': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

type RequestOptions = {
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
};

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
  ) {
    super(`API error ${status}`);
  }
}

export async function apiRequest<T>(
  path: string,
  { method = 'GET', body, token, headers = {}, formData = false, locale }: RequestOptions = {},
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

  if (locale && !requestHeaders['Accept-Language']) {
    requestHeaders['Accept-Language'] = locale;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body !== undefined
      ? formData ? (body as BodyInit) : JSON.stringify(body)
      : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, data);
  }

  return data as T;
}
