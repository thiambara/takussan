'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale } from 'next-intl';

import { composerLaRelanceAction } from '@/app/actions/relance';
import { isReachable, telHref, whatsappHref } from '@/components/crm/contact';
import { useAuth } from '@/context/AuthContext';
import { useMyProfiles } from '@/hooks/useProfiles';
import { ApiError, apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import type { CanalDeRelance } from '@/lib/queries/relances';
import type { ApiResponse } from '@/types/api';
import type { PaymentHistoryRow } from '@/types/invoice';

import { useNoterLaRelance } from './useNoterLaRelance';

/**
 * TCK-2660 (ADR-0105) — la relance d'UNE échéance, telle que la feuille (téléphone), le panneau
 * (bureau), la file guidée (TCK-2682) et la fiche du bien (TCK-2639) la composent.
 *
 * 1. Décision 1 du porteur (2026-11-12) — le lien de paiement n'est créé qu'à l'ENVOI, jamais à
 *    l'ouverture : une lecture n'écrit pas. `POST /api/lease-payments/{id}/payment-link` part au clic
 *    sur « Ouvrir WhatsApp » ({@link creerLeLien} via `envoyer`), ou sur « Copier » du lien. Un 409 dit
 *    alors que l'échéance ne se paie plus en ligne : rien ne s'ouvre, rien n'est noté.
 * 2. Le message est composé dans la langue du LOCATAIRE (`composerLaRelanceAction`), avec un REPÈRE à
 *    la place du lien (« [lien de paiement ajouté à l'envoi] »), puis modifiable. À l'envoi, le repère
 *    devient l'URL ; un repère effacé par l'agent laisse le message tel qu'il l'a écrit.
 * 3. Décision 3 — le message nomme l'agence du profil actif (« De la part de {agence}. »).
 * 4. Ouvrir WhatsApp, ou appeler, NOTE la relance (`channel`) ; Takussan n'envoie rien. « Appeler »
 *    ne crée jamais de lien.
 */
export type EtatDuLien = 'inactif' | 'aCreer' | 'chargement' | 'pret' | 'refuse' | 'echec';

/** Ce que rend l'envoi : l'adresse `wa.me` prête, ou `null` quand le lien n'a pas pu être créé. */
export type Envoi = { readonly hrefWhatsApp: string } | null;

export function useRelanceDUnImpaye(
  row: PaymentHistoryRow | null,
  actif: boolean,
  /** `'file'` : la file guidée dit elle-même une note refusée (ni toast, ni `noterEnEchec`). */
  { signalerLaNote = 'ecran' }: { readonly signalerLaNote?: 'ecran' | 'file' } = {},
) {
  const { token, activeProfileId } = useAuth();
  const localeDeLEcran = useLocale();
  const id = row?.id ?? 0;
  const telephone = row?.payer?.phone ?? null;
  const joignable = isReachable(telephone);

  // Décision 3 — l'agence du profil actif, lue dans la réponse que le sélecteur d'espace a déjà en cache.
  const profils = useMyProfiles();
  const idActif = activeProfileId ?? profils.data?.meta.active_profile_id ?? null;
  const agence = profils.data?.data.find((p) => p.id === idActif)?.agency?.name ?? null;

  // La relance refermée (feuille, dossier) pendant la création du lien : l'envoi est abandonné.
  const encoreActif = useRef(actif);
  useEffect(() => {
    encoreActif.current = actif;
  }, [actif]);

  // Le lien créé, par échéance : changer de ligne ne réutilise jamais le lien d'une autre.
  const [cree, setCree] = useState<{ readonly id: number; readonly url: string } | null>(null);
  const url = cree && cree.id === id ? cree.url : null;
  const lien = useMutation<string, ApiError, number>({
    mutationFn: async (paymentId) => {
      const reponse = await apiRequest<ApiResponse<{ url: string; expires_at: string | null }>>(
        cheminApi`/api/lease-payments/${paymentId}/payment-link`,
        { method: 'POST', body: {}, token: token ?? undefined, locale: localeDeLEcran },
      );
      return reponse.data.url;
    },
  });
  // L'erreur et l'attente ne valent que pour l'échéance qui les a produites.
  const lienDeCetteLigne = lien.variables === id;

  const compose = useQuery({
    queryKey: ['relance-impaye', 'message', id, row?.payer?.locale ?? null, localeDeLEcran, agence],
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
        lien: null,
        agence,
      }),
    // Le nom de l'agence attendu s'il est en route : le message ne change pas sous les yeux.
    enabled: actif && id > 0 && !profils.isLoading,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Le texte modifié par l'utilisateur, par échéance : changer de ligne repart du texte composé.
  const [modifie, setModifie] = useState<{ readonly id: number; readonly texte: string } | null>(null);
  const message = modifie && modifie.id === id ? modifie.texte : (compose.data?.texte ?? '');
  const repere = compose.data?.repere ?? null;
  const avecLeLien = (texte: string, adresse: string) => (repere && texte.includes(repere) ? texte.split(repere).join(adresse) : texte);

  const etatDuLien: EtatDuLien = !actif
    ? 'inactif'
    : url
      ? 'pret'
      : lienDeCetteLigne && lien.isPending
        ? 'chargement'
        : lienDeCetteLigne && lien.error
          ? lien.error.status === 409
            ? 'refuse'
            : 'echec'
          : 'aCreer';

  /** Crée le lien de l'échéance (une fois : le même revient ensuite) ; `null` sur un refus ou un échec. */
  const creerLeLien = async (): Promise<string | null> => {
    if (url) return url;
    if (id <= 0) return null;
    try {
      const adresse = await lien.mutateAsync(id);
      setCree({ id, url: adresse });
      return adresse;
    } catch {
      return null;
    }
  };

  const noter = useNoterLaRelance({ toast: signalerLaNote === 'ecran' });
  /**
   * TCK-2682 — la promesse dit si CETTE note a été prise (`true`) ou refusée (`false`) : la file en
   * lot l'inscrit au récapitulatif de l'échéance. `isError` ne dit que la dernière mutation, et les
   * rappels passés à `mutate` sont perdus dès qu'une note suivante part : d'où `mutateAsync`. Hors de
   * la file, l'échec reste dit par le toast d'`useNoterLaRelance`.
   */
  const noterLaRelance = (channel: CanalDeRelance): Promise<boolean> =>
    id > 0
      ? noter.mutateAsync({ paymentId: id, channel }).then(
          () => true,
          () => false,
        )
      : Promise.resolve(false);

  const pretAEnvoyer = joignable && compose.isSuccess && message.trim() !== '';

  return {
    joignable,
    etatDuLien,
    url,
    /** Le repère du lien dans le message composé, tant que le lien n'existe pas. */
    repere,
    message: url ? avecLeLien(message, url) : message,
    messagePret: compose.isSuccess,
    modifierLeMessage: (texte: string) => setModifie({ id, texte }),
    /** Un numéro joignable et un message : « Ouvrir WhatsApp » peut partir (le lien se crée au clic). */
    pretAEnvoyer,
    /** L'adresse `wa.me`, une fois le lien créé ; avant, aucune. */
    hrefWhatsApp: pretAEnvoyer && url ? whatsappHref(telephone, avecLeLien(message, url)) : null,
    /** L'ENVOI : crée le lien, puis rend l'adresse `wa.me` dont le message le porte. */
    envoyer: async (): Promise<Envoi> => {
      if (!pretAEnvoyer || !telephone) return null;
      const adresse = await creerLeLien();
      if (!encoreActif.current) return null;
      return adresse ? { hrefWhatsApp: whatsappHref(telephone, avecLeLien(message, adresse)) } : null;
    },
    creerLeLien,
    hrefAppel: joignable ? telHref(telephone) : null,
    noterLaRelance,
    // Dans la file, une seule instance sert toutes les échéances : `isError` y accuserait le
    // locataire présenté d'une note refusée pour le précédent.
    noterEnEchec: signalerLaNote === 'ecran' && noter.isError,
    relireLeLien: () => void creerLeLien(),
  };
}
