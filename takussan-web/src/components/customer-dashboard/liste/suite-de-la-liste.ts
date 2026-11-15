'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import { lireLaListe, type LecteurDeLaListe } from '@/lib/crm/liste-des-clients';
import { fetchDashboardCustomers } from '@/lib/queries/customers';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';

/**
 * TCK-2890 — « Voir plus » au téléphone (maquette `app-clients` e0) : la page suivante se charge SUR
 * PLACE, avec la même lecture que la page serveur (vue, filtres, tri, `per_page` de l'URL, lus par
 * `lireLaListe`), et s'ajoute sous les lignes déjà là. Une fiche déjà montrée ne revient pas (une
 * fiche créée entre-temps décale les pages). Une nouvelle page serveur (vue, filtre, tri, relecture)
 * repart de zéro.
 */
export interface SuiteDeLaListe {
  /** Les clients de la page serveur, puis ceux chargés par « Voir plus ». */
  readonly clients: readonly CustomerListItem[];
  /** Il reste des pages à charger. */
  readonly encore: boolean;
  readonly chargement: boolean;
  readonly erreur: boolean;
  readonly voirPlus: () => void;
}

interface Etat {
  readonly pour: PaginatedResponse<CustomerListItem>;
  readonly suite: readonly CustomerListItem[];
  readonly derniere: number;
  readonly chargement: boolean;
  readonly erreur: boolean;
}

const depart = (page: PaginatedResponse<CustomerListItem>): Etat => ({
  pour: page,
  suite: [],
  derniere: page.meta.current_page,
  chargement: false,
  erreur: false,
});

export function useSuiteDeLaListe(page: PaginatedResponse<CustomerListItem>, lecteur: LecteurDeLaListe): SuiteDeLaListe {
  const { token } = useAuth();
  const params = useSearchParams();
  const [etat, setEtat] = useState<Etat>(() => depart(page));
  // La page serveur a changé : la suite chargée pour l'ancienne n'a plus de sens.
  const courant = etat.pour === page ? etat : depart(page);
  if (courant !== etat) setEtat(courant);

  const vus = new Set<number>();
  const clients = [...(page.data ?? []), ...courant.suite].filter((c) => (vus.has(c.id) ? false : (vus.add(c.id), true)));

  const voirPlus = () => {
    if (courant.chargement) return;
    // Sans jeton client (session en cours de rétablissement), le geste le dit au lieu de rester muet.
    if (!token) {
      setEtat({ ...courant, erreur: true });
      return;
    }
    const pour = page;
    const suivante = courant.derniere + 1;
    setEtat({ ...courant, chargement: true, erreur: false });
    const e = lireLaListe(Object.fromEntries(params?.entries() ?? []), lecteur);
    fetchDashboardCustomers(token, { page: suivante, perPage: e.parPage, sort: e.tri, filters: e.filtres })
      .then((res) => {
        // La réponse d'une page périmée (la vue a changé pendant le chargement) n'est jamais lue.
        setEtat((a) => (a.pour !== pour ? a : { ...a, suite: [...a.suite, ...(res.data ?? [])], derniere: suivante, chargement: false }));
      })
      .catch(() => {
        setEtat((a) => (a.pour !== pour ? a : { ...a, chargement: false, erreur: true }));
      });
  };

  return {
    clients,
    encore: courant.derniere < page.meta.last_page,
    chargement: courant.chargement,
    erreur: courant.erreur,
    voirPlus,
  };
}
