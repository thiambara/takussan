/**
 * TCK-601 (G) — le registre des demandes de droits (accès, rectification, opposition, effacement,
 * portabilité).
 *
 * Source de vérité : `takussan-api/app/Http/Resources/PrivacyRequestResource.php` (super-admin
 * seul). Les trois énumérations recopient `App\Models\Enums\PrivacyRequest{Type,Channel,Status}`.
 */

export const PRIVACY_REQUEST_TYPES = [
  'access',
  'rectification',
  'opposition',
  'erasure',
  'portability',
] as const;
export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export const PRIVACY_REQUEST_CHANNELS = [
  'in_app',
  'email',
  'postal',
  'phone',
  'in_person',
] as const;
export type PrivacyRequestChannel = (typeof PRIVACY_REQUEST_CHANNELS)[number];

export const PRIVACY_REQUEST_STATUSES = [
  'received',
  'in_progress',
  'answered',
  'rejected',
  'withdrawn',
] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

export interface PrivacyRequest {
  readonly id: number;
  readonly user_id: number | null;
  readonly requester_name: string;
  readonly requester_contact: string | null;
  readonly type: PrivacyRequestType;
  readonly channel: PrivacyRequestChannel;
  readonly status: PrivacyRequestStatus;
  /** ISO 8601. */
  readonly received_at: string;
  /** ISO 8601 — `received_at` + le délai légal configuré côté API. */
  readonly due_at: string;
  readonly answered_at: string | null;
  readonly response_summary: string | null;
  readonly handled_by: { readonly id: number; readonly name: string } | null;
  readonly data_export_id: number | null;
  readonly account_deletion_request_id: number | null;
  /** Calculé par l'API : ouverte (`received` / `in_progress`) et échéance dépassée. */
  readonly is_overdue: boolean;
  readonly proof: { readonly file_name: string; readonly size: number } | null;
  readonly created_at: string;
}

export interface CreatePrivacyRequestPayload {
  readonly type: PrivacyRequestType;
  readonly channel: PrivacyRequestChannel;
  readonly requester_name: string;
  readonly requester_contact?: string;
  readonly user_id?: number;
  /** `YYYY-MM-DD` ; l'API prend aujourd'hui à défaut. */
  readonly received_at?: string;
}

export interface UpdatePrivacyRequestPayload {
  readonly status?: PrivacyRequestStatus;
  readonly response_summary?: string;
  /** PDF, JPG, PNG, WebP ou HEIC — envoyé en multipart. */
  readonly proof?: File | null;
}
