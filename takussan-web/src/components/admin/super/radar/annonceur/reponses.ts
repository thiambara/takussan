import type { RadarConsent, RadarMessageLocale, RadarOutreach, RadarOutreachOutcome, RadarVerdictClassification } from '@/types/radar';
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
