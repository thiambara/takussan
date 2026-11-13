'use client';

import { useSyncExternalStore } from 'react';

/**
 * Un registre de gestes EN VOL, par clé — au-dessus de tout démontage.
 *
 * Un verrou tenu par un composant (`useRef`, l'`isPending` d'une mutation) part avec lui : une
 * feuille refermée puis rouverte, un fil quitté puis rouvert, ou un second composant qui offre le
 * même geste repartent à zéro alors que la requête vole encore. Le geste se marque ici à son départ
 * et se libère à son issue, quoi qu'il arrive au composant qui l'a lancé.
 *
 * Un compteur, pas un booléen : deux gestes de la même clé (lancés l'un après l'autre par deux
 * composants qui ne se connaissent pas) ne se libèrent pas l'un l'autre.
 *
 * Usages : les gestes d'un bien (`lib/biens/gestes-en-vol.ts`), les gestes de contact d'un client
 * dans la messagerie (`components/messages/useGesteDuClient.ts`).
 */
export function creerRegistreEnVol<K extends string | number>() {
  const enVol = new Map<K, number>();
  const abonnes = new Set<() => void>();

  const prevenir = () => abonnes.forEach((abonne) => abonne());

  const abonner = (abonne: () => void) => {
    abonnes.add(abonne);
    return () => {
      abonnes.delete(abonne);
    };
  };

  /** Marque un geste en vol ; la fonction rendue le libère (une seule fois). */
  const marquer = (cle: K): (() => void) => {
    enVol.set(cle, (enVol.get(cle) ?? 0) + 1);
    prevenir();
    let libere = false;
    return () => {
      if (libere) return;
      libere = true;
      const reste = (enVol.get(cle) ?? 1) - 1;
      if (reste <= 0) enVol.delete(cle);
      else enVol.set(cle, reste);
      prevenir();
    };
  };

  /** Le temps d'un geste serveur : marqué au départ, libéré à l'issue, échec compris. */
  async function pendant<T>(cle: K, geste: () => Promise<T>): Promise<T> {
    const liberer = marquer(cle);
    try {
      return await geste();
    } finally {
      liberer();
    }
  }

  /** Lecture SYNCHRONE, pour un clic : un double toucher arrive avant tout nouveau rendu. */
  const estEnVol = (cle: K): boolean => enVol.has(cle);

  /** `true` tant qu'un geste de l'une des clés est en vol, lancé par ce composant ou par un autre, démonté depuis. */
  const useEnVol = (...cles: readonly K[]): boolean =>
    useSyncExternalStore(
      abonner,
      () => cles.some((cle) => enVol.has(cle)),
      () => false,
    );

  return { marquer, pendant, estEnVol, useEnVol };
}
