/**
 * Client-side helpers for triggering CSV/XLSX/PDF downloads (TCK-032 P2).
 *
 * The browser downloads the file directly: we build a link targeting the
 * Laravel export endpoint and attach the bearer token via a query param
 * fallback is not used here — Sanctum cookies are already set by the auth
 * flow on same-origin, so a straight `<a>` click yields the binary.
 *
 * If same-origin breaks (e.g. API on a different host), call the exported
 * `fetchExportBlob` to download via fetch + `URL.createObjectURL`.
 */

export type ExportEntity = 'payments' | 'leases' | 'customers' | 'properties';
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export type ExportOptions = {
  entity: ExportEntity;
  format: ExportFormat;
  from?: string; // YYYY-MM-DD
  to?: string;
  limit?: number;
};

function buildUrl(apiBase: string, options: ExportOptions): string {
  const url = new URL(`${apiBase}/api/export/${options.entity}`);
  url.searchParams.set('format', options.format);
  if (options.from) url.searchParams.set('from', options.from);
  if (options.to) url.searchParams.set('to', options.to);
  if (options.limit) url.searchParams.set('limit', String(options.limit));
  return url.toString();
}

export function buildExportUrl(options: ExportOptions): string {
  const apiBase = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002').replace(/\/api$/, '');
  return buildUrl(apiBase, options);
}

export async function fetchExportBlob(options: ExportOptions, token: string): Promise<Blob> {
  const url = buildExportUrl(options);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
  });
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status}`);
  }
  return res.blob();
}
