'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import type { OccupiedRange } from '@/lib/occupancy';

interface ReponseDisponibilite {
  readonly data: { readonly from: string; readonly to: string; readonly occupied: readonly OccupiedRange[] };
}

export interface NuitsPrises {
  readonly plages: readonly OccupiedRange[];
  /** `erreur` : rien n'est barré, et l'écran le dit — le serveur refusera quand même un chevauchement. */
  readonly etat: 'chargement' | 'pret' | 'erreur';
}

/**
 * TCK-2510 — les nuits prises d'un bien public (TCK-596 : réservations confirmées et
 * indisponibilités, fusionnées, sans motif), sur la fenêtre par défaut de l'API (aujourd'hui → +12
 * mois). À la différence de `usePropertyAvailability` (boîte de la fiche), l'état de la lecture est
 * rendu : le calendrier n'annonce pas « les jours barrés sont déjà réservés » sur une lecture
 * échouée ou pas encore arrivée. Changer `lecture` relit (après un refus 422 sur des nuits prises).
 */
export function useNuitsPrises(slug: string, actif: boolean, lecture = 0): NuitsPrises {
  const [etat, setEtat] = useState<NuitsPrises>({ plages: [], etat: 'chargement' });

  useEffect(() => {
    if (!actif || !slug) return;
    let annule = false;
    apiFetch<ReponseDisponibilite>(`/public/properties/${encodeURIComponent(slug)}/availability`)
      .then((res) => {
        if (!annule) setEtat({ plages: res.data?.occupied ?? [], etat: 'pret' });
      })
      .catch(() => {
        if (!annule) setEtat({ plages: [], etat: 'erreur' });
      });
    return () => {
      annule = true;
    };
    // `lecture` : relire après un refus du serveur sur des nuits prises entre-temps.
  }, [slug, actif, lecture]);

  return etat;
}
