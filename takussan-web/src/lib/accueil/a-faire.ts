import { ApiError } from '@/lib/api';
import { AGING_BUCKETS, type AgingBalance, type AgingBucket } from '@/lib/queries/agency-reporting';

/**
 * TCK-2624 (ADR-0096) — « À faire maintenant » de l'accueil : la partie PURE. Elle décide quelles
 * files ont une ligne, quand dire « Tout est à jour », et met en mots ce que l'API rend en chiffres
 * (tranches d'impayés, état d'un agent, « il y a 2 h »).
 *
 * ⚠ **« À faire » ne liste que l'inachevé** : une file vide n'a pas de ligne. Et « Tout est à jour »
 * ne se dit que lorsque CHAQUE file a répondu, à zéro : une file en panne ou encore en chargement
 * n'est pas une file vide — l'écrire « à jour » serait un mensonge tranquille (le défaut que
 * nommait déjà l'ancien bloc de files d'attente de la vue d'agence, TCK-375).
 */

/** L'état d'une file lue : en chargement, en échec, ou son total. */
export type EtatDeFile = { readonly etat: 'chargement' } | { readonly etat: 'echec' } | { readonly etat: 'pret'; readonly total: number };

/** Ce qu'une requête expose, réduit à ce qui fait l'état d'une file. */
interface RequeteLue<T> {
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly data?: T;
}

/**
 * L'état d'une file à partir de sa requête. Une erreur de RELECTURE garde l'ancienne réponse chez
 * react-query : elle reste lisible, la file n'est pas « en échec ». Une requête désactivée (file
 * qui ne s'applique pas) est à traiter AVANT, en ne la passant pas.
 */
export function etatDeLaRequete<T>(q: RequeteLue<T>, total: (data: T) => number): EtatDeFile {
  if (q.data !== undefined) return { etat: 'pret', total: total(q.data) };
  if (q.isError) return { etat: 'echec' };
  return { etat: 'chargement' };
}

/** Ce que le bloc rend : des lignes, ses squelettes, ses erreurs seules, ou « Tout est à jour ». */
export type EtatDuBloc = 'lignes' | 'chargement' | 'echec' | 'aJour';

export function etatDuBloc(files: readonly EtatDeFile[]): EtatDuBloc {
  if (files.some((f) => f.etat === 'pret' && f.total > 0)) return 'lignes';
  if (files.some((f) => f.etat === 'chargement')) return 'chargement';
  if (files.some((f) => f.etat === 'echec')) return 'echec';
  return 'aJour';
}

/** Le total d'une file qui a répondu ; 0 sinon. */
export function totalDe(f: EtatDeFile): number {
  return f.etat === 'pret' ? f.total : 0;
}

/** Une file a une ligne : elle a répondu, et elle n'est pas vide. */
export function aUneLigne(f: EtatDeFile): f is { readonly etat: 'pret'; readonly total: number } {
  return f.etat === 'pret' && f.total > 0;
}

/**
 * Un geste refusé par l'API (403) : il est retiré, et la ligne mène à l'objet (« Voir »). Tout autre
 * échec (créneau pris, réseau) se dit, et la ligne garde son geste.
 */
export function estUnRefus(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403;
}

/* ─────────────────────────────────────────── Impayés ─────────────────────────────────────────── */

/** Les tranches de `finance/aging`, dans l'ordre où la phrase les dit (de la plus jeune). */
export type CleDeTranche = AgingBucket;

/**
 * « 9 de moins de 30 jours · 3 entre 31 et 60 · 4 de plus de 90 » : les tranches non vides, dans
 * l'ordre de l'âge. Une tranche vide se tait.
 */
export function tranchesNonVides(aging: Pick<AgingBalance, 'buckets'>): readonly { readonly cle: CleDeTranche; readonly n: number }[] {
  return AGING_BUCKETS.map((cle) => ({ cle, n: aging.buckets[cle]?.count ?? 0 })).filter((t) => t.n > 0);
}

/* ──────────────────────────────────────────── Le temps ──────────────────────────────────────────── */

/** « il y a 5 min », « il y a 2 h », « hier », « il y a 3 j » : l'âge d'une attente. */
export type Anciennete = { readonly unite: 'min' | 'h' | 'j'; readonly n: number } | { readonly unite: 'hier' };

export function anciennete(depuis: string, maintenant: Date): Anciennete {
  const minutes = Math.max(0, Math.floor((maintenant.getTime() - Date.parse(depuis)) / 60_000));
  if (minutes < 60) return { unite: 'min', n: Math.max(1, minutes) };
  if (minutes < 24 * 60) return { unite: 'h', n: Math.floor(minutes / 60) };
  const jours = Math.floor(minutes / (24 * 60));
  return jours === 1 ? { unite: 'hier' } : { unite: 'j', n: jours };
}

/* ───────────────────────────────────────── L'équipe du jour ───────────────────────────────────────── */

/** Une ligne de `GET /api/agencies/{agency}/team-today` (TCK-2623). */
export interface AgentDuJour {
  readonly user_id: number;
  readonly name: string | null;
  readonly avatar_url: string | null;
  readonly visits_today_count: number;
  readonly first_visit_at: string | null;
  readonly open_leads_count: number;
  readonly current_absence: { readonly ends_at: string; readonly substitute: { readonly id: number; readonly name: string } | null } | null;
}

export interface EquipeDuJour {
  readonly date: string;
  readonly agents: readonly AgentDuJour[];
}

/**
 * L'état d'un agent, en une ligne : son absence d'abord (« En congé jusqu'au 13 nov. »), sinon sa
 * première visite du jour (« Première visite à 09:30 »), sinon rien — le front n'invente pas « Au
 * bureau », que l'API ne sait pas.
 */
export type EtatDeLAgent = { readonly genre: 'conge'; readonly fin: string } | { readonly genre: 'premiereVisite'; readonly a: string } | { readonly genre: 'rien' };

export function etatDeLAgent(a: AgentDuJour): EtatDeLAgent {
  if (a.current_absence) return { genre: 'conge', fin: a.current_absence.ends_at };
  if (a.first_visit_at) return { genre: 'premiereVisite', a: a.first_visit_at };
  return { genre: 'rien' };
}

/* ───────────────────────────────────────── Le bien d'une rangée ───────────────────────────────────────── */

/**
 * « Villa contemporaine · Almadies », sans redire le quartier quand le titre le porte déjà : sur la
 * démo, « Appartement meublé Point E » donnait « … Point E · Point E » (relevé du 2026-11-13). La
 * comparaison ignore la casse et les accents ; le titre vide prend le repli.
 */
export function titreEtQuartier(titre: string | null | undefined, quartier: string | null | undefined, repli: string): string {
  const t = titre?.trim() || repli;
  const q = quartier?.trim();
  if (!q) return t;
  // « Œ » ne se décompose pas en NFD : « Sacré-Cœur » s'écrit aussi « Sacre-Coeur ».
  const plier = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  return plier(t).includes(plier(q)) ? t : `${t} · ${q}`;
}
