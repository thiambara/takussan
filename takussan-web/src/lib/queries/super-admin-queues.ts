import {
  fetchAdminAgencyUpgradePendingCount,
  fetchAdminKycQueue,
  fetchFailedJobs,
  fetchModerationQueue,
} from '@/lib/queries/super-admin';

/**
 * TCK-360 — LES quatre files d'attente de la console super-admin, et le seul endroit où leur
 * compte se demande.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE ET PAS QUATRE `useQuery` AU POINT D'APPEL
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Ces comptes sont lus à DEUX endroits qui ne se voient pas : la section « files » de l'accueil
 * et les badges de `SuperAdminSidebar`, qui sont montés en même temps sur `/super-admin`. Deux
 * `queryKey` divergentes, ce sont deux requêtes réseau pour le même nombre — et, le jour d'une
 * décision, un badge qui se rafraîchit pendant que la ligne d'en face reste périmée. La clé de
 * cache EST le point de rendez-vous : elle se déclare une fois.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI `per_page=1` ET NON UN ENDPOINT DE COMPTAGE DÉDIÉ
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le ticket envisageait d'ouvrir un endpoint de comptage sur le patron de
 * `agency-upgrade-requests/pending-count`. Mesuré le 2026-08-27 : inutile. Les trois autres files
 * passent par `Controller::paginated()`, donc par `App\Http\Responses\PaginationMeta`, dont
 * `total` est une des QUATRE clés canoniques garanties sur toute réponse paginée de cette API
 * (TCK-304, gardée par `scripts/check-pagination-envelope.mjs`). Le compte est déjà là ; demander
 * une page d'un élément le lit sans charger la file.
 *
 * `agency-upgrade-requests` garde son endpoint dédié : il existe, il est plus direct, et le
 * remplacer par une page d'un élément serait une régression pour rien.
 *
 * ⚠ Les paramètres de comptage doivent rester **identiques** à ceux de la page de destination,
 * sans quoi le nombre affiché n'est pas celui qu'on trouvera en cliquant : `filter[status]=
 * submitted` pour le KYC (défaut de `fetchAdminKycQueue`), aucun filtre pour la modération (la
 * file EST l'ensemble `pending` + `flagged`).
 */

/** Cadence retenue par TCK-268 pour le badge d'upgrade, reconduite à l'identique. */
export const QUEUE_REFETCH_INTERVAL_MS = 60_000;
export const QUEUE_STALE_TIME_MS = 30_000;

export type SuperAdminQueueKey =
  | 'kyc-pending'
  | 'moderation-pending'
  | 'upgrade-requests-pending'
  | 'failed-jobs';

interface QueueDefinition {
  /**
   * Clé react-query. Le PREMIER segment après `super-admin` est celui qu'invalident déjà les
   * écrans de décision (`invalidateQueries({ queryKey: ['super-admin', 'moderation'] })`) : le
   * compte est donc rafraîchi immédiatement après une décision, sans nouveau câblage.
   */
  readonly queryKey: readonly unknown[];
  readonly queryFn: () => Promise<number>;
  /** Destination du clic — la vue déjà filtrée qui permet de TRAITER la file. */
  readonly href: string;
}

export const SUPER_ADMIN_QUEUES: Record<SuperAdminQueueKey, QueueDefinition> = {
  'kyc-pending': {
    queryKey: ['super-admin', 'kyc', 'pending-count'],
    queryFn: async () => (await fetchAdminKycQueue({ perPage: 1 })).meta.total,
    href: '/super-admin/kyc',
  },
  'moderation-pending': {
    queryKey: ['super-admin', 'moderation', 'pending-count'],
    queryFn: async () => (await fetchModerationQueue({ perPage: 1 })).meta.total,
    href: '/super-admin/moderation',
  },
  'upgrade-requests-pending': {
    queryKey: ['super-admin', 'agency-upgrade-requests', 'pending-count'],
    queryFn: fetchAdminAgencyUpgradePendingCount,
    // `?status=pending` : la page ouvre sur « toutes » par défaut, et un compte de file qui mène
    // à une liste non filtrée n'est pas une file, c'est un raccourci.
    href: '/super-admin/agency-upgrade-requests?status=pending',
  },
  'failed-jobs': {
    queryKey: ['super-admin', 'failed-jobs', 'count'],
    queryFn: async () => (await fetchFailedJobs({ perPage: 1 })).meta.total,
    // TCK-365 — la console des jobs échoués a QUITTÉ `/system/health` : cette cible-là ne porte
    // plus ni table ni bouton « Rejouer ». Un compte de file qui mène à une page où la file
    // n'est plus n'est pas une porte, c'est un cul-de-sac — et il l'est resté un temps parce
    // qu'un test vert asseyait l'ancienne cible.
    href: '/super-admin/system/jobs',
  },
};

/** L'ordre d'affichage sur l'accueil : du plus bloquant pour un tiers au plus interne. */
export const SUPER_ADMIN_QUEUE_ORDER: readonly SuperAdminQueueKey[] = [
  'kyc-pending',
  'upgrade-requests-pending',
  'moderation-pending',
  'failed-jobs',
];

export function queueCountQueryOptions(queue: SuperAdminQueueKey) {
  const definition = SUPER_ADMIN_QUEUES[queue];

  return {
    queryKey: definition.queryKey,
    queryFn: definition.queryFn,
    refetchInterval: QUEUE_REFETCH_INTERVAL_MS,
    staleTime: QUEUE_STALE_TIME_MS,
  };
}
