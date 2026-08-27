import { apiRequest, buildQueryString } from '@/lib/api';
import { fetchAgencyKyc } from '@/lib/queries/kyc';
import { fetchPropertyModerationQueue } from '@/lib/queries/property-moderation';
import type { PaginatedResponse } from '@/types/api';
import type { KycDossierResponse, KycDossierStatus } from '@/types/super-admin';

/**
 * TCK-375 — LES files d'attente de la console agence, et le SEUL endroit où leur compte se
 * demande.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN MODULE ET PAS UN `useQuery` PAR POINT D'APPEL
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Le compte de la modération est lu à DEUX endroits qui sont montés en même temps sur `/admin`
 * et qui ne se voient pas : le badge d'`AdminSidebar` (sondage de 60 s posé par TCK-098) et le
 * bloc de files de l'accueil. Deux `queryKey` divergentes, ce sont deux requêtes réseau pour le
 * même nombre — et, le jour d'une décision de modération, un badge qui se rafraîchit pendant que
 * la ligne d'en face reste périmée. **La clé de cache EST le point de rendez-vous** : elle se
 * déclare une fois, ici, et les deux appelants la prennent d'ici.
 *
 * C'est la leçon de la revue adverse du jumeau super-admin (TCK-360) : elle a montré qu'une
 * deuxième `queryKey` pour le même nombre désynchronise le badge et la tuile, sans qu'aucun test
 * de rendu pris isolément ne s'en aperçoive.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI `per_page=1` ET AUCUN ENDPOINT DE COMPTAGE
 * ────────────────────────────────────────────────────────────────────────────────────────────
 *
 * `total` est l'une des quatre clés canoniques garanties sur TOUTE réponse paginée de cette API
 * (TCK-304, gardée par `scripts/check-pagination-envelope.mjs`). Demander une page d'UN élément
 * lit donc le compte sans charger la file, et sans qu'aucune route neuve soit ouverte.
 *
 * ⚠ Le corollaire est une règle, pas une remarque : **le compte se demande avec exactement les
 * mêmes paramètres que la page de destination**, sans quoi le nombre affiché n'est pas celui
 * qu'on trouvera en cliquant.
 *
 * ⚠ Et le compte se lit dans `meta.total`, JAMAIS dans `data.length` : avec `per_page=1`,
 * `data.length` vaut 1 dès qu'il y a quoi que ce soit et 0 sinon. Un compteur dérivé de la liste
 * rapatriée rendrait « 1 » pour une file de quarante.
 */

/** Cadence du sondage de `AdminSidebar` (TCK-098), reconduite à l'identique. */
export const AGENCY_QUEUE_REFETCH_INTERVAL_MS = 60_000;
export const AGENCY_QUEUE_STALE_TIME_MS = 30_000;

/**
 * La clé du compte de modération des biens.
 *
 * Elle est **inchangée** depuis TCK-098 (`AdminSidebar`) : la déplacer ici sans la renommer est
 * ce qui permet au badge et à la tuile de partager le cache sans qu'aucun autre appelant n'ait à
 * bouger.
 */
export const PROPERTY_MODERATION_COUNT_KEY = ['property-moderation', 'pending-count'] as const;

/**
 * La clé du compte d'invitations en attente.
 *
 * Le premier segment est celui qu'invalide déjà la console Équipe (`['agency-invitations']`) :
 * une relance ou une révocation rafraîchit donc ce compte sans nouveau câblage.
 */
export const AGENCY_INVITATIONS_COUNT_KEY = ['agency-invitations', 'pending-count'] as const;

/** La clé du dossier KYC — la MÊME que celle d'`AgencyKycClient`, pour la même raison. */
export const agencyKycKey = (agencyId: number) => ['agency', agencyId, 'kyc'] as const;

/**
 * Le compte des biens en attente de modération.
 *
 * ⚠ Lit `meta.total` et non `meta.pending_count`. Mesuré le 2026-08-27 :
 * `PropertyModerationController.php:62` écrit littéralement
 * `['pending_count' => $paginator->total()]` — les deux nombres sont le MÊME, mais seul `total`
 * est garanti par l'enveloppe de pagination (TCK-304). *Lire une clé d'agrément là où une clé
 * canonique dit la même chose, c'est se lier à celle des deux qui peut disparaître.*
 *
 * ⚠ Ce compte est un SONDAGE de 60 s monté sur deux écrans : c'est lui qui a rendu coûteux
 * l'écart de forme de `fetchPropertyModerationQueue`, qui ne nommait aucune colonne. Le fetcher
 * les nomme depuis la revue de TCK-375 — et son docblock dit ce que le serveur en fait
 * aujourd'hui, à savoir rien : la route n'instancie pas spatie. C'est un delta d'API, pas un
 * silence.
 */
export async function fetchPropertyModerationCount(token: string): Promise<number> {
  const response = await fetchPropertyModerationQueue(token, { perPage: 1 });
  return response.meta.total;
}

/**
 * Le compte des invitations SANS RÉPONSE de l'agence active.
 *
 * Trois mesures gouvernent la forme de cette requête, et aucune n'était dans le ticket :
 *
 *  1. **Le statut « en attente » s'écrit `sent`**, pas `pending` : `InvitationStatus` (backend)
 *     n'a que `sent | accepted | expired | revoked`. `accepted` est devenu un membre, `revoked`
 *     et `expired` sont terminaux.
 *  2. **Aucun `filter[agency_id]` n'est envoyé**, délibérément : `InvitationController::
 *     visibleScope()` borne déjà la requête d'un `agency_admin` à son agence. Envoyer le filtre
 *     ne resserrerait rien et suggérerait que la portée est un choix du front — alors qu'elle
 *     est la frontière d'isolation (CLAUDE.md, principe n°2).
 *  3. **`sent` inclut les invitations périmées jusqu'à une heure.** `Invitation::scopePending()`
 *     ajoute `expires_at > now()`, mais `expires_at` n'est PAS dans `$requestFilterable`
 *     (`['status','agency_id','role','email','invited_by']`) : le front ne peut pas l'exprimer.
 *     Le cron `invitations:expire` (horaire, `routes/console.php:69`) bascule `sent → expired`,
 *     donc l'écart est borné par sa cadence — et c'est la même donnée que celle de la console
 *     Équipe, ce qui est la propriété qui compte : les deux écrans ne peuvent pas se contredire.
 */
export async function fetchPendingInvitationsCount(token: string): Promise<number> {
  const qs = buildQueryString({
    // Sparse fieldset minimal : on ne lit que `meta`, mais l'API refuse un `fields` vide et le
    // contrat du dépôt exige qu'une lecture nomme ses colonnes.
    fields: { invitations: ['id'] },
    filter: { status: 'sent' },
    per_page: 1,
  });
  const response = await apiRequest<PaginatedResponse<{ id: number }>>(
    `/api/invitations${qs ? `?${qs}` : ''}`,
    { token },
  );
  return response.meta.total;
}

/**
 * Les statuts de dossier KYC qui APPELLENT UN GESTE de l'admin d'agence.
 *
 * `submitted` n'en est pas : le dossier est chez la plateforme, l'agence n'a rien à faire.
 * `verified` non plus. *Une file d'attente dit ce qui attend QUELQU'UN — encore faut-il dire
 * qui.*
 */
export const KYC_STATUSES_A_TRAITER: readonly KycDossierStatus[] = ['pending', 'rejected'];

export function kycDemandeUnGeste(status: KycDossierStatus | undefined): boolean {
  return status !== undefined && KYC_STATUSES_A_TRAITER.includes(status);
}

const cadence = {
  refetchInterval: AGENCY_QUEUE_REFETCH_INTERVAL_MS,
  staleTime: AGENCY_QUEUE_STALE_TIME_MS,
} as const;

/**
 * Les options du compte de modération — l'UNIQUE définition, partagée par le badge de la barre
 * latérale et la tuile de l'accueil.
 *
 * `enabled` reprend mot pour mot la condition de TCK-098 : `agencyIsStandard !== false`, et non
 * `=== true`. La différence porte : `undefined` veut dire « on n'a pas pu savoir » (panne de
 * `/api/agencies/{id}`), et écraser l'inconnu en `false` faisait disparaître le compteur d'une
 * agence `standard` sur une simple panne passagère.
 */
export function propertyModerationCountQueryOptions(
  token: string | null,
  agencyIsStandard: boolean | undefined,
) {
  return {
    queryKey: PROPERTY_MODERATION_COUNT_KEY,
    queryFn: () => fetchPropertyModerationCount(token ?? ''),
    enabled: Boolean(token) && agencyIsStandard !== false,
    ...cadence,
  };
}

export function pendingInvitationsCountQueryOptions(
  token: string | null,
  agencyIsStandard: boolean | undefined,
) {
  return {
    queryKey: AGENCY_INVITATIONS_COUNT_KEY,
    queryFn: () => fetchPendingInvitationsCount(token ?? ''),
    enabled: Boolean(token) && agencyIsStandard !== false,
    ...cadence,
  };
}

/**
 * Le dossier KYC de l'agence — une file d'UNE pièce, pas un compte.
 *
 * ⚠ **La `queryFn` rend le dossier ENTIER, pas le statut**, et c'est structurel : la clé est
 * celle qu'`AgencyKycClient` emploie déjà (`['agency', id, 'kyc']`), donc l'entrée de cache est
 * partagée. Une seconde `queryFn` sous la même clé rendant une forme plus étroite ferait lire à
 * l'écran KYC — selon lequel des deux monte en premier — une chaîne là où il attend un dossier.
 * L'étroitissement se fait par `select`, qui ne touche pas au cache.
 *
 * Pas de `refetchInterval` : un dossier ne change pas tout seul côté agence — il change quand
 * l'admin dépose une pièce (l'écran KYC invalide alors cette clé) ou quand la plateforme
 * tranche, ce qui n'est pas un événement de la minute.
 */
export function agencyKycQueryOptions(agencyId: number | null) {
  return {
    queryKey: agencyKycKey(agencyId ?? 0),
    queryFn: () => fetchAgencyKyc(agencyId as number),
    select: (response: KycDossierResponse): KycDossierStatus => response.data.status,
    enabled: typeof agencyId === 'number',
    staleTime: AGENCY_QUEUE_STALE_TIME_MS,
  };
}
