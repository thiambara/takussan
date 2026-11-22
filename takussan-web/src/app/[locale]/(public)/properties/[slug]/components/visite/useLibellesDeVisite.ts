'use client';
import { useTranslations } from 'next-intl';
import { decalerJour } from '@/lib/jour-de-l-api';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
import type { VisitWindow } from '@/types/visit';
import { aujourdhuiADakar } from './tranches';

/**
 * TCK-2503 — les libellés d'un jour et d'une tranche de visite.
 *
 * Un jour `AAAA-MM-JJ` est formaté à MIDI UTC dans le fuseau de Dakar (le défaut de `@/lib/format`) :
 * aucun fuseau de navigateur ne le fait glisser d'un jour. Une tranche se dit par sa PHRASE
 * (« l'après-midi ») et jamais par son heure de début : l'heure reste à fixer par l'agent.
 */
export function useLibellesDeVisite() {
  const fmt = useFormatteurs();
  const t = useTranslations('propertyVisitDialog');

  const midi = (jour: string) => `${jour}T12:00:00Z`;
  const majuscule = (s: string) => s.charAt(0).toLocaleUpperCase(fmt.locale) + s.slice(1);

  return {
    /** « Aujourd'hui », « Demain », sinon le jour de la semaine. */
    titreDuJour(jour: string, maintenant: Date = new Date()): string {
      const aujourdhui = aujourdhuiADakar(maintenant);
      if (jour === aujourdhui) return t('when.today');
      if (jour === decalerJour(aujourdhui, 1)) return t('when.tomorrow');
      return majuscule(fmt.date(midi(jour), { weekday: 'long' }));
    },
    /** « 12 nov. » */
    dateCourte(jour: string): string {
      return fmt.date(midi(jour), { day: 'numeric', month: 'short' });
    },
    /** « Jeudi 12 nov. » */
    jourCourt(jour: string): string {
      return majuscule(fmt.date(midi(jour), { weekday: 'long', day: 'numeric', month: 'short' }));
    },
    /** « Jeudi 12 novembre » */
    jourLong(jour: string): string {
      return majuscule(fmt.date(midi(jour), { weekday: 'long', day: 'numeric', month: 'long' }));
    },
    phrase(tranche: VisitWindow): string {
      return t(`windows.${tranche}.phrase`);
    },
  };
}
