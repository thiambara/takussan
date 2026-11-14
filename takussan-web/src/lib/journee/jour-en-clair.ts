import { FUSEAU_DES_VISITES } from '@/lib/visites/heure-de-dakar';

/**
 * « Mardi 10 novembre » : le jour `AAAA-MM-JJ`, en toutes lettres, au calendrier de Dakar, la
 * majuscule posée à la locale. Pur (ni hook ni horloge) : l'accueil le calcule AU SERVEUR (TCK-2622),
 * « Ma journée » par `useJourEnClair` (TCK-2596).
 */
export function jourEnClair(locale: string, jour: string): string {
  const texte = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: FUSEAU_DES_VISITES }).format(
    new Date(`${jour}T12:00:00Z`),
  );
  return texte.charAt(0).toLocaleUpperCase(locale) + texte.slice(1);
}
