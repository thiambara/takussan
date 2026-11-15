'use client';

import { useLocale } from 'next-intl';

import { FUSEAU_DES_VISITES } from '@/lib/visites/heure-de-dakar';

/**
 * TCK-2597 — les dates de l'agenda en clair, au calendrier de Dakar. Un jour `AAAA-MM-JJ` se lit à
 * midi UTC : aucun fuseau ne le fait changer de jour.
 */
export function dateDuJour(jour: string): Date {
  return new Date(`${jour}T12:00:00Z`);
}

const majuscule = (texte: string, locale: string) => texte.charAt(0).toLocaleUpperCase(locale) + texte.slice(1);

export function useDatesDeLAgenda() {
  const locale = useLocale();
  const f = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...options, timeZone: FUSEAU_DES_VISITES });
  const long = f({ weekday: 'long', day: 'numeric', month: 'long' });
  const court = f({ weekday: 'short', day: 'numeric', month: 'short' });
  const nomCourt = f({ weekday: 'short' });
  const initiale = f({ weekday: 'narrow' });
  const mois = f({ month: 'long', year: 'numeric' });
  const moisCourt = f({ month: 'short', year: 'numeric' });
  const jourMois = f({ day: 'numeric', month: 'long' });
  const jourMoisAnnee = f({ day: 'numeric', month: 'long', year: 'numeric' });
  const jourMoisCourt = f({ day: 'numeric', month: 'short' });
  return {
    /** « Mardi 10 novembre ». */
    long: (jour: string) => majuscule(long.format(dateDuJour(jour)), locale),
    /** « Mar. 10 nov. ». */
    court: (jour: string) => majuscule(court.format(dateDuJour(jour)), locale),
    /** « Mar. » */
    nomCourt: (jour: string) => majuscule(nomCourt.format(dateDuJour(jour)), locale),
    /** « M » */
    initiale: (jour: string) => initiale.format(dateDuJour(jour)).toLocaleUpperCase(locale),
    /** « Novembre 2026 » */
    mois: (jour: string) => majuscule(mois.format(dateDuJour(jour)), locale),
    /** « Nov. 2026 » */
    moisCourt: (jour: string) => majuscule(moisCourt.format(dateDuJour(jour)), locale),
    /** « 9–15 novembre 2026 », « November 9 – 15, 2026 » : une semaine, dans l'ordre de la locale. */
    semaine: (lundi: string, dimanche: string) => jourMoisAnnee.formatRange(dateDuJour(lundi), dateDuJour(dimanche)),
    /**
     * « 10–23 nov. », « Nov 10 – 23 » : une plage courte (téléphone). Sur deux mois, chaque bout seul
     * (« 24 déc. – 6 janv. ») : `formatRange` y ajouterait l'année, trop long pour la barre.
     */
    plage: (de: string, a: string) =>
      de.slice(0, 7) === a.slice(0, 7)
        ? jourMoisCourt.formatRange(dateDuJour(de), dateDuJour(a))
        : `${jourMoisCourt.format(dateDuJour(de))} – ${jourMoisCourt.format(dateDuJour(a))}`,
    /** « 10 novembre » */
    jourMois: (jour: string) => jourMois.format(dateDuJour(jour)),
  };
}
