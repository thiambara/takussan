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
  /** TCK-593 — `settings.late_fee_online_collection`, désactivé par défaut. */
  late_fee_online_collection: z.boolean(),
  // TCK-594 (ADR-0039 §7) — mêmes bornes que `AgencyUpdateRequest`.
  default_tax_rate: z
    .string()
    .trim()
    .refine(
      (v) => {
        if (v === '') return true;
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 100;
      },
      msgValidation('agency.taxRateRange'),
    ),
  // TCK-594 (ADR-0039 §4) — un montant XOF entier ; vide = seuil désactivé.
  payout_approval_threshold: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[0-9]{1,12}$/.test(v), msgValidation('agency.thresholdInvalid')),
  legal_name: z.string().trim().max(255, msgValidation('agency.legalNameTooLong')),
  ninea: z.string().trim().max(30, msgValidation('agency.legalIdTooLong')),
  rccm: z.string().trim().max(30, msgValidation('agency.legalIdTooLong')),
  legal_address: z.string().trim().max(1000, msgValidation('agency.legalAddressTooLong')),
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
  default_tax_rate?: number | null;
  payout_approval_threshold?: number | null;
  legal_name?: string | null;
  ninea?: string | null;
  rccm?: string | null;
  legal_address?: string | null;
}

/**
 * TCK-594 — ce que le formulaire sait de l'agence AVANT la saisie, et qui décide de ce qui part.
 *
 * - `individual` : l'API refuse les mentions légales d'une agence `individual` (`prohibited`) ; les
 *   envoyer, même vides, rendrait chaque enregistrement 422.
 * - `initialThreshold` : le seuil a sa propre capacité (`payouts.approve`) et sa règle des deux
 *   approbateurs. Le renvoyer INCHANGÉ ferait refuser l'enregistrement du nom à un admin qui ne la
 *   détient pas : il ne part donc que s'il a été modifié.
 */
export interface AgencyFormContext {
  individual: boolean;
  initialThreshold: string;
}

function emptyToNull(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length === 0 ? null : t;
}

/**
 * Normalise the UI-friendly form values into the backend payload. Empty
 * strings become `null`; the commission rate is parsed to a number and
 * also mirrored in `settings.default_commission_rate` (spec alignment).
 *
 * TCK-593 — `settings` ne porte QUE les clés que cet écran gère. L'API fusionne `settings` clé par
 * clé (`AgencyController::update`) : une clé absente est conservée, une clé à `null` est effacée.
 * Renvoyer ici l'objet `settings` lu de l'agence réécrirait donc des réglages que l'écran ne montre
 * pas (filigrane, accueil…) avec leur valeur du moment du chargement.
 */
export function normaliseAgencyForm(
  values: AgencyFormValues,
  context: AgencyFormContext = { individual: false, initialThreshold: '' },
): AgencyFormPayload {
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
  settings.late_fee_online_collection = values.late_fee_online_collection;

  return {
    name: values.name.trim(),
    license_number: emptyToNull(values.license_number),
    description: emptyToNull(values.description),
    email: emptyToNull(values.email)?.toLowerCase() ?? null,
    phone: emptyToNull(values.phone),
    website: emptyToNull(values.website),
    commission_rate: commission,
    ...(currency !== null ? { currency: currency.toUpperCase() } : {}),
    settings,
    moderation_required: values.moderation_required,
    default_tax_rate: values.default_tax_rate.trim() === '' ? null : Number(values.default_tax_rate),
    ...(context.individual
      ? {}
      : {
          legal_name: emptyToNull(values.legal_name),
          ninea: emptyToNull(values.ninea),
          rccm: emptyToNull(values.rccm),
          legal_address: emptyToNull(values.legal_address),
        }),
    ...(values.payout_approval_threshold.trim() !== context.initialThreshold
      ? {
          payout_approval_threshold:
            values.payout_approval_threshold.trim() === '' ? null : Number(values.payout_approval_threshold),
        }
      : {}),
  };
}

/** Client-side logo upload guard — keeps parity with TCK-064 constraints. */
export const AGENCY_LOGO_MAX_BYTES = 2 * 1024 * 1024;
// Aligned with backend `MediaUploadRequest::rules()` for photos/logo
// collections (jpg, jpeg, png, webp). SVG is deliberately not supported
// backend-side (to avoid XSS via inline SVG) so we keep parity here.
export const AGENCY_LOGO_ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Rend une CLÉ de message (`validation.agency.…`), jamais un libellé — TCK-292, 2026-08-22.
 *
 * Les deux libellés français rendus ici l'étaient TELS QUELS à l'écran, dans les trois langues,
 * par deux chemins : `AgencyConfigForm.tsx` (`setLogoError` → `<p role="alert">`) et
 * `uploadAgencyLogoAction` (`{ ok: false, message }`). Ce module est importé des DEUX côtés — un
 * composant client et un module `'use server'` — donc ni `useTranslations` ni `getTranslations`
 * n'y est appelable : c'est le patron de `./messages.ts` qui s'applique (le schéma porte la clé,
 * la surface de rendu la résout par `traduireMessageValidation`).
 *
 * ⚠️ Un appelant qui NE traduit PAS affiche la clé brute. Les deux appelants du dépôt sont
 * couverts ; `src/lib/schemas/__tests__/traducteurs-de-messages.test.ts` rougit sur un troisième
 * qui l'oublierait.
 */
export function validateAgencyLogoFile(file: File): string | null {
  if (file.size > AGENCY_LOGO_MAX_BYTES) {
    return msgValidation('agency.logoTooLarge');
  }
  const acceptedTypes = AGENCY_LOGO_ACCEPT.split(',').map((t) => t.trim());
  if (file.type && !acceptedTypes.includes(file.type)) {
    return msgValidation('agency.logoUnsupportedFormat');
  }
  return null;
}
