import { ApiError } from '@/lib/api';

/**
 * TCK-2580 (ADR-0102) — la saisie d'une candidature ou d'une offre au nom d'un client : ce qui se
 * décide sans écran. Le pendant, côté front, de `BookingKind::forProperty` et des règles de
 * `StoreBookingRequest` (TCK-2579).
 */

/** Les deux natures que le personnel saisit pour un client (le séjour garde son tunnel). */
export type NatureSaisie = 'application' | 'offer';

/** Ce qui suffit d'un bien pour décider de la nature et du montant par défaut. */
export interface BienPourLaNature {
  readonly contract_type?: string | null;
  readonly rent_period?: string | null;
}

/**
 * La nature que le bien donne — la règle de `BookingKind::forProperty`, à l'identique : vente →
 * offre ; location à la nuit ou à la semaine → séjour ; toute autre location (au mois, à l'année,
 * période absente) → candidature. Le séjour n'est PAS saisissable ici : l'appelant le dit.
 */
export function natureDuBien(bien: BienPourLaNature): NatureSaisie | 'stay' {
  if (bien.contract_type === 'sale') return 'offer';
  return bien.rent_period === 'daily' || bien.rent_period === 'weekly' ? 'stay' : 'application';
}

/**
 * L'écart du montant offert au prix affiché, en FRACTION (−0,105 pour 85 M sur 95 M). `null` quand
 * l'un manque ou que le prix affiché est nul : il n'y a rien à comparer.
 */
export function ecartAuPrix(offert: number | null | undefined, affiche: number | null | undefined): number | null {
  if (offert === null || offert === undefined || affiche === null || affiche === undefined) return null;
  if (!Number.isFinite(offert) || !Number.isFinite(affiche) || affiche <= 0) return null;
  return (offert - affiche) / affiche;
}

/** Les valeurs du formulaire, telles que la feuille les tient. */
export interface ValeursDeLaDemande {
  readonly nature: NatureSaisie;
  readonly propertyId: number;
  readonly customerId: number;
  /** Le loyer proposé (candidature) ou le montant offert (offre) : un nombre, jamais un texte groupé. */
  readonly montant: number | null;
  /** Candidature : la date d'entrée, `YYYY-MM-DD`. */
  readonly dateEntree?: string | null;
  /** Offre : « Valable jusqu'au », `YYYY-MM-DD`, facultatif. */
  readonly validite?: string | null;
  readonly message?: string | null;
}

/** Le corps de `POST /api/bookings` en mode personnel (TCK-2579). */
export interface CorpsDeLaDemande {
  readonly kind: NatureSaisie;
  readonly property_id: number;
  readonly customer_id: number;
  readonly total_amount?: number;
  readonly start_date?: string;
  readonly offer_expires_at?: string;
  readonly notes?: string;
}

/**
 * Le corps envoyé : SEULEMENT ce que la nature admet. L'API interdit `end_date`, `guests` et
 * `deposit_amount` aux deux natures, `start_date` à l'offre et `offer_expires_at` à la candidature
 * (`StoreBookingRequest`, `prohibited_if`) : un champ de trop est un 422, pas un champ ignoré.
 */
export function corpsDeLaDemande(v: ValeursDeLaDemande): CorpsDeLaDemande {
  const message = v.message?.trim();
  const commun = {
    kind: v.nature,
    property_id: v.propertyId,
    customer_id: v.customerId,
    ...(v.montant !== null && v.montant !== undefined ? { total_amount: v.montant } : {}),
    ...(message ? { notes: message } : {}),
  };
  if (v.nature === 'application') {
    return { ...commun, ...(v.dateEntree ? { start_date: v.dateEntree } : {}) };
  }
  return { ...commun, ...(v.validite ? { offer_expires_at: v.validite } : {}) };
}

/** Les champs de la feuille, ceux sur lesquels une erreur se pose. */
export type ChampDeLaDemande = 'client' | 'bien' | 'nature' | 'montant' | 'dateEntree' | 'validite' | 'message';

/**
 * Deux formes de 422, et c'est pourquoi cette table existe. Les erreurs de VALIDATION arrivent dans
 * `errors.<champ de l'API>` ; mais `booking.customer_required` et `booking.kind_mismatch` sont
 * levées par `abort_code_if` dans `BookingService` : un corps `{code, message}`, sans `errors`, que
 * `useApiForm` ne saurait poser sur aucun champ.
 */
const CHAMP_DE_L_API: Readonly<Record<string, ChampDeLaDemande>> = {
  customer_id: 'client',
  property_id: 'bien',
  kind: 'nature',
  total_amount: 'montant',
  start_date: 'dateEntree',
  offer_expires_at: 'validite',
  notes: 'message',
};

export const CHAMP_DU_CODE: Readonly<Record<string, ChampDeLaDemande>> = {
  'booking.customer_required': 'client',
  'booking.kind_mismatch': 'nature',
};

/** Le code d'un refus `{code}` de l'API, s'il y en a un. */
export function codeDuRefus(erreur: unknown): string | undefined {
  if (!(erreur instanceof ApiError) || !erreur.data || typeof erreur.data !== 'object') return undefined;
  const code = (erreur.data as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Les erreurs d'un envoi refusé, champ par champ. Un code connu (`CHAMP_DU_CODE`) donne sa CLÉ de
 * traduction (`codes.<code>`, le front possède le texte) ; une erreur de validation, la prose déjà
 * localisée de Laravel. Ce qui ne se pose sur aucun champ revient vide : l'appelant l'affiche en tête.
 */
export function erreursDeLaDemande(
  erreur: unknown,
): { readonly champs: Partial<Record<ChampDeLaDemande, { readonly cle?: string; readonly texte?: string }>>; readonly pose: boolean } {
  const champs: Partial<Record<ChampDeLaDemande, { readonly cle?: string; readonly texte?: string }>> = {};
  const code = codeDuRefus(erreur);
  if (code && CHAMP_DU_CODE[code]) champs[CHAMP_DU_CODE[code]] = { cle: code };
  if (erreur instanceof ApiError) {
    for (const [cle, messages] of Object.entries(erreur.validationErrors ?? {})) {
      const champ = CHAMP_DE_L_API[cle];
      if (champ && !champs[champ] && messages[0]) champs[champ] = { texte: messages[0] };
    }
  }
  return { champs, pose: Object.keys(champs).length > 0 };
}
