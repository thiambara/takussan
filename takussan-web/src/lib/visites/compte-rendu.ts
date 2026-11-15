import type { PropertyVisit } from '@/types/visit';
import type { NatureSaisie } from '@/lib/reservations/saisie-de-demande';

/**
 * TCK-2581 (ADR-0101) — le compte rendu d'une visite et « Et maintenant ? » : ce qui se décide sans
 * écran. Le pendant, côté front, de `StorePropertyVisitReportRequest` et de `VisitReportService`
 * (TCK-2578).
 */

/** `VisitReportOutcome` — les trois touches. */
export type Verdict = 'interested' | 'thinking' | 'not_interested';
export const VERDICTS: readonly Verdict[] = ['interested', 'thinking', 'not_interested'];

/** `VisitObjection` — « Ce qui a pesé », liste fermée, dans l'ordre de la maquette. */
export type Objection = 'price' | 'neighborhood' | 'size' | 'condition' | 'availability' | 'guarantor';
export const OBJECTIONS: readonly Objection[] = ['price', 'neighborhood', 'size', 'condition', 'availability', 'guarantor'];

/** `VisitFollowUp` — la suite choisie, que le serveur TRACE sans rien déclencher (ADR-0101 § 3). */
export type Suite =
  | 'invite_apply'
  | 'invite_offer'
  | 'record_booking'
  | 'second_visit'
  | 'propose_properties'
  | 'remind'
  | 'create_lease';

/** Le compte rendu tel que l'API le sert (`PropertyVisitResource::report`). */
export interface CompteRendu {
  readonly outcome: Verdict;
  readonly objections: readonly Objection[];
  readonly note: string | null;
  readonly follow_up: Suite | null;
  readonly reported_at: string | null;
  readonly reported_by?: { readonly id: number; readonly first_name?: string | null; readonly last_name?: string | null } | null;
}

/** Le corps de `POST|PATCH /api/property-visits/{id}/report`. */
export interface CorpsDuCompteRendu {
  readonly outcome?: Verdict;
  readonly objections?: readonly Objection[];
  readonly note?: string | null;
  readonly follow_up?: Suite | null;
}

/** La visite telle que l'API la sert, compte rendu compris (la clé n'existe que pour le personnel). */
export type VisiteAvecCompteRendu = PropertyVisit;

/**
 * Le compte rendu est-il LISIBLE par l'appelant ? L'API n'émet la clé `report` qu'au personnel de
 * l'agence du bien (et au super-admin) : visiteur, client et bailleur ne la reçoivent pas. C'est la
 * seule garde à tenir côté front — elle est celle de `PropertyVisitPolicy::report`.
 */
export function compteRenduLisible(visite: VisiteAvecCompteRendu): boolean {
  return Object.prototype.hasOwnProperty.call(visite, 'report');
}

/**
 * La visite peut-elle recevoir un compte rendu ? La règle de `PropertyVisit::isClosableByReport` :
 * terminée, ou confirmée dont l'heure est passée (TCK-2578 la clôt en un geste).
 */
export function closableParCompteRendu(visite: PropertyVisit, maintenant: number): boolean {
  if (visite.status === 'completed') return true;
  if (visite.status !== 'confirmed' || !visite.scheduled_at) return false;
  const debut = new Date(visite.scheduled_at).getTime();
  return Number.isFinite(debut) && debut <= maintenant;
}

/** Un compte rendu reste à faire : lisible, closable, et pas encore écrit. */
export function compteRenduAFaire(visite: VisiteAvecCompteRendu, maintenant: number): boolean {
  return compteRenduLisible(visite) && !visite.report && closableParCompteRendu(visite, maintenant);
}

/** La nature du bien, pour la suite : la candidature et l'offre engagent ; le séjour n'a pas de suite d'engagement. */
export type NatureDeLaSuite = NatureSaisie | 'stay';

export interface SuitesDeLaVisite {
  /** Dans l'ordre affiché : la conseillée d'abord, puis l'ordre utile. */
  readonly suites: readonly Suite[];
  readonly conseillee: Suite | null;
}

/**
 * Les suites d'une visite, dans l'ordre utile de la maquette (inviter, saisir, 2ᵉ visite, autres
 * biens, relancer, bail), la conseillée remontée en tête.
 *
 * - Inviter et saisir n'existent que pour une candidature (location au mois ou à l'année) ou une
 *   offre (vente) ; un séjour court n'en a aucune (le ticket, et `BookingKind::forProperty`).
 * - « Créer le bail » n'a de sens que pour une location : jamais sur une vente.
 * - La conseillée : « Intéressé » → inviter (la maquette) ; « À réfléchir » → relancer ; « Pas
 *   intéressé » → proposer d'autres biens. Les deux dernières ne sont pas dessinées : proposées au
 *   porteur (point n° 2), écrites ici en un seul endroit.
 */
export function suitesDeLaVisite(verdict: Verdict | null, nature: NatureDeLaSuite | null): SuitesDeLaVisite {
  const invitation: Suite | null = nature === 'application' ? 'invite_apply' : nature === 'offer' ? 'invite_offer' : null;
  const ordre: Suite[] = [
    ...(invitation ? [invitation, 'record_booking' as const] : []),
    'second_visit',
    'propose_properties',
    'remind',
    ...(nature === 'application' ? ['create_lease' as const] : []),
  ];
  const voulue: Suite | null =
    verdict === 'interested' ? invitation : verdict === 'thinking' ? 'remind' : verdict === 'not_interested' ? 'propose_properties' : null;
  const conseillee = voulue && ordre.includes(voulue) ? voulue : null;
  return { suites: conseillee ? [conseillee, ...ordre.filter((s) => s !== conseillee)] : ordre, conseillee };
}

/** Les suites qui demandent une FICHE client (le visiteur sans fiche passe d'abord par « Créer sa fiche »). */
export const SUITES_SUR_FICHE: ReadonlySet<Suite> = new Set<Suite>(['record_booking', 'propose_properties', 'remind']);

/** `CustomerPipelineStage` avant « Qualifié » (`VisitReportService::STAGES_BEFORE_QUALIFIED`). */
const ETAPES_AVANT_QUALIFIE: ReadonlySet<string> = new Set(['lead', 'prospect']);

/**
 * L'interrupteur « Passer <prénom> en « Qualifié » » s'offre-t-il, et allumé ? La règle de
 * `VisitReportService::suggestedStage` : un verdict « Intéressé » sur une fiche encore « Nouveau »
 * ou « Prospect ». L'API ne rend `suggested_stage` que dans la réponse de l'écriture : rouvert
 * plus tard, l'écran juge sur l'étape lue de la fiche, par cette même règle.
 */
export function etapeAProposer(verdict: Verdict | null, etape: string | null | undefined): boolean {
  return verdict === 'interested' && typeof etape === 'string' && ETAPES_AVANT_QUALIFIE.has(etape);
}

/**
 * Le lien de la fiche publique qui ROUVRE la boîte de candidature ou d'offre (`?action=reserver`,
 * TCK-589 / TCK-2510), connexion par numéro comprise. Préfixé de la langue (ADR-0026) : sans
 * préfixe, le proxy répond 307 vers la langue du cookie du destinataire.
 */
export function lienDInvitation(origine: string, langue: string, slug: string): string {
  return `${origine.replace(/\/$/, '')}/${langue}/properties/${encodeURIComponent(slug)}?action=reserver`;
}

/** La date d'échéance d'une relance à J+N, à 09:00 heure de Dakar (UTC+0, sans heure d'été). */
export function echeanceDeRelance(maintenant: Date, jours: number): string {
  const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate() + jours, 9, 0, 0));
  return d.toISOString();
}
