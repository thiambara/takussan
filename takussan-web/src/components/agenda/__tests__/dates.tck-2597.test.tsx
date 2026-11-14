/**
 * TCK-2597 — la semaine et la plage de l'agenda se disent dans l'ordre de la locale. Composées à la
 * main (« jour – jour mois »), elles rendaient « 13–Nov 26 » en anglais au lieu de « Nov 13 – 26 ».
 * Sur deux années, la plage tait l'année (relevé à 390 : « 24 déc. 2026 – 6 janv. 2027 » tronqué).
 */
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { useDatesDeLAgenda } from '../dates';

const dates = (locale: 'fr' | 'en') => renderHook(() => useDatesDeLAgenda(), { wrapper: ({ children }: { children: ReactNode }) => withIntl(children, locale) }).result.current;

describe('plages de l’agenda selon la locale', () => {
  it.each([
    ['fr' as const, '10–23 nov.', '28 nov. – 11 déc.', '24 déc. – 6 janv.', '9–15 novembre 2026'],
    ['en' as const, 'Nov 10 – 23', 'Nov 28 – Dec 11', 'Dec 24 – Jan 6', 'November 9 – 15, 2026'],
  ])('%s', (locale, plage, plageSurDeuxMois, plageSurDeuxAns, semaine) => {
    const d = dates(locale);
    // Intl sépare par des espaces fines (U+2009, U+202F) : on compare à espaces ordinaires.
    const lu = (texte: string) => texte.replace(/\s/g, ' ');
    expect(lu(d.plage('2026-11-10', '2026-11-23'))).toBe(plage);
    expect(lu(d.plage('2026-11-28', '2026-12-11'))).toBe(plageSurDeuxMois);
    // Sur deux années, sans l'année : la barre du téléphone n'a pas la place de « 2026 – … 2027 ».
    expect(lu(d.plage('2026-12-24', '2027-01-06'))).toBe(plageSurDeuxAns);
    expect(lu(d.semaine('2026-11-09', '2026-11-15'))).toBe(semaine);
  });
});
