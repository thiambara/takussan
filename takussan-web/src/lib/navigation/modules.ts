import type { IdDestination } from './catalogue';
import type { Persona } from './personas';

/**
 * TCK-2483 (ADR-0089, amendement « modules par agence ») — les modules qu'un admin d'agence
 * `standard` retire du menu de son personnel (`agencies.settings.hidden_modules`).
 *
 * Les CODES sont ceux de `App\Models\Enums\AgencyModule`, qui valide l'écriture
 * (`modules.parity.test.ts`) ; la TABLE vers le catalogue appartient au front (principe 5).
 * AFFICHAGE seulement : aucune page, aucune garde ne lit ce réglage (`modules.test.ts`).
 *
 * Ne s'y ajoute jamais une destination à compteur, d'écriture, jugée sur l'espace, une page
 * d'agence, une action principale ni un onglet mobile — `modules.test.ts` le refuse.
 */
export const CODES_DE_MODULE = [
  'commissions',
  'inventories',
  'move_in_follow_up',
  'provider_book',
  'calendar',
  'credits',
  'analytics',
] as const;

export type CodeDeModule = (typeof CODES_DE_MODULE)[number];

export const MODULES_D_AGENCE: Readonly<Record<CodeDeModule, readonly IdDestination[]>> = {
  commissions: ['commissions'],
  inventories: ['etats-des-lieux'],
  // La liste suit la checklist d'onboarding du locataire, pas les seuls états des lieux : un module à part.
  move_in_follow_up: ['entrees-en-attente'],
  provider_book: ['carnet-prestataires'],
  calendar: ['calendrier'],
  credits: ['credits'],
  // Les statistiques (`/app/overview`) et la vue d'agence restent : ce module est le pilotage AVANCÉ.
  analytics: ['kpis', 'alertes', 'exports'],
};

/** Les personas dont la DISPOSITION se masque. Les autres ne perdent que leur complément « Aussi … ». */
export const PERSONAS_DU_PERSONNEL: ReadonlySet<Persona> = new Set<Persona>(['agent', 'admin-agence']);

/** `agency.settings.hidden_modules`, tel que l'API le rend : seuls les codes connus, dans leur ordre. */
export function modulesMasquesDe(settings: unknown): CodeDeModule[] {
  const brut =
    settings !== null && typeof settings === 'object' ? (settings as { hidden_modules?: unknown }).hidden_modules : undefined;
  if (!Array.isArray(brut)) return [];
  return CODES_DE_MODULE.filter((code) => brut.includes(code));
}

/** Les destinations que retirent ces modules ; un code inconnu ne retire rien. */
export function destinationsMasquees(modules: readonly string[]): ReadonlySet<IdDestination> {
  return new Set(CODES_DE_MODULE.filter((code) => modules.includes(code)).flatMap((code) => MODULES_D_AGENCE[code]));
}
