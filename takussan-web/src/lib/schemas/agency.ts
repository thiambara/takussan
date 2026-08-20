import { z } from 'zod';
import { msgValidation } from './messages';

/**
 * Agency (admin config) schemas — TCK-064.
 *
 * Form values stay UI-friendly (strings, empty is OK). `normaliseAgencyForm`
 * converts them to the API payload shape before submission.
 */

export const agencyFormSchema = z.object({
  name: z.string().trim().min(1, msgValidation('agency.nameRequired')).max(255, msgValidation('agency.nameTooLong')),
  license_number: z
    .string()
    .trim()
    .max(100, msgValidation('agency.licenseTooLong'))
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .trim()
    .max(2_000, msgValidation('agency.descriptionTooLong'))
    .optional()
    .or(z.literal('')),
  email: z
    .string()
    .trim()
    .max(255, msgValidation('common.emailTooLong'))
    .refine(
      (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      msgValidation('common.emailInvalid'),
    ),
  phone: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^\+?[0-9\s().-]{8,20}$/.test(v),
      msgValidation('common.phoneInvalid'),
    ),
  website: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^https?:\/\/[^\s]+$/.test(v),
      msgValidation('agency.websiteInvalid'),
    ),
  commission_rate: z
    .string()
    .trim()
    .refine(
      (v) => {
        if (v === '') return true;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 100;
      },
      msgValidation('agency.commissionRange'),
    ),
  currency: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^[A-Z]{3}$/.test(v),
      msgValidation('agency.currencyInvalid'),
    ),
  timezone: z.string().trim().max(64, msgValidation('agency.timezoneTooLong')),
  moderation_required: z.boolean(),
});

export type AgencyFormValues = z.infer<typeof agencyFormSchema>;

export interface AgencyFormPayload {
  name: string;
  license_number?: string | null;
  description?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  commission_rate?: number | null;
  /** TCK-084 — first-class column, not nested under `settings`. */
  currency?: string;
  settings?: Record<string, unknown>;
  /** TCK-098 — whether new property publications require admin approval. */
  moderation_required?: boolean;
}

function emptyToNull(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length === 0 ? null : t;
}

/**
 * Normalise the UI-friendly form values into the backend payload. Empty
 * strings become `null`; the commission rate is parsed to a number and
 * also mirrored in `settings.default_commission_rate` (spec alignment).
 */
export function normaliseAgencyForm(values: AgencyFormValues): AgencyFormPayload {
  const commission = values.commission_rate.trim() === '' ? null : Number(values.commission_rate);
  const settings: Record<string, unknown> = {};
  if (commission !== null) settings.default_commission_rate = commission;
  const currency = emptyToNull(values.currency);
  // TCK-084 — keep mirroring `currency` inside `settings` for backwards
  // compatibility with surfaces that still read the legacy path; the
  // first-class column is the source of truth.
  if (currency !== null) settings.currency = currency.toUpperCase();
  const timezone = emptyToNull(values.timezone);
  if (timezone !== null) settings.timezone = timezone;

  return {
    name: values.name.trim(),
    license_number: emptyToNull(values.license_number),
    description: emptyToNull(values.description),
    email: emptyToNull(values.email)?.toLowerCase() ?? null,
    phone: emptyToNull(values.phone),
    website: emptyToNull(values.website),
    commission_rate: commission,
    ...(currency !== null ? { currency: currency.toUpperCase() } : {}),
    ...(Object.keys(settings).length > 0 ? { settings } : {}),
    moderation_required: values.moderation_required,
  };
}

/** Client-side logo upload guard — keeps parity with TCK-064 constraints. */
export const AGENCY_LOGO_MAX_BYTES = 2 * 1024 * 1024;
// Aligned with backend `MediaUploadRequest::rules()` for photos/logo
// collections (jpg, jpeg, png, webp). SVG is deliberately not supported
// backend-side (to avoid XSS via inline SVG) so we keep parity here.
export const AGENCY_LOGO_ACCEPT = 'image/jpeg,image/png,image/webp';

export function validateAgencyLogoFile(file: File): string | null {
  if (file.size > AGENCY_LOGO_MAX_BYTES) {
    return 'Le logo dépasse 2 Mo.';
  }
  const acceptedTypes = AGENCY_LOGO_ACCEPT.split(',').map((t) => t.trim());
  if (file.type && !acceptedTypes.includes(file.type)) {
    return 'Format non supporté. Utilisez JPG, PNG ou WEBP.';
  }
  return null;
}
