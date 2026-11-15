import { z } from 'zod';

import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  type MaintenanceCategory,
  type MaintenancePriority,
  type MaintenanceStatus,
} from '@/types/maintenance';
import { requiredStringSchema } from './common';
import { msgValidation } from './messages';

/**
 * Zod schemas for the `MaintenanceRequest` domain. Aligned with the
 * `App\Http\Controllers\Api\MaintenanceRequestController` validation
 * rules — client-side rules are a strict subset; backend stays the
 * source of truth.
 */

const categoryEnum = z.enum(MAINTENANCE_CATEGORIES as unknown as [MaintenanceCategory, ...MaintenanceCategory[]]);
const priorityEnum = z.enum(MAINTENANCE_PRIORITIES as unknown as [MaintenancePriority, ...MaintenancePriority[]]);
const statusEnum = z.enum(MAINTENANCE_STATUSES as unknown as [MaintenanceStatus, ...MaintenanceStatus[]]);

/**
 * Payload for `POST /api/maintenance-requests`.
 * `property_id` and `lease_id` are coerced from form inputs (string → number).
 */
const nullableLeaseId = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.coerce.number().int().positive().nullable(),
);

export const maintenanceCreateSchema = z.object({
  property_id: z.coerce
    .number({ error: msgValidation('maintenance.propertyRequired') })
    .int()
    .positive(msgValidation('maintenance.propertyRequired')),
  lease_id: nullableLeaseId,
  title: requiredStringSchema(msgValidation('maintenance.titleRequired')).max(255, msgValidation('maintenance.titleTooLong')),
  description: requiredStringSchema(msgValidation('maintenance.descriptionRequired')),
  category: categoryEnum,
  priority: priorityEnum.optional(),
});

export type MaintenanceCreateInput = z.infer<typeof maintenanceCreateSchema>;

/**
 * Payload for `PUT /api/maintenance-requests/{id}/status`.
 *
 * TCK-2917 (ADR-0118 § 1) — `reason` : le motif de qui annule, EXIGÉ par l'API pour `cancelled` (422
 * sinon) ; le locataire, le bailleur et le prestataire le lisent (`cancellation_reason`).
 */
export const maintenanceStatusSchema = z.object({
  status: statusEnum,
  reason: z.string().max(500).optional(),
});

/**
 * TCK-2918 — le type de l'appel : `cancelled` EXIGE `reason` (sans lui, l'API rend 422). Le compilateur
 * refuse ainsi toute annulation envoyée sans motif, où qu'elle soit écrite.
 */
export type MaintenanceStatusInput =
  | { readonly status: Exclude<MaintenanceStatus, 'cancelled'>; readonly reason?: undefined }
  | { readonly status: 'cancelled'; readonly reason: string };

/** TCK-2918 — la borne du motif d'annulation (`UpdateStatusMaintenanceRequestRequest`, `max:500`). */
export const MOTIF_D_ANNULATION_MAX = 500;

/**
 * Payload for `PUT /api/maintenance-requests/{id}/complete`.
 * Photos are uploaded separately via the dedicated `/photos` endpoint.
 */
/**
 * Pre-processes form inputs that may arrive as '' or null before number
 * coercion. Empty string would otherwise be coerced to `0`, which is
 * semantically different from "not provided" for optional numeric fields.
 */
const optionalNonNegativeNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.coerce.number().min(0, msgValidation('maintenance.costNonNegative')).optional(),
);

export const maintenanceCompleteSchema = z.object({
  resolution_notes: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional(),
  actual_cost: optionalNonNegativeNumber,
});

export type MaintenanceCompleteInput = z.infer<typeof maintenanceCompleteSchema>;

/**
 * Payload for the generic `PUT /api/maintenance-requests/{id}` endpoint —
 * covers assignment (`assigned_to`), scheduling and cost updates.
 */
const nullableUserId = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.coerce.number().int().positive().nullable(),
);

const nullableNonNegativeNumber = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : v),
  z.coerce.number().min(0).nullable(),
);

export const maintenanceUpdateSchema = z.object({
  assigned_to: nullableUserId,
  priority: priorityEnum.optional(),
  estimated_cost: nullableNonNegativeNumber,
  scheduled_at: z
    .string()
    .trim()
    .transform((v) => (v.length === 0 ? null : v))
    .optional()
    .nullable(),
});

export type MaintenanceUpdateInput = z.infer<typeof maintenanceUpdateSchema>;
