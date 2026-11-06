import { z } from 'zod';
import { msgValidation } from './messages';
import { CODES_DE_MODULE, modulesMasquesDe, type CodeDeModule } from '@/lib/navigation/modules';

/**
 * Agency (admin config) schemas — TCK-064.
 *
 * Form values stay UI-friendly (strings, empty is OK). `normaliseAgencyForm`
 * converts them to the API payload shape before submission.
 */

export const agencyFormSchema = z.object({
  name: z.string().trim().min(1, msgValidation('agency.nameRequired')).max(255, msgValidation('agency.nameTooLong')),
  // TCK-1004 (P49.04) — la forme du slug se juge à l'API (422 sur le champ) : un slug ancien porte
  // des majuscules (`Str::random`), et un contrôle ici bloquerait l'enregistrement du reste.
  slug: z.string().trim().optional(),
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
  moderation_required: z.boolean(),
  /** TCK-589 — `settings.require_team_two_factor` : second facteur exigé de toute l'équipe. */
  require_team_two_factor: z.boolean(),
  /** TCK-593 — `settings.late_fee_online_collection`, désactivé par défaut. */
  late_fee_online_collection: z.boolean(),
  /** TCK-2483 — `settings.hidden_modules` : les modules retirés du menu de l'équipe (agence `standard`). */
  hidden_modules: z.array(z.enum(CODES_DE_MODULE)),
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

/** Les clés de `agencies.settings` que la fiche de l'agence gère — et SEULEMENT elles (TCK-593). */
export interface ReglagesDeLaFiche {
  require_team_two_factor: boolean;
  late_fee_online_collection: boolean;
  hidden_modules: CodeDeModule[];
}

/**
 * TCK-2486 — LA lecture de `settings` par la fiche : ses valeurs par défaut ET la référence « inchangé »
 * de l'envoi. Une seule fonction, pour qu'une case affichée décochée ne puisse pas être jugée modifiée.
 * Clé absente ou hors forme = le défaut de l'API (`AgencySettings`) : `false`, aucun module masqué.
 */
export function reglagesDeLaFiche(settings: unknown): ReglagesDeLaFiche {
  const lu = settings !== null && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  return {
    // TCK-589.
    require_team_two_factor: lu.require_team_two_factor === true,
    // TCK-593 — clé absente (agence neuve) = désactivé, comme côté API.
    late_fee_online_collection: lu.late_fee_online_collection === true,
    // TCK-2483 — clé absente = rien de masqué ; un code inconnu est ignoré (et ne repart pas).
    hidden_modules: modulesMasquesDe(lu),
  };
}

export interface AgencyFormPayload {
  name: string;
  /** TCK-1004 — n'est envoyé que s'il est éditable et modifié. */
  slug?: string;
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
 *   envoyer, même vides, rendrait chaque enregistrement 422. Même chose pour `settings.hidden_modules`
 *   (TCK-2483) et `settings.require_team_two_factor` (TCK-2487).
 *   Même chose pour `moderation_required`, refusée à `true` (`declined`, TCK-686).
 * - `initialThreshold` : le seuil a sa propre capacité (`payouts.approve`) et sa règle des deux
 *   approbateurs. Le renvoyer INCHANGÉ ferait refuser l'enregistrement du nom à un admin qui ne la
 *   détient pas : il ne part donc que s'il a été modifié.
 */
export interface AgencyFormContext {
  individual: boolean;
  initialThreshold: string;
  /**
   * TCK-1004 (P49.04) — le slug ne part que s'il est éditable (une fois, après le passage en
   * professionnelle) et modifié : l'API le refuse (`prohibited`) partout ailleurs.
   */
  slugEditable?: boolean;
  initialSlug?: string;
  /**
   * TCK-2483 (revue, M5), TCK-2486 — le `settings` de l'agence tel que chargé (absent = aucun réglage
   * posé). Une clé gérée ne part que si sa valeur a changé : l'API conserve une clé absente, et renvoyer
   * la valeur du chargement écraserait celle qu'un autre admin aurait enregistrée depuis.
   */
  initialSettings?: unknown;
}

function emptyToNull(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t.length === 0 ? null : t;
}

/**
 * Normalise the UI-friendly form values into the backend payload. Empty
 * strings become `null`; the commission rate is parsed to a number. La commission et la devise
 * partent sur leurs seules colonnes (TCK-962) : `AgencyUpdateRequest` n'accepte plus les miroirs
 * `settings.default_commission_rate` et `settings.currency`, ni `settings.timezone`, et
 * `validated()` les retirait sans erreur.
 *
 * TCK-593 — `settings` ne porte QUE les clés que cet écran gère (`ReglagesDeLaFiche`), et depuis
 * TCK-2486 seulement celles qui ont changé. L'API fusionne `settings` clé par
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
  const currency = emptyToNull(values.currency);
  // TCK-2486 — chaque clé gérée ne part que si elle a changé (patron de M5, TCK-2483) ; alors `false`
  // compris : décocher doit lever le réglage (TCK-589), pas le laisser en place faute d'avoir été envoyé.
  const initial = reglagesDeLaFiche(context.initialSettings);
  // TCK-2487 — jamais pour une `individual` : sans équipe, l'interrupteur n'a aucun effet, et l'API le
  // refuse (422, `prohibited`), `false` compris.
  if (!context.individual && values.require_team_two_factor !== initial.require_team_two_factor) {
    settings.require_team_two_factor = values.require_team_two_factor;
  }
  if (values.late_fee_online_collection !== initial.late_fee_online_collection) {
    settings.late_fee_online_collection = values.late_fee_online_collection;
  }
  // TCK-2483 — pour une agence `standard`, et seulement si la section a changé (revue, M5) : alors la
  // liste entière, dans l'ordre des codes, `[]` compris (tout réafficher doit s'enregistrer). Jamais
  // pour une `individual` : l'API la refuse (422).
  if (!context.individual) {
    const masques = CODES_DE_MODULE.filter((code) => values.hidden_modules.includes(code));
    if (masques.join() !== initial.hidden_modules.join()) settings.hidden_modules = masques;
  }

  const slug = (values.slug ?? '').trim();

  return {
    name: values.name.trim(),
    ...(context.slugEditable && slug !== (context.initialSlug ?? '') ? { slug } : {}),
    license_number: emptyToNull(values.license_number),
    description: emptyToNull(values.description),
    email: emptyToNull(values.email)?.toLowerCase() ?? null,
    phone: emptyToNull(values.phone),
    website: emptyToNull(values.website),
    commission_rate: commission,
    ...(currency !== null ? { currency: currency.toUpperCase() } : {}),
    // TCK-2486 — rien de modifié : pas de `settings` du tout.
    ...(Object.keys(settings).length > 0 ? { settings } : {}),
    // TCK-686 — l'API refuse la modération à une agence `individual` (422) : la clé ne part pas.
    ...(context.individual ? {} : { moderation_required: values.moderation_required }),
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
