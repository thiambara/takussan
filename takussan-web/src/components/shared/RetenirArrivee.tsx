'use client';
import { useEffect } from 'react';
import { retenirArrivee } from '@/lib/attribution';

/**
 * TCK-590 — retient la source d'arrivée (`utm_source` / `utm_medium`) dès la première page
 * publique. Monté dans le layout du groupe public, qui survit aux navigations : l'effet ne court
 * qu'à l'ATTERRISSAGE, et la source survit au clic vers un autre bien.
 */
export function RetenirArrivee() {
  useEffect(() => {
    retenirArrivee(window.location.search);
  }, []);
  return null;
}
