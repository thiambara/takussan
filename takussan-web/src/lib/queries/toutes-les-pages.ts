import type { PaginatedResponse } from '@/types/api';

/** La borne de l'API (`AbstractModel::PER_PAGE_MAX`). */
export const PAR_PAGE_MAX = 100;

/** Garde-fou de la boucle : 50 pages de 100, bien au-delà de ce qu'un écran de liste affiche. */
export const PAGES_MAX = 50;

/**
 * TCK-1367 (P135.01, angle 135) — lit TOUTES les pages d'une liste paginée de l'API, et les rend
 * sous la forme d'une seule page, comme `fetchAllLeasePayments` de TCK-1178.
 *
 * ⚠ Pour les écrans dessinés pour la liste entière et lus à la demande. Une liste relue en tâche de
 * fond (un `refetchInterval`) ne doit pas passer par ici : chaque relecture repartirait de la page 1.
 *
 * `lirePage` reçoit le numéro de page ; c'est à lui de demander `per_page` = `PAR_PAGE_MAX`.
 * Les pages suivantes sont lues jusqu'à `meta.last_page`, ou jusqu'à `PAGES_MAX`.
 */
export async function lireToutesLesPages<T>(
  lirePage: (page: number) => Promise<PaginatedResponse<T>>,
): Promise<PaginatedResponse<T>> {
  const data: T[] = [];
  let derniere: PaginatedResponse<T> | null = null;
  for (let page = 1; page <= PAGES_MAX; page++) {
    derniere = await lirePage(page);
    data.push(...derniere.data);
    if (page >= (derniere.meta?.last_page ?? 1)) break;
  }
  return {
    data,
    meta: { current_page: 1, last_page: 1, per_page: data.length, total: derniere?.meta?.total ?? data.length },
  };
}
