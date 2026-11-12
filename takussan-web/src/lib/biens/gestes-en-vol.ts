'use client';

import { useSyncExternalStore } from 'react';

/**
 * Le registre des gestes EN VOL d'un bien, par identifiant — au-dessus de tout démontage.
 *
 * Contre-vérification de f02583f76 (verif-commercial, 2026-11-12) — au téléphone, le menu de la
 * fiche (`PropertyHeaderActions`) vit dans la feuille « ⋯ » de l'en-tête de la coque, dont le
 * contenu est DÉMONTÉ à la fermeture : la transition de `useGestesRapides` partait avec lui. On
 * fermait la feuille pendant un statut en vol, on la rouvrait, le « ⋯ » était actif et « Dupliquer »
 * partait aussi (deux actions serveur). Le geste se marque ici à son départ et se libère à son issue,
 * quoi qu'il arrive au composant qui l'a lancé : la fiche remontée le retrouve.
 *
 * Un compteur, pas un booléen : deux gestes du même bien (la fiche et une ligne de liste ouvertes
 * l'une après l'autre) ne se libèrent pas l'un l'autre.
 */
const enVol = new Map<number, number>();
const abonnes = new Set<() => void>();

function prevenir(): void {
  abonnes.forEach((abonne) => abonne());
}

/** Marque un geste du bien en vol ; la fonction rendue le libère (une seule fois). */
export function marquerGesteEnVol(propertyId: number): () => void {
  enVol.set(propertyId, (enVol.get(propertyId) ?? 0) + 1);
  prevenir();
  let libere = false;
  return () => {
    if (libere) return;
    libere = true;
    const reste = (enVol.get(propertyId) ?? 1) - 1;
    if (reste <= 0) enVol.delete(propertyId);
    else enVol.set(propertyId, reste);
    prevenir();
  };
}

/** Le temps d'un geste serveur : marqué au départ, libéré à l'issue, échec compris. */
export async function pendantLeGeste<T>(propertyId: number, geste: () => Promise<T>): Promise<T> {
  const liberer = marquerGesteEnVol(propertyId);
  try {
    return await geste();
  } finally {
    liberer();
  }
}

function abonner(abonne: () => void): () => void {
  abonnes.add(abonne);
  return () => {
    abonnes.delete(abonne);
  };
}

/** `true` tant qu'un geste du bien est en vol, lancé par ce composant ou par un autre, démonté depuis. */
export function useGesteEnVol(propertyId: number): boolean {
  return useSyncExternalStore(
    abonner,
    () => enVol.has(propertyId),
    () => false,
  );
}
