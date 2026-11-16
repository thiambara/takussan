import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { nomAffichable } from '@/lib/identite';
import { lireToutesLesPages, PAR_PAGE_MAX } from '@/lib/queries/toutes-les-pages';
import type { PaginatedResponse } from '@/types/api';

/**
 * TCK-616 — les choix de « Changer l'agent responsable » (barre d'actions groupées de la liste des biens) :
 * le PERSONNEL ACTIF de l'agence, lu au serveur — jamais une liste déduite des biens de la page, qui
 * proposait des bailleurs (refusés ligne à ligne, `invalid_target`) et omettait un agent sans bien sur la page.
 *
 * `GET /api/agencies/{agency}/members?filter[assignable]=1` est la règle de cible du lot écrite en SQL
 * (`User::assignableFilter`, celle d'`isStaffAt` que `ResponsibleAgentAssigner::cibleAdmise` applique) :
 * agents ET administrateurs actifs, délégations en vigueur, comptes joignables. `GET …/team` ne lit que
 * les profils d'agent, de tout statut : il omettait l'administrateur et proposait le suspendu.
 *
 * Qui ne lit pas cette liste (un agent sans `crm.assign` : 403) ne se voit proposer que lui-même — la
 * seule cible qu'il connaisse sans elle ; une panne fait de même. Sans agence (super-admin), aucune
 * liste : le sélecteur ne s'affiche pas.
 */
export type ResponsableDuLot = { readonly id: number; readonly name: string };

type MembreLu = { id: number; first_name: string | null; last_name: string | null };

export async function fetchResponsablesDuLot(
  token: string,
  agencyId: number | null | undefined,
  moi: { readonly id: number; readonly name: string } | null,
): Promise<ResponsableDuLot[]> {
  if (!agencyId) return [];
  const params = {
    filter: { assignable: 1 },
    fields: { users: ['id', 'first_name', 'last_name'] },
    sort: ['id'],
  };
  try {
    const page = await lireToutesLesPages((numero) =>
      apiRequest<PaginatedResponse<MembreLu>>(
        cheminApi`/api/agencies/${agencyId}/members${requete(buildQueryString({ ...params, page: numero, per_page: PAR_PAGE_MAX }))}`,
        { token },
      ),
    );
    return page.data
      .map((u) => ({ id: u.id, name: nomAffichable(u) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  } catch {
    return moi ? [moi] : [];
  }
}
