import type { FetchOwnersParams } from '@/lib/queries/owners';

/**
 * TCK-2641 — l'état du carnet des bailleurs, porté par l'URL (`?q=`, `?vue=`, `?page=`) : la page
 * serveur le lit, la liste l'écrit. Une valeur inconnue vaut la valeur par défaut, absente de l'URL.
 */
export const VUES_DU_CARNET = ['tous', 'reste', 'invitations'] as const;
export type VueDuCarnet = (typeof VUES_DU_CARNET)[number];

export interface EtatDuCarnet {
  readonly recherche: string;
  readonly vue: VueDuCarnet;
  readonly page: number;
}

type Brut = Record<string, string | string[] | undefined>;

function premiere(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur;
}

export function lireLeCarnet(params: Brut): EtatDuCarnet {
  const recherche = (premiere(params.q) ?? '').trim();
  const vue = premiere(params.vue);
  const page = premiere(params.page);
  return {
    recherche,
    vue: (VUES_DU_CARNET as readonly string[]).includes(vue ?? '') ? (vue as VueDuCarnet) : 'tous',
    page: page && /^[1-9]\d*$/.test(page) ? Number(page) : 1,
  };
}

/**
 * Les paramètres de `GET /api/owners` pour un état du carnet.
 *
 * - « Avec reste à verser » : `filter[has_remaining]=1`, jugé par l'API sur tout le carnet ;
 * - « Invitations » : les brouillons (`status=draft`), l'invitation en cours ;
 * - le tri suit le reste à verser pour qui lit le relevé (`lectureArgent`) ; sinon l'API ne range
 *   plus que par id (TCK-2640, vérification adverse), et le nom est le seul ordre qui dise quelque
 *   chose.
 */
export function parametresDuCarnet(agencyId: number, etat: EtatDuCarnet, lectureArgent: boolean, perPage = 20): FetchOwnersParams {
  return {
    agencyId,
    page: etat.page,
    perPage,
    sort: lectureArgent ? '-remaining_to_pay' : 'name',
    ...(etat.recherche ? { search: etat.recherche } : {}),
    ...(etat.vue === 'reste' ? { hasRemaining: true } : {}),
    ...(etat.vue === 'invitations' ? { status: 'draft' as const } : {}),
  };
}
