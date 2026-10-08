'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

/** Un créneau tel que `GET …/visit-slots` le rend : rien sur la visite qui l'occupe. */
export interface Creneau {
  readonly start: string;
  readonly label: string;
  readonly available: boolean;
}

export type EtatDesCreneaux =
  | { readonly etat: 'attente' }
  | { readonly etat: 'charge'; readonly creneaux: readonly Creneau[] }
  | { readonly etat: 'erreur' };

/**
 * Les créneaux d'un jour, tirés de l'API. La grille, le délai de 30 minutes et les visites
 * confirmées qui occupent un créneau sont jugés par le SERVEUR : la boîte les recalculait seule,
 * dans le fuseau du navigateur, et proposait des heures que l'agent avait déjà prises.
 */
export function useCreneaux(slug: string, jour: string | null): EtatDesCreneaux {
  const [etat, setEtat] = useState<{ jour: string; valeur: EtatDesCreneaux } | null>(null);

  useEffect(() => {
    if (!jour) return;
    let actif = true;
    apiFetch<{ data: { slots: Creneau[] } }>(
      `/public/properties/${encodeURIComponent(slug)}/visit-slots?date=${jour}`,
    )
      .then((res) => {
        if (actif) setEtat({ jour, valeur: { etat: 'charge', creneaux: res.data.slots } });
      })
      .catch(() => {
        if (actif) setEtat({ jour, valeur: { etat: 'erreur' } });
      });
    return () => {
      actif = false;
    };
  }, [slug, jour]);

  return etat && etat.jour === jour ? etat.valeur : { etat: 'attente' };
}
