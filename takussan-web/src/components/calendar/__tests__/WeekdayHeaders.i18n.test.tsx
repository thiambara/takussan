/**
 * TCK-292 — les en-têtes de colonnes des grilles mois et semaine suivent la LOCALE.
 *
 * Pourquoi ce test existe : `src/lib/calendar-date.ts` exportait
 * `WEEKDAY_SHORT_FR = ['Lun', 'Mar', …]`, rendu tel quel par `MonthView` et
 * `WeekView`. Un anglophone sur `/app/calendar` lisait « Lun Mar Mer… » sur les
 * deux vues — et **aucune garde ne pouvait le voir** : ces libellés n'étaient
 * des littéraux d'aucun composant, ils vivaient dans un module `lib/` que le
 * scan de texte en dur n'inspecte pas sous cet angle. Les deux fichiers avaient
 * été déclarés FINIS.
 *
 * Le test est donc une ABLATION : remettre le tableau français en dur le fait
 * rougir sur `en` et sur `wo`, jamais sur `fr`.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { MonthView } from '../MonthView';
import { WeekView } from '../WeekView';

const FOCUS = new Date(2026, 0, 15);
const AUCUN: never[] = [];

describe('en-têtes de jours des grilles calendrier', () => {
  it.each([
    ['fr' as const, ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']],
    ['en' as const, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']],
    ['wo' as const, ['Alt', 'Tal', 'Àll', 'Alx', 'Àjj', 'Gaa', 'Dib']],
  ])('MonthView rend les sept jours en %s', (locale, attendus) => {
    const { unmount } = render(
      withIntl(<MonthView focus={FOCUS} events={AUCUN} onSelect={() => {}} />, locale),
    );
    const entetes = screen.getAllByRole('columnheader').map((n) => n.textContent);
    expect(entetes).toEqual(attendus);
    unmount();
  });

  it.each([
    ['fr' as const, 'Lun'],
    ['en' as const, 'Mon'],
    ['wo' as const, 'Alt'],
  ])('WeekView ouvre la semaine sur le lundi en %s', (locale, attendu) => {
    const { unmount } = render(
      withIntl(<WeekView focus={FOCUS} events={AUCUN} onSelect={() => {}} />, locale),
    );
    const entetes = screen.getAllByRole('columnheader');
    expect(entetes).toHaveLength(7);
    expect(entetes[0].textContent).toContain(attendu);
    unmount();
  });
});
