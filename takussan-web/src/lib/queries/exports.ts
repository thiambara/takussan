import { cheminApi } from '@/lib/chemin-api';

/**
 * Client-side helpers for triggering CSV/XLSX/PDF downloads (TCK-032 P2).
 *
 * Downloads route through the Next.js proxy at `/api/export/[entity]`, which
 * reads the httpOnly `auth_token` cookie server-side and forwards a bearer
 * token to the Laravel endpoint. This keeps the token out of client JS and
 * works regardless of whether the API is same-origin.
 */

export type ExportEntity =
  | 'payments'
  | 'leases'
  | 'customers'
  | 'properties'
  // TCK-595 (§7) — les exports financiers de l'agence, au personnel qui tient `reports.export`.
  | 'payouts'
  | 'invoices'
  | 'commissions'
  | 'aging'
  | 'deposits';
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

/**
 * TCK-1306 (piste P112.01) — les plafonds de lignes que l'API applique à un export sans `limit`,
 * que ce formulaire n'envoie jamais : `ExportDataService::DEFAULT_ROWS` et `MAX_ROWS_PDF`. Recopiés
 * pour être dits à l'écran ; ils changent avec eux.
 */
export const PLAFOND_LIGNES_EXPORT = 5000;
export const PLAFOND_LIGNES_EXPORT_PDF = 200;

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
  return cheminApi`/api/export/${options.entity}?${qs.toString()}`;
}
