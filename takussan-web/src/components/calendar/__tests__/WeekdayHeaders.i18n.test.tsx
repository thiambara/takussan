/**
 * TCK-292 — les en-têtes de jours des grilles suivent la LOCALE.
 *
 * Pourquoi ce test existe : `src/lib/calendar-date.ts` exportait `WEEKDAY_SHORT_FR = ['Lun',
 * 'Mar', …]`, rendu tel quel par les vues mois et semaine. Un anglophone lisait « Lun Mar Mer… » —
 * et aucune garde ne pouvait le voir.
 *
 * TCK-2597 — le mois et la semaine de l'agenda nomment leurs jours par `Intl`, dans la locale
 * active. Ablation : écrire les jours en dur fait rougir ce test sur `en`, jamais sur `fr`.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { MoisCompact, MoisDeLAgenda } from '@/components/agenda/MoisDeLAgenda';
import { SemaineDeLAgenda } from '@/components/agenda/SemaineDeLAgenda';
import { withIntl } from '@/test/intl';

const AUCUN: never[] = [];

describe('en-têtes de jours de l’agenda', () => {
  it.each([
    ['fr' as const, ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.']],
    ['en' as const, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']],
  ])('le mois du bureau rend les sept jours en %s, du lundi au dimanche', (locale, attendus) => {
    const { container, unmount } = render(withIntl(<MoisDeLAgenda jour="2026-01-15" aujourdhui="2026-01-15" evenements={AUCUN} onOuvrir={() => {}} onChoisirJour={() => {}} />, locale));
    const entetes = Array.from(container.querySelectorAll('[data-slot="mois-de-l-agenda"] > [aria-hidden="true"] > span')).map((n) => n.textContent);
    expect(entetes).toEqual(attendus);
    unmount();
  });

  it.each([
    ['fr' as const, ['L', 'M', 'M', 'J', 'V', 'S', 'D']],
    ['en' as const, ['M', 'T', 'W', 'T', 'F', 'S', 'S']],
  ])('le mois du téléphone rend les initiales en %s', (locale, attendus) => {
    const { container, unmount } = render(withIntl(<MoisCompact jour="2026-01-15" aujourdhui="2026-01-15" evenements={AUCUN} onChoisirJour={() => {}} />, locale));
    const entetes = Array.from(container.querySelectorAll('[data-slot="mois-compact"] > [aria-hidden="true"] > span')).map((n) => n.textContent);
    expect(entetes).toEqual(attendus);
    unmount();
  });

  it.each([
    ['fr' as const, /^Lun\./],
    ['en' as const, /^Mon/],
  ])('la semaine ouvre sur le lundi en %s', (locale, attendu) => {
    const { getAllByRole, unmount } = render(
      withIntl(
        <SemaineDeLAgenda
          jour="2026-01-15"
          aujourdhui="2026-01-15"
          maintenant={new Date('2026-01-15T10:00:00Z')}
          evenements={AUCUN}
          visites={new Map()}
          sejoursDuJour={null}
          ouvert={null}
          onOuvrir={() => {}}
          onChoisirJour={() => {}}
          onPlanifier={() => {}}
          onOccupation={null}
        />,
        locale,
      ),
    );
    const jours = getAllByRole('button').filter((b) => b.hasAttribute('aria-pressed'));
    expect(jours).toHaveLength(7);
    expect(jours[0]!.textContent).toMatch(attendu);
    unmount();
  });
});
