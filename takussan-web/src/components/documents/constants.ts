import type { DocumentType, DocumentableType } from '@/types/document';

/**
 * ⚠ Les LIBELLÉS ont quitté ce module (TCK-292, lot I). Ils vivent sous
 * `documents.types.*` et `documents.entities.*` dans `src/messages/{fr,en,wo}.json`.
 *
 * Ce module ne porte plus que l'ORDRE d'affichage — patron « la donnée transporte la clé,
 * le rendu la résout », posé par TCK-286. Les valeurs de l'enum SONT les clés : un nouveau
 * cas backend se voit donc immédiatement, la clé manquante rendant son propre nom.
 */

/** Ordre d'affichage du sélecteur de catégorie et du regroupement de la bibliothèque. */
export const DOCUMENT_TYPE_ORDER: readonly DocumentType[] = [
  'lease_contract',
  'invoice',
  'receipt',
  'id_card',
  'passport',
  'insurance',
  'inventory_report',
  'photo',
  'other',
];

/**
 * Entités proposées au FILTRE de la bibliothèque. `user` en est délibérément absent :
 * on ne filtre pas la bibliothèque sur les pièces d'un utilisateur.
 */
export const DOCUMENTABLE_FILTER_ORDER: readonly DocumentableType[] = [
  'property',
  'lease',
  'booking',
  'customer',
  'inventory',
  'agency',
];

/** Entités proposées au TÉLÉVERSEMENT — les mêmes, plus `user`. */
export const DOCUMENTABLE_UPLOAD_ORDER: readonly DocumentableType[] = [
  ...DOCUMENTABLE_FILTER_ORDER,
  'user',
];

/**
 * Laravel returns the FQCN for `documentable_type` (e.g. `App\\Models\\Lease`).
 * Map it back to the short alias for display + filter forms.
 */
export function resolveDocumentableAlias(
  fqcn: string | null | undefined,
): DocumentableType | null {
  if (!fqcn) return null;
  const lower = fqcn.toLowerCase();
  if (lower.endsWith('\\property') || lower === 'property') return 'property';
  if (lower.endsWith('\\lease') || lower === 'lease') return 'lease';
  if (lower.endsWith('\\booking') || lower === 'booking') return 'booking';
  if (lower.endsWith('\\customer') || lower === 'customer') return 'customer';
  if (lower.endsWith('\\user') || lower === 'user') return 'user';
  if (lower.endsWith('\\agency') || lower === 'agency') return 'agency';
  if (lower.endsWith('\\inventory') || lower === 'inventory') return 'inventory';
  return null;
}

/**
 * Entity detail pages we link to from a document card. Returns `null` when
 * the documentable type is exposed as a plain value with no dashboard page.
 */
export function resolveDocumentableHref(
  alias: DocumentableType | null,
  id: number,
): string | null {
  switch (alias) {
    case 'property':
      return `/app/properties/${id}`;
    case 'lease':
      return `/app/leases/${id}`;
    case 'booking':
      return `/app/bookings/${id}`;
    case 'customer':
      return `/app/customers/${id}`;
    default:
      return null;
  }
}
