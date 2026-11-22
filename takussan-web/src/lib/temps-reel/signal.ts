/**
 * TCK-2954 (ADR-0129 § 1, § 4) — le signal temps réel, côté navigateur : sa forme, son canal, et la
 * règle du curseur. Aucun import de `laravel-echo` ni de `pusher-js` ici : ce module est chargé par
 * toute la coque, même sans temps réel.
 *
 * **Un signal n'est jamais une donnée.** Il dit « tel objet a changé » — `subject`, `event`,
 * `cursor`, et rien d'autre — et l'écran relit l'objet par l'API, sous ses propres droits. Rien de ce
 * que porte un signal n'est affiché.
 */

/** La forme sur le fil, épinglée côté API par `SignalTempsReel::broadcastWith()` (TCK-2952). */
export type SignalTempsReel = {
  /** L'objet qui a changé : `conversation:42`, `utilisateur:7`. */
  readonly subject: string;
  /** Le code de l'événement (`CodeDeSignal`) : `message.created`, `notifications.updated`… */
  readonly event: string;
  /** ISO 8601 UTC à la microseconde (`2026-11-18T00:49:34.187325Z`), comparable comme une chaîne. */
  readonly cursor: string;
};

/**
 * `type:id` — le type en minuscules (registre fermé `CanauxTempsReel` côté API), l'identifiant un
 * entier positif d'au plus 18 chiffres, comme `CanauxTempsReel::IDENTIFIANT`.
 */
const FORME_DU_SUJET = /^([a-z][a-z_]*):([1-9][0-9]{0,17})$/;

/** `SignalTempsReel::FORME_DU_CURSEUR` (`Y-m-d\TH:i:s.u\Z`) : une forme fixe, donc un ordre de chaîne juste. */
const FORME_DU_CURSEUR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

/** Un code d'événement : des segments en minuscules séparés de points (`message.created`). */
const FORME_DE_L_EVENEMENT = /^[a-z][a-z_]*(\.[a-z][a-z_]*)*$/;

/**
 * Le signal lu dans une charge brute, ou `null` : toute autre forme est IGNORÉE, sans erreur
 * affichée. Seules les trois clés sont recopiées — une clé de plus, si l'API en émettait un jour, ne
 * traverserait pas ce point.
 */
export function lireSignal(brut: unknown): SignalTempsReel | null {
  if (typeof brut !== 'object' || brut === null) return null;
  const { subject, event, cursor } = brut as Record<string, unknown>;
  if (typeof subject !== 'string' || !FORME_DU_SUJET.test(subject)) return null;
  if (typeof event !== 'string' || !FORME_DE_L_EVENEMENT.test(event)) return null;
  if (typeof cursor !== 'string' || !FORME_DU_CURSEUR.test(cursor)) return null;
  return { subject, event, cursor };
}

/** Le canal d'un sujet, sans préfixe (`conversation:42` → `sujet.conversation.42`), ou `null` s'il est mal formé. */
export function canalDuSujet(sujet: string): string | null {
  const morceaux = FORME_DU_SUJET.exec(sujet);
  return morceaux ? `sujet.${morceaux[1]}.${morceaux[2]}` : null;
}

/** Le sujet d'un canal `sujet.{type}.{id}`, ou `null` pour tout autre canal (le canal personnel). */
export function sujetDuCanal(canal: string): string | null {
  const morceaux = /^sujet\.([a-z][a-z_]*)\.([1-9][0-9]{0,17})$/.exec(canal);
  return morceaux ? `${morceaux[1]}:${morceaux[2]}` : null;
}

/** Le canal personnel d'une session, sans préfixe : `utilisateur.7`. */
export function canalPersonnel(utilisateurId: number): string {
  return `utilisateur.${utilisateurId}`;
}

/**
 * La cible d'un abonnement : un sujet (`conversation:42`), ou le canal personnel de la session,
 * filtré par codes d'événement — on s'abonne à SON canal, et on trie par `event` (TCK-2952).
 */
export type CibleDuSignal = string | { readonly personnel: readonly string[] };

/** Le canal d'une cible pour la session `utilisateurId`, ou `null` (cible absente ou mal formée, pas de session). */
export function canalDeLaCible(
  cible: CibleDuSignal | null | undefined,
  utilisateurId: number | null,
): string | null {
  if (cible === null || cible === undefined) return null;
  if (typeof cible === 'string') return canalDuSujet(cible);
  return utilisateurId === null ? null : canalPersonnel(utilisateurId);
}

/**
 * Les derniers curseurs vus — un par canal ET par couple `(subject, event)`.
 *
 * Le canal fait partie de la clé : une même émission atteint `sujet.*` ET `utilisateur.*` avec le
 * MÊME curseur (un seul curseur par appel de l'émetteur, TCK-2952) ; une clé sans le canal ferait
 * taire la seconde copie, et l'écran abonné au canal personnel ne l'apprendrait jamais.
 *
 * Un objet par session : la connexion suivante repart d'une mémoire vide.
 */
export class Curseurs {
  private readonly vus = new Map<string, string>();

  /** `true` si le signal est plus récent que le dernier vu (et le retient) ; `false` s'il est plus ancien ou égal. */
  retenir(canal: string, signal: SignalTempsReel): boolean {
    const cle = `${canal}\n${signal.subject}\n${signal.event}`;
    const dernier = this.vus.get(cle);
    if (dernier !== undefined && signal.cursor <= dernier) return false;
    this.vus.set(cle, signal.cursor);
    return true;
  }
}
