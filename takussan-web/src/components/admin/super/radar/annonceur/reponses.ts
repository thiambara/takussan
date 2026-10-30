import type {
  RadarConsent,
  RadarMessageLocale,
  RadarOutreach,
  RadarOutreachOutcome,
  RadarOutreachProviderStatus,
  RadarVerdictClassification,
} from '@/types/radar';
import { RADAR_MESSAGE_LOCALES } from '@/types/radar';

/**
 * TCK-2388 — ce que l'écran lit d'une réponse déposée, sans rien décider : le verdict n'ouvre rien, seul
 * `recordOutcome()` côté API confirme, et il juge sur la réponse la plus récente de CE message (la dernière par `id`).
 */

/** La réponse que l'API juge : la plus récente du message. */
export function derniereReponse(consents: readonly RadarConsent[]): RadarConsent | null {
  return consents.reduce<RadarConsent | null>((dernier, c) => (dernier === null || c.id > dernier.id ? c : dernier), null);
}

/** Les réponses d'un message, de la plus récente à la plus ancienne. */
export function reponsesRecentesDabord(consents: readonly RadarConsent[]): RadarConsent[] {
  return [...consents].sort((a, b) => b.id - a.id);
}

/** Une vérification tourne encore (file, ou reprise espacée) : l'écran se relit tant que c'est vrai. */
export function verificationEnCours(consents: readonly RadarConsent[]): boolean {
  return consents.some((c) => c.verification_status === 'pending');
}

/**
 * Ce qui, dans le verdict enregistré, ne va pas dans le sens d'un accord : les codes que l'API a posés dans le verdict,
 * ou `no_verdict` quand il n'y en a pas (vérification en cours ou échouée) — comme `RadarConsentVerdict::discordances()`.
 */
export function discordancesDe(reponse: RadarConsent | null): string[] {
  if (reponse === null) return [];
  const verdict = reponse.verdict;
  if (verdict === null || typeof verdict !== 'object') return ['no_verdict'];
  return Array.isArray(verdict.discordances) ? [...verdict.discordances] : ['no_verdict'];
}

const ISSUE_DU_CLASSEMENT: Record<RadarVerdictClassification, RadarOutreachOutcome | null> = {
  consent: 'consented',
  refusal: 'refused',
  stop: 'stop',
  question: 'question',
  ambiguous: null,
};

/** L'issue que propose le classement de l'IA ; `ambiguous` ne propose rien : l'opérateur tranche. */
export function issueProposee(reponse: RadarConsent | null): RadarOutreachOutcome | null {
  const classement = reponse?.verdict?.classification;
  return classement ? (ISSUE_DU_CLASSEMENT[classement] ?? null) : null;
}

/** Le nombre de clauses numérotées du message envoyé (`1. …` en début de ligne), comme `ConsentMessageComposer::clauseCount`. */
export function nombreDeClauses(message: string): number {
  return (message.match(/^\d+\. /gm) ?? []).length;
}

/**
 * Ce que le verdict dit des clauses — il fait autorité, pas le texte : `clauses_complete` l'emporte sur un recompte.
 * - complet : « k sur k » (aucune manquante), même si le texte envoyé en compte un autre nombre ;
 * - incomplet : « k sur N » avec les numéros manquants lus dans le texte ; si le texte n'en laisse aucune manquante
 *   (le verdict contredit le recompte), `total` est `null` : l'écran dit « incomplètes » sans inventer un N.
 */
export function lectureDesClauses(
  trouvees: readonly number[],
  complet: boolean,
  message: string,
): { readonly trouvees: number; readonly total: number | null; readonly manquantes: number[] } {
  if (complet) return { trouvees: trouvees.length, total: trouvees.length, manquantes: [] };
  const total = nombreDeClauses(message);
  const manquantes = clausesManquantes(trouvees, total);
  return manquantes.length === 0
    ? { trouvees: trouvees.length, total: null, manquantes: [] }
    : { trouvees: trouvees.length, total, manquantes };
}

/** Les numéros de clauses, de 1 à `total`, que le verdict n'a pas retrouvés. */
export function clausesManquantes(trouvees: readonly number[], total: number): number[] {
  return Array.from({ length: total }, (_, i) => i + 1).filter((n) => !trouvees.includes(n));
}

/** La langue d'une relance : celle du message relancé si elle est servie, sinon le français. */
export function langueDeRelance(message: RadarOutreach): RadarMessageLocale {
  return (RADAR_MESSAGE_LOCALES as readonly string[]).includes(message.locale) ? (message.locale as RadarMessageLocale) : 'fr';
}

/**
 * Les messages sur lesquels une réponse ou une issue se pose : envoyés, sans issue finale, et pas supplantés par une
 * relance ENVOYÉE (`radar.outreach.superseded`) — une relance seulement préparée ne supplante rien.
 */
export function messagesEnAttente(messages: readonly RadarOutreach[]): RadarOutreach[] {
  return messages.filter((m) => m.status === 'sent'
    && !messages.some((autre) => autre.follow_up_of_id === m.id && autre.sent_at !== null));
}

/** Les écarts qu'un 422 `radar.consent.reason_required` porte (`params.discordances`), ou `no_verdict` à défaut. */
export function ecartsDeLErreur(erreur: unknown): string[] {
  const params = (erreur as { data?: { params?: { discordances?: unknown } } } | null)?.data?.params;
  const ecarts = params?.discordances;
  return Array.isArray(ecarts) && ecarts.length > 0 && ecarts.every((e) => typeof e === 'string') ? [...ecarts] : ['no_verdict'];
}

/**
 * TCK-2426 — comme `RadarOutreachWorkflow::refuseIfReplyPending()` : une réponse reçue par l'API (`provider_message`), non
 * confirmée, sur N'IMPORTE QUEL message de l'annonceur resté sans issue — toutes ses annonces, pas la seule chaîne d'un
 * brouillon. L'API refuse alors tout démarchage vers lui (409 `radar.outreach.reply_pending`) : préparation, envoi par
 * l'API, « J'ai envoyé ». L'écran le dit avant, et retire le lien `wa.me` — sinon le message partirait du téléphone sans
 * que rien ne s'en souvienne. La fiche porte tous les messages de l'annonceur, avec toutes leurs réponses.
 */
export function reponseRecueEnAttente(messages: readonly RadarOutreach[]): boolean {
  return messages.some((m) => m.outcome === null && m.consents.some((c) => c.proof === 'provider_message' && c.confirmed_at === null));
}

/** Un message et ceux qu'il relance, en remontant `follow_up_of_id` (un cycle s'arrête, comme côté API). */
function chaineDe(message: RadarOutreach, messages: readonly RadarOutreach[]): RadarOutreach[] {
  const chaine: RadarOutreach[] = [];
  let courant: RadarOutreach | undefined = message;
  while (courant !== undefined && !chaine.includes(courant)) {
    chaine.push(courant);
    const parent: number | null = courant.follow_up_of_id;
    courant = parent === null ? undefined : messages.find((m) => m.id === parent);
  }
  return chaine;
}

/** TCK-2426 — par où un message envoyé est parti, tel que l'écran le nomme : à la main, par l'API, ou par l'API sans confirmation de Meta. */
export type CanalDuMessage = 'manual' | 'cloud' | 'ambiguous';

export function canalDuMessage(message: RadarOutreach): CanalDuMessage {
  if (message.channel !== 'whatsapp_cloud') return 'manual';
  return message.provider_status === 'ambiguous' ? 'ambiguous' : 'cloud';
}

/**
 * TCK-2426 — la chaîne d'un message ouvert contient un envoi par l'API sans issue : une réponse peut arriver à tout moment
 * par le webhook de Meta. La chaîne, pas le seul message ouvert : une réponse au numéro du Radar se rattache au dernier
 * message envoyé de la chaîne (`RadarWhatsappInbox::target()`), qui peut être une relance envoyée à la main.
 */
export function attendUneReponseParLApi(messages: readonly RadarOutreach[]): boolean {
  return messagesEnAttente(messages)
    .some((ouvert) => chaineDe(ouvert, messages).some((m) => m.channel === 'whatsapp_cloud' && m.outcome === null));
}

/**
 * TCK-2437 — l'état de remise d'un message envoyé par l'API, lu des accusés de Meta (TCK-2427) : envoyé (pas encore
 * d'accusé de remise), remis, lu, ou non remis. `null` pour un message parti à la main, pour un envoi `ambiguous` (le
 * canal dit déjà « envoi non confirmé ») et pour toute valeur que le front ne connaît pas : rien plutôt qu'une remise.
 */
export type RemiseDuMessage = 'sent' | 'delivered' | 'read' | 'failed';

const REMISE_DU_STATUT: Record<RadarOutreachProviderStatus, RemiseDuMessage | null> = {
  accepted: 'sent',
  ambiguous: null,
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
  failed: 'failed',
};

export function remiseDuMessage(message: RadarOutreach): RemiseDuMessage | null {
  const statut = message.provider_status;
  if (message.channel !== 'whatsapp_cloud' || statut === null || !Object.hasOwn(REMISE_DU_STATUT, statut)) return null;
  return REMISE_DU_STATUT[statut];
}
