import { ApiError, apiFetch } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-2983 (ADR-0132 § 5) — le lien d'action du pont, côté personne SANS SESSION : un geste sur un
 * objet, une fois. Contrat : TCK-2982 (`GET|POST /api/a/{jeton}`, `POST /api/a/{jeton}/code`).
 *
 * Le jeton EST le droit d'agir : il ne voyage que dans le chemin, par `cheminApi`, et la page sert
 * `no-referrer`. `apiFetch` n'envoie ni jeton d'API ni cookie (l'API est sur une autre origine) : la
 * page marche dans une fenêtre privée. Le préfixe `/api` est ajouté par `apiFetch`.
 *
 * Toute la lecture du contrat vit ici (enveloppe, codes du 410) : l'écran ne lit que ces types.
 */
export const GESTES_DU_LIEN = ['property_visit.confirm', 'maintenance_request.accept', 'inventory.sign'] as const;
export type GesteDuLien = (typeof GESTES_DU_LIEN)[number];

/**
 * AVANT le geste — la projection minimale du registre (`GestesParLien::projection`) : créneau, motif,
 * bien, quartier et ville ; jamais l'adresse exacte ni un téléphone. Selon le geste :
 * visite `{scheduled_at, property_title, quarter, city}`, intervention `{title, category, priority,
 * quarter, city}`, état des lieux `{type, property_title, quarter, city}`.
 *
 * APRÈS le geste — ce que le compte du lien lit de l'objet, par la ressource de l'objet
 * (`ActionLinkController::luApresLeGeste`), ou `null` s'il ne le lit pas. L'écran n'en lit que
 * l'adresse et le contact sur place (`access`, ADR-0122, le prestataire qui accepte ; `property.address`
 * d'une visite), le créneau et le motif.
 *
 * Chaque clé est facultative : l'écran n'affiche QUE ce que la réponse porte.
 */
export interface ObjetDuLien {
  readonly scheduled_at?: string | null;
  readonly title?: string | null;
  readonly property_title?: string | null;
  readonly quarter?: string | null;
  readonly city?: string | null;
  readonly access?: {
    readonly street?: string | null;
    readonly quarter?: string | null;
    readonly city?: string | null;
    readonly requester_phone?: string | null;
    readonly instructions?: string | null;
  } | null;
  readonly property?: { readonly title?: string | null; readonly address?: { readonly line?: string | null } | null } | null;
}

export interface LienDAction {
  readonly gesture: GesteDuLien;
  /** `open` à la lecture (`ActionLink::ETAT_OUVERT`) ; `done` dans la réponse du geste. */
  readonly state: 'open' | 'done';
  readonly object: ObjetDuLien | null;
}

/** Un lien qui ne sert plus. Le type ne porte AUCUN objet : un lien mort ne dit rien (AC2). */
export type CauseDuLienMort = 'expired' | 'used' | 'revoked' | 'notFound';

const CODES_DU_410: Readonly<Record<string, CauseDuLienMort>> = {
  'action_link.expired': 'expired',
  'action_link.used': 'used',
  'action_link.revoked': 'revoked',
};

/** Le lien mort que dit une erreur, ou `null` si l'erreur n'en dit pas un. */
export function lienMortDe(erreur: unknown): CauseDuLienMort | null {
  if (!(erreur instanceof ApiError)) return null;
  if (erreur.status === 404) return 'notFound';
  // Un jeton que `cheminApi` refuse (`/`, `?`, `#`, `..`) ne désigne aucun lien : aucun appel n'est parti.
  if (erreur.status === 400 && erreur.codeMetier === 'invalid_path') return 'notFound';
  if (erreur.status !== 410) return null;
  // TCK-3008 — le CODE seul : la prose (`message`, déjà localisée) n'en est jamais un, même quand elle y ressemble.
  return CODES_DU_410[erreur.codeMetier ?? ''] ?? 'expired';
}

function deballer<T>(corps: T | { readonly data: T }): T {
  return corps && typeof corps === 'object' && 'data' in corps ? (corps as { data: T }).data : (corps as T);
}

export async function lireLienDAction(jeton: string): Promise<LienDAction> {
  return deballer(await apiFetch<LienDAction | { data: LienDAction }>(cheminApi`/a/${jeton}`));
}

/** Les paramètres du geste : `scheduled_at` pour accepter, `signature` et `code` pour signer. */
export type ParametresDuGeste = { readonly scheduled_at?: string } | { readonly signature: string; readonly code: string } | Record<string, never>;

/** La réponse du geste : `{state: 'done', object}` — sans `gesture`. */
export interface GesteFait {
  readonly state: 'done';
  readonly object: ObjetDuLien | null;
}

export async function faireLeGeste(jeton: string, parametres: ParametresDuGeste): Promise<GesteFait> {
  return deballer(
    await apiFetch<GesteFait | { data: GesteFait }>(cheminApi`/a/${jeton}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parametres),
    }),
  );
}

/**
 * La signature : le code à 6 chiffres part par SMS au numéro qui a reçu le lien. Refus par code :
 * 409 `action_link.nothing_to_sign`, 423 `code_locked`, 429 `resend_too_soon`, 422 `no_phone`, 503
 * `sms_not_sent` — leur message, localisé par l'API, s'affiche tel quel.
 */
export async function demanderLeCode(jeton: string): Promise<void> {
  await apiFetch<unknown>(cheminApi`/a/${jeton}/code`, { method: 'POST' });
}
