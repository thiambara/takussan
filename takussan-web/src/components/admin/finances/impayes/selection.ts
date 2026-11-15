'use client';

import { useState, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

import type { PaymentHistoryResponse } from '@/lib/queries/payments';
import type { PaymentHistoryRow } from '@/types/invoice';

/**
 * TCK-2682 — la sélection des impayés à relancer en lot, PAR ÉCHÉANCE (`id` de `lease_payments`).
 *
 * Elle garde la LIGNE, pas seulement son identifiant : une échéance cochée puis sortie de l'affichage
 * (une autre page, « Voir plus » replié, un autre filtre) reste sélectionnée, et la barre comme la
 * file ont encore besoin de son nom, de son montant et de son téléphone. Elle survit donc aux pages
 * et aux filtres ; la barre DIT combien d'échéances sélectionnées ne sont pas affichées (« dont N non
 * affichées »), et la file les reprend — l'admin ne relance personne qu'il ne voit pas sans le savoir.
 *
 * Seules les échéances de BAIL se sélectionnent : le lien de paiement et la relance sont des routes de
 * `lease_payments`. (Les acomptes de réservation ne paraissent pas dans les impayés : l'API les écarte
 * dès qu'un filtre de retard est posé — `PaymentHistory::applyBusinessFilters`.)
 */
export function useSelectionDesImpayes() {
  const [lignes, setLignes] = useState<ReadonlyMap<number, PaymentHistoryRow>>(() => new Map());

  const changer = (rows: readonly PaymentHistoryRow[], cochees: boolean) =>
    setLignes((avant) => {
      const apres = new Map(avant);
      for (const row of rows) {
        if (row.source !== 'lease') continue;
        if (cochees) apres.set(row.id, row);
        else apres.delete(row.id);
      }
      return apres;
    });

  return {
    lignes,
    n: lignes.size,
    coche: (id: number) => lignes.has(id),
    changer,
    retirer: (ids: readonly number[]) =>
      setLignes((avant) => {
        if (!ids.some((id) => avant.has(id))) return avant;
        const apres = new Map(avant);
        for (const id of ids) apres.delete(id);
        return apres;
      }),
    /** Ne garder que ces échéances (« Terminer » : les passées et les sautées). */
    garder: (ids: readonly number[]) =>
      setLignes((avant) => {
        const gardes = new Set(ids);
        return new Map([...avant].filter(([id]) => gardes.has(id)));
      }),
    vider: () => setLignes(new Map()),
  };
}

export type SelectionDesImpayes = ReturnType<typeof useSelectionDesImpayes>;

/**
 * L'ordre de la file : celui de la liste (`sort=-days_late`), le plus en retard d'abord ; à retard
 * égal, l'échéance la plus ancienne (`id` croissant). Une copie figée au départ : la file ne bouge
 * plus quand la liste se recharge derrière elle.
 */
export function ordreDeLaFile(lignes: Iterable<PaymentHistoryRow>): PaymentHistoryRow[] {
  return [...lignes].sort((a, b) => (b.days_late ?? 0) - (a.days_late ?? 0) || a.id - b.id);
}

/**
 * Les échéances AFFICHÉES, lues dans le cache de React Query sous les clés des pages montrées (la
 * page du tableau au bureau, les pages 1 à n des cartes au téléphone). L'instantané est une chaîne
 * d'identifiants — stable tant que rien ne change, sans quoi `useSyncExternalStore` bouclerait — et
 * les lignes se relisent du cache à la demande.
 */
export function useEcheancesAffichees(cles: readonly QueryKey[]) {
  const queryClient = useQueryClient();
  const lire = (): PaymentHistoryRow[] =>
    cles.flatMap((cle) => queryClient.getQueryData<PaymentHistoryResponse>(cle)?.data ?? []).filter((row) => row.source === 'lease');
  const instantane = () =>
    lire()
      .map((row) => row.id)
      .join(',');
  const ids = useSyncExternalStore(
    (rappel) => queryClient.getQueryCache().subscribe(rappel),
    instantane,
    instantane,
  );
  return {
    ids: new Set(ids === '' ? [] : ids.split(',').map(Number)),
    /** Les lignes affichées, dans l'ordre de la liste (relues du cache au moment du geste). */
    lignes: lire,
  };
}
