'use client';

import { useQuery, type QueryKey } from '@tanstack/react-query';
import { useLocale } from 'next-intl';

import { useAuth } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import { apiRequest, type ApiError } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import type { ApiResponse } from '@/types/api';
import type { Lease } from '@/types/lease';
import type { Conversation } from '@/types/message';

import type { ObjetDeLaSalle } from './salle';

/**
 * TCK-2963 — les lectures de la salle. Aucune lecture neuve côté API : la salle se nourrit des lectures
 * existantes de son objet (contrat de données du ticket).
 *
 * ⚠ Pas de `fields[leases]` : un `show` rend la ressource entière et l'ignore (garde
 * `show-sans-fields.garde.test.ts`). Le seul `fields` admis sur ce show est celui du bloc `tenant`
 * (TCK-2780) — ici l'identifiant du compte seul, pour savoir si le lecteur est le locataire : ni nom, ni
 * téléphone, ni e-mail (la salle ne montre aucune coordonnée ; le nom des membres vient de la salle).
 */
export const CHAMPS_DU_LOCATAIRE_DE_LA_SALLE = ['id', 'user_id'];

/** Le bail tel que la salle le lit : la fiche, plus le résumé d'échéance (`include=due_summary`, TCK-2642). */
export type BailDeLaSalle = Lease & {
  readonly tenant?: { readonly id: number; readonly user_id?: number | null } | null;
  readonly next_due?: { readonly due_date: string; readonly amount: number; readonly status?: string } | null;
  readonly overdue_count?: number;
  readonly overdue_amount?: number;
  readonly next_due_notice_date?: string | null;
};

/**
 * Sous `['leases', 'detail', id]` : un geste de carte de loyer (`clesDeLObjet.echeance`, TCK-2962) et les
 * mutations de la fiche du bail invalident ce préfixe — le bandeau se relit avec eux.
 */
export function bailDeLaSalleQueryKey(id: number | null | undefined): QueryKey {
  return ['leases', 'detail', id, 'salle'];
}

export function useBailDeLaSalle(id: number | null | undefined) {
  return useApiQuery<ApiResponse<BailDeLaSalle>>(bailDeLaSalleQueryKey(id), cheminApi`/api/leases/${id ?? 0}`, {
    params: { include: ['tenant', 'due_summary'], fields: { customers: CHAMPS_DU_LOCATAIRE_DE_LA_SALLE } },
    enabled: Boolean(id),
  });
}

/** La conversation que rend `POST /api/conversations/rooms` : celle de `GET /api/conversations/{id}`. */
export function salleDeLObjetQueryKey(objet: ObjetDeLaSalle | null): QueryKey {
  return ['conversations', 'salle', objet?.nature ?? null, objet?.id ?? null];
}

/**
 * L'entrée depuis la fiche (TCK-2960) : `POST /api/conversations/rooms` ouvre la salle — la crée si elle
 * manque, synchronise ses membres — et la rend. Idempotente côté API (200 si elle existait, 201 sinon), d'où
 * une LECTURE au sens de l'écran : la fiche en a besoin pour savoir si le bloc existe. Un 403 (le lecteur lit
 * l'objet sans en être partie : un collègue de l'agence) est un cas ordinaire, sans reprise.
 */
export function useOuvrirLaSalle(objet: ObjetDeLaSalle | null) {
  const locale = useLocale();
  const { user, token } = useAuth();
  return useQuery<ApiResponse<Conversation>, ApiError>({
    queryKey: salleDeLObjetQueryKey(objet),
    enabled: objet !== null && Boolean(user),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: ({ signal }) =>
      apiRequest<ApiResponse<Conversation>>('/api/conversations/rooms', {
        method: 'POST',
        body: { subject_type: objet!.nature, subject_id: objet!.id },
        token: token ?? undefined,
        locale,
        signal,
      }),
  });
}
