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

export interface EtatDuCarnet {
  readonly recherche: string;
  readonly vue: VueDuCarnet;
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
  const adresse = { get: (nom: string) => premiere(params[nom]) ?? null };
  return {
    recherche,
    vue: (VUES_DU_CARNET as readonly string[]).includes(vue ?? '') ? (vue as VueDuCarnet) : 'tous',
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
 *   chose.
 */
export function parametresDuCarnet(agencyId: number, etat: EtatDuCarnet, lectureArgent: boolean, perPage = etat.parPage): FetchOwnersParams {
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
