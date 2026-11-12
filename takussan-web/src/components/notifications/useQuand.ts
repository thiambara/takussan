'use client';

import { useTranslations } from 'next-intl';

import { useFormatteurs } from '@/lib/format/useFormatteurs';

import { quandRelatif, type TextesDuQuand } from './regroupement';

/**
 * TCK-2634 — « quand » d'une notification dans la langue de l'écran : les mots relatifs par next-intl
 * (`nav.notifications.quand`), la date par `useFormatteurs` (fuseau de Dakar, locale de l'application).
 */
export function useQuand(): (iso: string, maintenant: Date) => string {
  const t = useTranslations('nav.notifications.quand');
  const fmt = useFormatteurs();
  const textes: TextesDuQuand = {
    instant: t('instant'),
    minutes: (n) => t('minutes', { n }),
    heures: (n) => t('heures', { n }),
    hier: t('hier'),
    date: (instant, semaine, annee) =>
      fmt
        .date(instant, {
          day: 'numeric',
          month: 'short',
          ...(semaine ? { weekday: 'short' } : {}),
          ...(annee ? { year: 'numeric' } : {}),
        })
        .replace(',', ''),
  };
  return (iso, maintenant) => quandRelatif(iso, maintenant, textes);
}
