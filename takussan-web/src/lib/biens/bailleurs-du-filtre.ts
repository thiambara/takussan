import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { libelleDe, nomAffichable } from '@/lib/identite';
import type { OwnerProfileSummary } from '@/lib/queries/owners';
import { lireToutesLesPages, PAR_PAGE_MAX } from '@/lib/queries/toutes-les-pages';
import type { PaginatedResponse } from '@/types/api';

/**
 * TCK-2908 — les choix de « Tous les bailleurs » (panneau de filtres du mode Gestion, bureau) : les
 * profils de bailleur de l'agence, TOUTES les pages (`GET /api/owners`, lu au rendu serveur).
 *
 * La valeur est l'identifiant du PROFIL (`filter[owner_profile_id]`, TCK-2905), jamais celui du compte :
 * un bailleur invité (`user_id` nul) a ses biens saisis (`pending_owner_profile_id`) et figure ici. Ni
 * filtre de statut : un brouillon d'invitation a lui aussi des biens. Le choix du bailleur de l'assistant
 * (`useBailleursActifs`) est une autre liste — actifs et inscrits seulement, par compte.
 */
export type BailleurDuFiltre = { readonly id: number; readonly name: string };

type ProfilLu = Pick<OwnerProfileSummary, 'id' | 'user_id' | 'metadata' | 'user'>;

export async function fetchBailleursDuFiltre(token: string, agencyId: number): Promise<BailleurDuFiltre[]> {
  const params = {
    fields: { owner_profiles: ['id', 'user_id', 'metadata'] },
    include: ['user'],
    filter: { agency_id: agencyId },
    sort: ['id'],
  };
  const page = await lireToutesLesPages((numero) =>
    apiRequest<PaginatedResponse<ProfilLu>>(
      cheminApi`/api/owners${requete(buildQueryString({ ...params, page: numero, per_page: PAR_PAGE_MAX }))}`,
      { token },
    ),
  );
  return page.data
    .map((p) => ({ id: p.id, name: nomAffichable({ ...p.user, id: p.user_id ?? p.id }, libelleDe(p.metadata)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}
