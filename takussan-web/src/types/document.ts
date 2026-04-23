/**
 * Document & share-link types aligned with the Laravel `DocumentResource`
 * and `DocumentShareLinkController` responses (TCK-021 backend, TCK-062
 * frontend).
 */

export type DocumentType =
  | 'id_card'
  | 'passport'
  | 'lease_contract'
  | 'receipt'
  | 'invoice'
  | 'insurance'
  | 'inventory_report'
  | 'photo'
  | 'other';

/**
 * Short aliases accepted by the backend's `documentable_type` field. The
 * backend also accepts the full FQCN; frontend always sends the alias.
 */
export type DocumentableType =
  | 'property'
  | 'lease'
  | 'booking'
  | 'customer'
  | 'user'
  | 'agency'
  | 'inventory';

export type Document = {
  id: number;
  documentable_id: number;
  documentable_type: string;
  uploaded_by: number | null;
  name: string;
  type: DocumentType | null;
  description: string | null;
  is_verified: boolean;
  verified_by: number | null;
  verified_at: string | null;
  expiry_date: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string | null;
};

export type DocumentShareLink = {
  id: number;
  document_id: number;
  token: string;
  expires_at: string | null;
  max_downloads: number | null;
  downloads_count: number;
  has_password: boolean;
  revoked_at: string | null;
  created_at: string | null;
};
