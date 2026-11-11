'use client';

import { useApiQuery } from '@/hooks/useApiQuery';
import { libelleDe, nomAffichable } from '@/lib/identite';
import { raisonSocialeDe, type OwnerProfileSummary } from '@/lib/queries/owners';
import type { PaginatedResponse } from '@/types/api';

import type { EtatDeRecherche, OptionDeChoix } from './choix';

/**
 * TCK-2659 — les listes des pastilles « Payeur », « Bien » et « Bailleur » des encaissements. Chacune
 * est cherchée au SERVEUR (`filter[search]`), vingt par vingt, et ne part qu'à l'ouverture de sa
 * pastille. Les valeurs sont celles que `GET /api/payments/history` filtre :
 *
 * - Payeur → la fiche client (`filter[payer_id]` : `lease_payments.payer_id`, le client d'une
 *   réservation) ;
 * - Bien → le bien (`filter[entity_type]=property&filter[entity_id]`) ;
 * - Bailleur → le COMPTE du bailleur (`filter[landlord_id]` : `leases.landlord_id`, un `users.id`),
 *   donc `user_id` du profil — un profil sans compte ne reçoit aucun loyer.
 */

const PAR_PAGE = 20;
const CLIENT_FIELDS = ['id', 'first_name', 'last_name', 'email', 'phone'] as const;
const BIEN_FIELDS = ['id', 'title', 'reference_number'] as const;
const BAILLEUR_FIELDS = ['id', 'user_id', 'agency_id', 'status', 'metadata'] as const;
// Le compte inclus ne sert qu'au nom (`libelleDe` : prénom, nom, puis e-mail, puis téléphone).
const COMPTE_FIELDS = ['id', 'first_name', 'last_name', 'email', 'phone'] as const;

interface ClientDeLaListe {
  readonly id: number;
  readonly first_name?: string | null;
  readonly last_name?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
}

interface BienDeLaListe {
  readonly id: number;
  readonly title: string | null;
  readonly reference_number?: string | null;
}

export interface ResultatDeSource {
  readonly options: readonly OptionDeChoix[];
  readonly chargement: boolean;
}

export function useOptionsDesPayeurs(etat: EtatDeRecherche): ResultatDeSource {
  const q = useApiQuery<PaginatedResponse<ClientDeLaListe>>(
    ['argent', 'choix', 'payeurs', etat.requete],
    '/api/customers',
    {
      params: { fields: { customers: CLIENT_FIELDS }, filter: { search: etat.requete || undefined }, per_page: PAR_PAGE },
      enabled: etat.ouvert,
      staleTime: 60_000,
    },
  );
  return {
    options: (q.data?.data ?? []).map((c) => ({ value: String(c.id), label: nomAffichable(c), sansNom: libelleDe(c) === null })),
    chargement: q.isFetching,
  };
}

export function useOptionsDesBiens(etat: EtatDeRecherche): ResultatDeSource {
  const q = useApiQuery<PaginatedResponse<BienDeLaListe>>(
    ['argent', 'choix', 'biens', etat.requete],
    '/api/properties',
    {
      params: { fields: { properties: BIEN_FIELDS }, filter: { search: etat.requete || undefined }, per_page: PAR_PAGE },
      enabled: etat.ouvert,
      staleTime: 60_000,
    },
  );
  return {
    options: (q.data?.data ?? []).map((b) => {
      const nom = b.title?.trim() || b.reference_number?.trim() || null;
      return { value: String(b.id), label: nom ?? `#${b.id}`, sansNom: nom === null };
    }),
    chargement: q.isFetching,
  };
}

export function useOptionsDesBailleurs(etat: EtatDeRecherche, agencyId: number | undefined): ResultatDeSource {
  const q = useApiQuery<PaginatedResponse<OwnerProfileSummary>>(
    ['argent', 'choix', 'bailleurs', agencyId, etat.requete],
    '/api/owners',
    {
      params: {
        fields: { owner_profiles: BAILLEUR_FIELDS, users: COMPTE_FIELDS },
        include: ['user'],
        filter: { agency_id: agencyId, search: etat.requete || undefined },
        per_page: PAR_PAGE,
      },
      enabled: etat.ouvert && agencyId !== undefined,
      staleTime: 60_000,
    },
  );
  return {
    options: (q.data?.data ?? []).flatMap((o) => {
      if (o.user_id === null) return [];
      const compte = o.user ?? { id: o.user_id, ...(o.metadata ?? {}) };
      const nom = raisonSocialeDe(o) ?? libelleDe(compte);
      return [{ value: String(o.user_id), label: nom ?? nomAffichable(compte), sansNom: nom === null }];
    }),
    chargement: q.isFetching,
  };
}
