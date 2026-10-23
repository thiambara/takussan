import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import {
  requeteFileKyc,
  requeteFileModeration,
  requeteJobsEchoues,
} from '@/lib/queries/super-admin-coque';
import { requeteJournalAudit } from '@/lib/queries/super-admin';
import { SUPER_ADMIN_QUEUES, type SuperAdminQueueKey } from '@/lib/queries/super-admin-queues';
import type { LectureAmorcee } from '@/lib/queries/lectures-amorcees';
import {
  ACTIVITE_RECENTE_ENTREES,
  CLE_ACTIVITE_RECENTE,
  CLE_METRIQUES_SYSTEME,
} from '@/lib/queries/accueil-console-cles';

/**
 * TCK-1828 (P136.05) — ce que l'accueil de `/super-admin` affiche en premier, lu par la page
 * serveur et amorcé dans TanStack (`AmorceLectures`), pour que les trois sections rendent leurs
 * données au premier affichage au lieu de six appels du navigateur après l'hydratation.
 *
 * Les clés sont celles des composants (`ConsoleQueues` par `SUPER_ADMIN_QUEUES`,
 * `SystemMetricsGrid`, `ConsoleRecentActivity`), et les requêtes celles du relais
 * `/api/super-admin/*`, qui relaie vers `/api/admin/*` avec le jeton de l'opérateur.
 */

type Total = { meta: { total: number } };

const COMPTES: Record<SuperAdminQueueKey, (token: string) => Promise<number>> = {
  'kyc-pending': async (token) =>
    (await apiRequest<Total>(cheminApi`/api/admin/kyc?${requeteFileKyc({ perPage: 1 }).toString()}`, { token })).meta.total,
  'moderation-pending': async (token) =>
    (
      await apiRequest<Total>(cheminApi`/api/admin/moderation?${requeteFileModeration({ perPage: 1 }).toString()}`, {
        token,
      })
    ).meta.total,
  'upgrade-requests-pending': async (token) =>
    (await apiRequest<{ count: number }>('/api/admin/agency-upgrade-requests/pending-count', { token })).count,
  'failed-jobs': async (token) =>
    (await apiRequest<Total>(cheminApi`/api/admin/jobs/failed?${requeteJobsEchoues({ perPage: 1 }).toString()}`, { token }))
      .meta.total,
};

/**
 * Les six lectures, en parallèle. Une lecture en échec n'est pas amorcée : le navigateur la lit
 * comme avant, et l'état d'erreur reste le sien.
 */
export async function lireAccueilConsole(token: string): Promise<LectureAmorcee[]> {
  const lectures: Array<[readonly unknown[], () => Promise<unknown>]> = [
    ...(Object.keys(COMPTES) as SuperAdminQueueKey[]).map(
      (file) => [SUPER_ADMIN_QUEUES[file].queryKey, () => COMPTES[file](token)] as [readonly unknown[], () => Promise<unknown>],
    ),
    [CLE_METRIQUES_SYSTEME, () => apiRequest('/api/admin/system/metrics', { token })],
    [
      CLE_ACTIVITE_RECENTE,
      () =>
        apiRequest(cheminApi`/api/admin/audit?${requeteJournalAudit({ perPage: ACTIVITE_RECENTE_ENTREES }).toString()}`, {
          token,
        }),
    ],
  ];
  const resultats = await Promise.allSettled(lectures.map(([, lire]) => lire()));
  const lueA = Date.now();
  return resultats.flatMap((r, i) =>
    r.status === 'fulfilled' ? [{ cle: [...lectures[i][0]], donnee: r.value, lueA }] : [],
  );
}
