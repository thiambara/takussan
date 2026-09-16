'use client';

import { useFormatteurs } from '@/lib/format/useFormatteurs';

/**
 * Les libellés de date et d'heure du calendrier — dans la locale de l'APP, sur l'horloge du
 * NAVIGATEUR (revue design 2026-09-16).
 *
 * Cinq fichiers du calendrier écrivaient encore `toLocaleDateString('fr-FR', …)` : un utilisateur
 * en `en` ou en `wo` lisait « septembre 2026 ». La forme du dépôt est `useFormatteurs()`, mais elle
 * formate par défaut dans le fuseau de la plateforme (`Africa/Dakar`), et ce n'est PAS l'horloge
 * de ce module : toute la grille raisonne en dates LOCALES (`parseServerDate` lit
 * `2026-01-15 10:00:00` comme une heure locale, `monthGrid` fabrique des minuits locaux). Formater
 * ces dates à Dakar depuis un navigateur réglé ailleurs décalerait l'heure affichée, et ferait
 * tomber le minuit du 1er septembre, pris à Paris, en « août ». Le fuseau est donc celui du
 * navigateur, celui-là même que `toLocaleDateString` employait : seule la LOCALE change.
 */
export function useDatesCalendrier() {
  const f = useFormatteurs();
  const fuseau = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    date: (d: Date, options: Intl.DateTimeFormatOptions) =>
      f.date(d, { ...options, timeZone: fuseau }),
    heure: (d: Date) => f.date(d, { hour: '2-digit', minute: '2-digit', timeZone: fuseau }),
  };
}
