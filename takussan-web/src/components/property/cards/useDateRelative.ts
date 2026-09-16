'use client';

import { useLocale } from 'next-intl';

/**
 * « il y a 3 semaines » dans la langue de la page.
 *
 * `formatRelativeDate` (`lib/utils.ts`) fige `'fr'` : sous `/en`, chaque carte affichait sa date en
 * français (relevé de la revue design du 2026-09-16, accueil et liste à 360 px).
 *
 * ⚠ `wo` retombe sur `fr`, délibérément : Node connaît le wolof, Chrome non
 * (`Intl.RelativeTimeFormat.supportedLocalesOf(['wo'])` → `[]`, mesuré le même jour). Le serveur
 * rendrait « 3 ayi-bis ci ginaaw », le client « 3 weeks ago », et l'hydratation divergerait. Le
 * français est aussi le repli de tous les libellés `wo` manquants (`i18n/request.ts`).
 */
export function useDateRelative(date: string | Date): string {
  return formaterDateRelative(date, useLocale());
}

// Hors du hook : la lecture de l'horloge est la même que celle de `formatRelativeDate`, qu'elle
// remplace à l'identique pour ce qui est du moment où elle a lieu.
function formaterDateRelative(date: string | Date, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en' : 'fr', { numeric: 'auto' });
  const diffDays = Math.round((new Date(date).getTime() - Date.now()) / 86_400_000);
  if (Math.abs(diffDays) < 7) return rtf.format(diffDays, 'day');
  if (Math.abs(diffDays) < 30) return rtf.format(Math.round(diffDays / 7), 'week');
  return rtf.format(Math.round(diffDays / 30), 'month');
}
