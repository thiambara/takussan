'use client';

import { useEffect, useState } from 'react';

/**
 * L'instant courant, relu chaque minute : un âge (« il y a 25 min ») ou un compte à rebours
 * (« dans 45 min ») avance sans recharger la page. Partagé par la boîte « Demandes » (TCK-2584) et
 * les Visites par le temps (TCK-2587) — ici et non dans l'une des deux, pour qu'importer l'horloge
 * n'attire pas les espaces de traduction de l'autre écran (`check:i18n-namespaces`).
 */
export function useMinuteCourante(): Date {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuteur = window.setInterval(() => setMaintenant(new Date()), 60_000);
    return () => window.clearInterval(minuteur);
  }, []);
  return maintenant;
}
