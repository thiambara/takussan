import type { DocumentType, DocumentableType } from '@/types/document';

/**
 * Stable display labels for each document `type` enum. Mirrors the backend
 * `DocumentType` cases (TCK-021). Centralised here so the list page, the
 * upload form and any future fiche can share them.
 */
export const DOCUMENT_TYPE_LABEL: Record<DocumentType, string> = {
  id_card: "Pièce d'identité",
  passport: 'Passeport',
  lease_contract: 'Contrat de bail',
  receipt: 'Reçu',
  invoice: 'Facture',
  insurance: 'Assurance',
  inventory_report: "État des lieux",
  photo: 'Photo',
  other: 'Autre',
};

export const DOCUMENT_TYPE_OPTIONS: readonly {
  value: DocumentType;
  label: string;
}[] = [
  { value: 'lease_contract', label: DOCUMENT_TYPE_LABEL.lease_contract },
  { value: 'invoice', label: DOCUMENT_TYPE_LABEL.invoice },
  { value: 'receipt', label: DOCUMENT_TYPE_LABEL.receipt },
  { value: 'id_card', label: DOCUMENT_TYPE_LABEL.id_card },
  { value: 'passport', label: DOCUMENT_TYPE_LABEL.passport },
  { value: 'insurance', label: DOCUMENT_TYPE_LABEL.insurance },
  { value: 'inventory_report', label: DOCUMENT_TYPE_LABEL.inventory_report },
  { value: 'photo', label: DOCUMENT_TYPE_LABEL.photo },
  { value: 'other', label: DOCUMENT_TYPE_LABEL.other },
];

export const DOCUMENTABLE_TYPE_LABEL: Record<DocumentableType, string> = {
  property: 'Bien',
  lease: 'Bail',
  booking: 'Réservation',
  customer: 'Client',
  user: 'Utilisateur',
  agency: 'Agence',
  inventory: 'État des lieux',
};

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
