import type { FetchAdminUsersParams } from '@/lib/queries/admin-users';
import type { AdminAgencyUserRow, AdminUserStatusFilter } from '@/types/admin-users';

/**
 * TCK-2667 — l'état de `/app/agency/team`, porté par l'URL (une vue se partage par un lien).
 *
 * | Clé                | Valeurs                                    | Défaut                         |
 * |--------------------|--------------------------------------------|--------------------------------|
 * | `vue`              | `invitations`, `performance`               | la liste des membres           |
 * | `filter[role]`     | `agent`, `agency_admin` (une pastille)     | le personnel (`agent,agency_admin`) |
 * | `filter[absent]`   | `1` (la pastille « Absents »)              | —                              |
 * | `filter[search]`, `filter[status]`, `sort`, `page` | ceux d'avant       |                                |
 * | `membre`           | l'id du membre dont la fiche est ouverte   | —                              |
 *
 * La liste ne montre QUE le personnel (décision 2 de la famille) : `filter[role]=owner`, l'ancien
 * onglet « Propriétaires », n'est plus une vue d'ici — la page des bailleurs (`/app/owners`) porte
 * leurs gestes d'adhésion depuis TCK-2641 (`AccesEtDepart`). Le lien entrant y est renvoyé.
 */
export type Pastille = 'tous' | 'agents' | 'admins' | 'absents';
export type VueDeLEquipe = 'membres' | 'invitations' | 'performance';

export const PAGE_DES_BAILLEURS = '/app/owners';
export const TAILLE_DE_PAGE = 20;

export interface EtatDeLEquipe {
  readonly vue: VueDeLEquipe;
  readonly pastille: Pastille;
  readonly recherche: string;
  readonly statut: AdminUserStatusFilter;
  readonly tri: string;
  readonly page: number;
  readonly membre: number | null;
  /** L'ancien onglet des bailleurs : la page le renvoie à `/app/owners`. */
  readonly versLesBailleurs: boolean;
}

interface Lecture {
  get(cle: string): string | null;
}

const STATUTS: readonly AdminUserStatusFilter[] = ['active', 'inactive', 'blocked'];

function entierPositif(valeur: string | null): number | null {
  if (valeur === null || !/^\d+$/.test(valeur)) return null;
  const n = Number(valeur);
  return n > 0 ? n : null;
}

export function lireLEtat(params: Lecture): EtatDeLEquipe {
  const role = params.get('filter[role]') ?? '';
  const vue = params.get('vue');
  const statut = params.get('filter[status]') ?? '';
  return {
    vue: vue === 'performance' ? 'performance' : vue === 'invitations' ? 'invitations' : 'membres',
    pastille: params.get('filter[absent]') === '1' ? 'absents' : role === 'agent' ? 'agents' : role === 'agency_admin' ? 'admins' : 'tous',
    recherche: params.get('filter[search]') ?? '',
    statut: (STATUTS as readonly string[]).includes(statut) ? (statut as AdminUserStatusFilter) : '',
    tri: params.get('sort') ?? '-created_at',
    page: entierPositif(params.get('page')) ?? 1,
    membre: entierPositif(params.get('membre')),
    versLesBailleurs: role === 'owner',
  };
}

/** Les paramètres de `GET /api/users` pour la liste : le personnel seul, son résumé, sa pastille. */
export function requeteDeLaListe(etat: EtatDeLEquipe): FetchAdminUsersParams {
  return {
    search: etat.recherche || undefined,
    status: etat.statut || undefined,
    role: etat.pastille === 'agents' ? 'agent' : etat.pastille === 'admins' ? 'agency_admin' : 'agent,agency_admin',
    absent: etat.pastille === 'absents',
    resume: true,
    sort: etat.tri,
    page: etat.page,
    perPage: TAILLE_DE_PAGE,
  };
}

/** Les clés d'URL que pose une pastille (les autres filtres restent ; la page et la fiche tombent). */
export function clesDeLaPastille(pastille: Pastille): Record<string, string | null> {
  return {
    'filter[role]': pastille === 'agents' ? 'agent' : pastille === 'admins' ? 'agency_admin' : null,
    'filter[absent]': pastille === 'absents' ? '1' : null,
    vue: null,
    page: null,
    membre: null,
  };
}

/* ── Ce que la ligne d'un membre dit de lui ─────────────────────────────────────────────────── */

export type EtatDuMembre = 'actif' | 'absent' | 'suspendu';

/** Les profils du membre DANS cette agence (agent et administrateur : le personnel). */
function profilsIci(row: AdminAgencyUserRow, agencyId: number) {
  return [...(row.agent_profiles ?? []), ...(row.agency_admin_profiles ?? [])].filter((p) => p.agency_id === agencyId);
}

/**
 * Suspendu : aucun profil de personnel actif ici et au moins un que la suspension a posé (la règle
 * de `suspensionOffer`). Absent : une absence en cours le remplace. Sinon, actif.
 */
export function etatDuMembre(row: AdminAgencyUserRow, agencyId: number): EtatDuMembre {
  const ici = profilsIci(row, agencyId);
  if (ici.length > 0 && !ici.some((p) => p.status === 'active') && ici.some((p) => p.status === 'suspended' || p.status === 'blocked')) {
    return 'suspendu';
  }
  if (row.current_absence) return 'absent';
  return 'actif';
}

/** Le rôle affiché : administrateur s'il tient un profil d'admin ici, agent sinon. */
export function roleDuMembre(row: AdminAgencyUserRow, agencyId: number): 'agency_admin' | 'agent' {
  return (row.agency_admin_profiles ?? []).some((p) => p.agency_id === agencyId) ? 'agency_admin' : 'agent';
}

/* ── « En ligne hier » : la dernière connexion, dite comme une présence ──────────────────────── */

export type Presence =
  | { readonly forme: 'jamais' }
  | { readonly forme: 'aujourdhui' }
  | { readonly forme: 'hier' }
  | { readonly forme: 'ilYa'; readonly jours: number }
  | { readonly forme: 'le'; readonly date: string };

const JOUR_MS = 86_400_000;

/** Le jour de Dakar (UTC+0 toute l'année) d'un instant, en jours depuis l'époque. */
function jourDe(instant: Date): number {
  return Math.floor(instant.getTime() / JOUR_MS);
}

/**
 * Aujourd'hui, hier, « il y a N j » jusqu'à six jours, puis la date. `maintenant` sert aux tests.
 */
export function presenceDe(derniereConnexion: string | null, maintenant: Date = new Date()): Presence {
  if (!derniereConnexion) return { forme: 'jamais' };
  const instant = new Date(derniereConnexion);
  if (Number.isNaN(instant.getTime())) return { forme: 'jamais' };
  const ecart = jourDe(maintenant) - jourDe(instant);
  if (ecart <= 0) return { forme: 'aujourdhui' };
  if (ecart === 1) return { forme: 'hier' };
  if (ecart < 7) return { forme: 'ilYa', jours: ecart };
  return { forme: 'le', date: derniereConnexion };
}
