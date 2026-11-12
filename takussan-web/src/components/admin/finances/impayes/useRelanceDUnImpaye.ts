'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';

import { composerLaRelanceAction } from '@/app/actions/relance';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { useAuth } from '@/context/AuthContext';
import { ApiError, apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import type { CanalDeRelance } from '@/lib/queries/relances';
import type { ApiResponse } from '@/types/api';
import type { PaymentHistoryRow } from '@/types/invoice';

import { useNoterLaRelance } from './useNoterLaRelance';

/**
 * TCK-2660 (ADR-0105) — la relance d'UNE échéance, telle que la feuille (téléphone) et le panneau
 * (bureau) la composent.
 *
 * 1. Le lien de paiement de l'échéance est demandé QUAND la relance s'ouvre (`actif`), jamais avant :
 *    `POST /api/lease-payments/{id}/payment-link` rend le lien actif (le même d'un appel à l'autre).
 *    Un 409 dit que l'échéance ne se paie plus en ligne : rien ne s'ouvre.
 * 2. Le message est composé dans la langue du LOCATAIRE (`composerLaRelanceAction`), puis modifiable.
 * 3. « Ouvrir WhatsApp » est un LIEN (`wa.me`) prêt avant le clic : la navigation part dans le geste
 *    même de l'utilisateur, sans fenêtre ouverte vide. Tant que le lien manque, il n'y a pas d'`href`.
 * 4. Ouvrir WhatsApp, ou appeler, NOTE la relance (`channel`) ; Takussan n'envoie rien.
 */
export type EtatDuLien = 'inactif' | 'chargement' | 'pret' | 'refuse' | 'echec';

export function useRelanceDUnImpaye(row: PaymentHistoryRow | null, actif: boolean) {
  const { token } = useAuth();
  const localeDeLEcran = useLocale();
  const id = row?.id ?? 0;
  const telephone = row?.payer?.phone ?? null;
  const joignable = isReachable(telephone);

  const lien = useQuery<string, ApiError>({
    queryKey: ['lease-payments', id, 'payment-link'],
    queryFn: async () => {
      const reponse = await apiRequest<ApiResponse<{ url: string; expires_at: string | null }>>(
        cheminApi`/api/lease-payments/${id}/payment-link`,
        { method: 'POST', body: {}, token: token ?? undefined, locale: localeDeLEcran },
      );
      return reponse.data.url;
    },
    enabled: actif && id > 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const url = lien.data ?? null;
  const compose = useQuery({
    queryKey: ['relance-impaye', 'message', id, url, row?.payer?.locale ?? null, localeDeLEcran],
    queryFn: () =>
      composerLaRelanceAction({
        localeDuLocataire: row?.payer?.locale,
        localeDeLEcran,
        prenom: row?.payer?.first_name,
        paymentType: row?.payment_type ?? null,
        periodStart: row?.period_start,
        dueDate: row?.due_date,
        montant: row?.amount_due ?? row?.remaining_amount ?? 0,
        devise: row?.currency,
        bien: row?.property?.title,
        lien: url ?? '',
      }),
    enabled: actif && url !== null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Le texte modifié par l'utilisateur, par échéance : changer de ligne repart du texte composé.
  const [modifie, setModifie] = useState<{ readonly id: number; readonly texte: string } | null>(null);
  const message = modifie && modifie.id === id ? modifie.texte : (compose.data?.texte ?? '');

  const etatDuLien: EtatDuLien = !actif
    ? 'inactif'
    : lien.isPending
      ? 'chargement'
      : lien.error
        ? lien.error.status === 409
          ? 'refuse'
          : 'echec'
        : 'pret';

  const noter = useNoterLaRelance();
  /**
   * TCK-2682 — la promesse dit si CETTE note a été prise (`true`) ou refusée (`false`) : la file en
   * lot l'inscrit au récapitulatif de l'échéance. `isError` ne dit que la dernière mutation, et les
   * rappels passés à `mutate` sont perdus dès qu'une note suivante part : d'où `mutateAsync`. L'échec
   * reste dit par le toast d'`useNoterLaRelance`.
   */
  const noterLaRelance = (channel: CanalDeRelance): Promise<boolean> =>
    id > 0
      ? noter.mutateAsync({ paymentId: id, channel }).then(
          () => true,
          () => false,
        )
      : Promise.resolve(false);

  return {
    joignable,
    etatDuLien,
    url,
    message,
    messagePret: compose.isSuccess,
    modifierLeMessage: (texte: string) => setModifie({ id, texte }),
    /** Prêt seulement avec un numéro joignable, le lien et un message : sinon, pas d'`href`. */
    hrefWhatsApp: joignable && url && message.trim() !== '' ? whatsappHref(telephone, message) : null,
    hrefAppel: joignable ? telHref(telephone) : null,
    noterLaRelance,
    noterEnEchec: noter.isError,
    relireLeLien: () => void lien.refetch(),
  };
}
