import { densiteDeLAdresse, pageDeLAdresse } from '@/components/payments/pagination-de-l-adresse';
import type { FetchOwnersParams } from '@/lib/queries/owners';

/**
 * TCK-2641 — l'état du carnet des bailleurs, porté par l'URL (`?q=`, `?vue=`, `?page=`, `?per_page=`) :
 * la page serveur le lit, la liste l'écrit. Une valeur inconnue vaut la valeur par défaut, absente de
 * l'URL.
 *
 * TCK-2815 — la page et la densité se lisent par `pagination-de-l-adresse` (TCK-2805), la lecture
 * partagée de ce que `PropertyPagination` écrit : jusque-là, `perPage = 20` partait toujours, et
 * choisir 50 lignes n'en montrait que 20.
 */
export const VUES_DU_CARNET = ['tous', 'reste', 'invitations'] as const;
export type VueDuCarnet = (typeof VUES_DU_CARNET)[number];

/**
 * TCK-2910 — « Filtres et tri » du téléphone : le tri du carnet (`?tri=`), parmi les SEULS tris que
 * `GET /api/owners` accepte (`name`, `-remaining_to_pay`, `-last_payout_at`) — jamais trié côté client.
 * Absent, c'est le tri par défaut : le reste à verser pour qui lit le relevé, le nom sinon.
 */
export const TRIS_DU_CARNET = ['nom', 'reste', 'versement'] as const;
export type TriDuCarnet = (typeof TRIS_DU_CARNET)[number];

/** Les tris d'argent n'ont de sens que pour qui lit le relevé : l'API ne les rend à personne d'autre. */
export function trisOfferts(lectureArgent: boolean): readonly TriDuCarnet[] {
  return lectureArgent ? TRIS_DU_CARNET : ['nom'];
}

export function triParDefaut(lectureArgent: boolean): TriDuCarnet {
  return lectureArgent ? 'reste' : 'nom';
}

const SORT_DE_L_API: Record<TriDuCarnet, string> = { nom: 'name', reste: '-remaining_to_pay', versement: '-last_payout_at' };

export interface EtatDuCarnet {
  readonly recherche: string;
  readonly vue: VueDuCarnet;
  /** TCK-2910 — `null` : le tri par défaut du lecteur. */
  readonly tri?: TriDuCarnet | null;
  readonly page: number;
  /** TCK-2815 — 10, 20 ou 50 (`?per_page=`) ; toute autre valeur vaut 20. */
  readonly parPage: number;
}

type Brut = Record<string, string | string[] | undefined>;

function premiere(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export function lireLeCarnet(params: Brut): EtatDuCarnet {
  const recherche = (premiere(params.q) ?? '').trim();
  const vue = premiere(params.vue);
  const tri = premiere(params.tri);
  const adresse = { get: (nom: string) => premiere(params[nom]) ?? null };
  return {
    recherche,
    vue: (VUES_DU_CARNET as readonly string[]).includes(vue ?? '') ? (vue as VueDuCarnet) : 'tous',
    tri: (TRIS_DU_CARNET as readonly string[]).includes(tri ?? '') ? (tri as TriDuCarnet) : null,
    page: pageDeLAdresse(adresse),
    parPage: densiteDeLAdresse(adresse),
  };
}

/**
 * Les paramètres de `GET /api/owners` pour un état du carnet.
 *
 * - « Avec reste à verser » : `filter[has_remaining]=1`, jugé par l'API sur tout le carnet ;
 * - « Invitations » : les brouillons (`status=draft`), l'invitation en cours ;
 * - le tri suit le reste à verser pour qui lit le relevé (`lectureArgent`) ; sinon l'API ne range
 *   plus que par id (TCK-2640, vérification adverse), et le nom est le seul ordre qui dise quelque
 *   chose. TCK-2910 : `?tri=` le choisit, parmi les tris offerts au lecteur.
 */
export function parametresDuCarnet(agencyId: number, etat: EtatDuCarnet, lectureArgent: boolean, perPage = etat.parPage): FetchOwnersParams {
  return {
    agencyId,
    page: etat.page,
    perPage,
    sort: SORT_DE_L_API[triEffectif(etat, lectureArgent)],
    ...(etat.recherche ? { search: etat.recherche } : {}),
    ...(etat.vue === 'reste' ? { hasRemaining: true } : {}),
    ...(etat.vue === 'invitations' ? { status: 'draft' as const } : {}),
  };
}

/** TCK-2910 — le tri appliqué : celui de l'URL s'il est offert au lecteur, sinon le tri par défaut. */
export function triEffectif(etat: EtatDuCarnet, lectureArgent: boolean): TriDuCarnet {
  return etat.tri && trisOfferts(lectureArgent).includes(etat.tri) ? etat.tri : triParDefaut(lectureArgent);
}
