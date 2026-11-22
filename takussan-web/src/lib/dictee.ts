/**
 * TCK-2880 (et TCK-2903) — LA dictée du produit : la reconnaissance vocale DU NAVIGATEUR
 * (`SpeechRecognition`, ou `webkitSpeechRecognition` sous Chrome et Safari), qui produit du texte.
 * Un seul mécanisme, partagé par la note du compte rendu de visite (TCK-2880) et la note de pièce de
 * l'état des lieux (TCK-2903) : le premier livré l'écrit, le second le réutilise (`useDictee`).
 *
 * Amélioration progressive : sans l'API, aucun bouton de dictée n'est rendu (un bouton qui ne peut
 * pas marcher est un défaut — même règle que `VoiceNoteRecorder`).
 */

/** Ce que le hook lit de la reconnaissance : le strict nécessaire, typé ici (pas de `lib.dom` fiable). */
export interface ResultatDeReconnaissance {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

export interface EvenementDeReconnaissance {
  readonly resultIndex: number;
  readonly results: ArrayLike<ResultatDeReconnaissance>;
}

export interface Reconnaissance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EvenementDeReconnaissance) => void) | null;
  onerror: ((e: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type ConstructeurDeReconnaissance = new () => Reconnaissance;

/** Le constructeur exposé par le navigateur, ou `null`. */
export function constructeurDeReconnaissance(): ConstructeurDeReconnaissance | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: ConstructeurDeReconnaissance; webkitSpeechRecognition?: ConstructeurDeReconnaissance };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** La langue de la reconnaissance : celle de l'interface ; aucun navigateur ne reconnaît le wolof → `fr-FR`. */
export function langueDeDictee(locale: string): string {
  return locale === 'en' ? 'en-US' : 'fr-FR';
}

/**
 * Le texte reconnu ajouté À LA FIN de la note, séparé d'une espace ; la note n'est jamais réécrite.
 * `max` : la borne du champ (le texte ajouté est tronqué, jamais la note déjà saisie).
 */
export function ajouterALaNote(note: string, reconnu: string, max = Number.POSITIVE_INFINITY): string {
  const ajout = reconnu.trim();
  if (!ajout) return note;
  const base = note.replace(/\s+$/, '');
  const suite = base ? `${base} ${ajout}` : ajout;
  return suite.length > max ? suite.slice(0, Math.max(max, base.length)) : suite;
}

/** Les refus de la reconnaissance que l'écran sait dire ; le reste est « autre ». */
export type ErreurDeDictee = 'refusee' | 'reseau' | 'silence' | 'autre';

/** Le code de `SpeechRecognitionErrorEvent.error`, lu ; `aborted` (notre propre arrêt) n'est pas une erreur. */
export function erreurDeDictee(code: string): ErreurDeDictee | null {
  if (code === 'aborted') return null;
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'refusee';
  if (code === 'network') return 'reseau';
  if (code === 'no-speech') return 'silence';
  return 'autre';
}

/** « 0:14 » : la durée dictée, en minutes:secondes. */
export function dureeDictee(secondes: number): string {
  const s = Math.max(0, Math.floor(secondes));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
