'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';

export const PERIODES_COURTES = ['daily', 'weekly'] as const;
export type PeriodeCourte = (typeof PERIODES_COURTES)[number];

interface ReponseDeRecherche {
  readonly meta?: { readonly total?: unknown };
}

/** Une lecture par session de page suffit : le catalogue ne se remplit pas de séjours courts à la minute. */
let enCache: Promise<ReadonlySet<PeriodeCourte>> | null = null;

/** Pour les tests : oublie la lecture en cache. */
export function oublierLesPeriodesCourtes(): void {
  enCache = null;
}

async function lirePeriodesOffertes(): Promise<ReadonlySet<PeriodeCourte>> {
  const comptes = await Promise.all(
    PERIODES_COURTES.map(async (periode) => {
      try {
        const res = await apiFetch<ReponseDeRecherche>(
          `/public/properties/search?contract_type=rent&rent_period=${periode}&per_page=1`,
        );
        const total = res.meta?.total;
        // Illisible : on garde l'option — la cacher à tort retire un filtre qui marche.
        return typeof total === 'number' ? ([periode, total] as const) : ([periode, 1] as const);
      } catch {
        return [periode, 1] as const;
      }
    }),
  );
  return new Set(comptes.filter(([, total]) => total > 0).map(([periode]) => periode));
}

/**
 * TCK-2510 — les périodes de séjour court (« Journalier », « Hebdo ») qui ont au moins un bien
 * public à montrer. Le filtre de la liste ne les propose que dans ce cas (audit UX § 8 : la base
 * de démo n'en avait aucun, et le filtre menait à une liste vide).
 *
 * La recherche n'a pas de facette `rent_period` (`SearchPublicPropertyRequest::FACETTES`) : le
 * compte se prend par une sonde `per_page=1` et son `meta.total`, sur tout le catalogue public —
 * pas sous les autres filtres de la page, pour qu'une option ne disparaisse pas à chaque
 * changement de ville. `null` tant que ce n'est pas lu : l'appelant garde alors toutes les options.
 */
export function usePeriodesCourtesOffertes(actif: boolean): ReadonlySet<PeriodeCourte> | null {
  const [offertes, setOffertes] = useState<ReadonlySet<PeriodeCourte> | null>(null);

  useEffect(() => {
    if (!actif) return;
    let annule = false;
    enCache ??= lirePeriodesOffertes();
    void enCache.then((lues) => {
      if (!annule) setOffertes(lues);
    });
    return () => {
      annule = true;
    };
  }, [actif]);

  return offertes;
}

/**
 * Les périodes à proposer : les longues toujours, une courte seulement si elle a des biens — ou si
 * c'est la valeur choisie (une URL partagée ou un retour arrière doit pouvoir la retirer).
 */
export function periodesAProposer<T extends string>(
  toutes: readonly T[],
  offertes: ReadonlySet<PeriodeCourte> | null,
  choisie: string | null | undefined,
): T[] {
  if (offertes === null) return [...toutes];
  return toutes.filter(
    (periode) =>
      !(PERIODES_COURTES as readonly string[]).includes(periode) ||
      offertes.has(periode as PeriodeCourte) ||
      periode === choisie,
  );
}
