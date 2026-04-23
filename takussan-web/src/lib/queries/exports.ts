/**
 * Client-side helpers for triggering CSV/XLSX/PDF downloads (TCK-032 P2).
 *
 * Downloads route through the Next.js proxy at `/api/export/[entity]`, which
 * reads the httpOnly `auth_token` cookie server-side and forwards a bearer
 * token to the Laravel endpoint. This keeps the token out of client JS and
 * works regardless of whether the API is same-origin.
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

export function buildExportUrl(options: ExportOptions): string {
  const qs = new URLSearchParams();
  qs.set('format', options.format);
  if (options.from) qs.set('from', options.from);
  if (options.to) qs.set('to', options.to);
  if (options.limit) qs.set('limit', String(options.limit));
  return `/api/export/${options.entity}?${qs.toString()}`;
}
