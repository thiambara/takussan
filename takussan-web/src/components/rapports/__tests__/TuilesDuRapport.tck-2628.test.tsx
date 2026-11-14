import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { chiffresDeLAgence } from '@/lib/rapports/chiffres';
import { withIntl } from '@/test/intl';

import { TuilesDuRapport } from '../TuilesDuRapport';

/** Le résumé d'une agence, tel que le sert `GET /api/dashboard/agency` (TCK-2626 compris). */
const RESUME = {
  properties: { total: 42, published: 31 },
  leases: { active: 18 },
  finance: { revenue_month: 3_900_000, overdue_count: 3, overdue_amount: 450_000, unpaid_rate_percent: 7 },
  occupancy: { rate_percent: 78, eligible_count: 23, occupied_count: 18 },
};
const SERIES = { months: ['2026-09', '2026-10', '2026-11'], revenue: [3_000_000, 3_500_000, 3_920_000] };
/** Novembre clos (la période lue serait décembre) : la tuile compare novembre à octobre. */
const CLOS = { moisEnCours: '2026-12' };

function tuile(cle: string) {
  return screen.getAllByRole('link').find((a) => a.getAttribute('data-chiffre') === cle) as HTMLElement;
}

describe('TCK-2628 — les chiffres de la vue d’ensemble', () => {
  it('chaque chiffre est un lien vers la liste qu’il compte', () => {
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME, SERIES, CLOS)} colonnes={6} />));
    const liens = within(screen.getByRole('list')).getAllByRole('link');
    expect(liens.map((a) => [a.getAttribute('data-chiffre'), a.getAttribute('href')])).toEqual([
      ['encaisse', '/app/payments?status=paid'],
      ['impayes', '/app/reports/unpaid'],
      ['occupation', '/app/properties?mode=gestion&occupancy=occupied'],
      ['bauxActifs', '/app/leases?status=active'],
      ['biensPublies', '/app/properties?mode=annonces&listing=online'],
      ['tauxImpayes', '/app/reports/unpaid'],
    ]);
  });

  it('libellé, valeur formatée et contexte en mots ; l’occupation dit sa base (AC4)', () => {
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME, SERIES, CLOS)} colonnes={6} />));
    expect(tuile('encaisse').textContent).toMatch(/^Encaissé3,9\sM\sF\+12\s%\ssur octobre$/);
    expect(tuile('impayes').textContent).toMatch(/3 échéances en retard$/);
    expect(tuile('occupation').textContent).toMatch(/^Occupation78\s%18 biens loués sur 23 en location$/);
    expect(tuile('biensPublies').textContent).toBe('Biens publiés31sur 42 biens');
  });

  it('le ton ne colore que le contexte, qui le dit déjà en mots', () => {
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME, SERIES, CLOS)} />));
    expect(within(tuile('impayes')).getByText('3 échéances en retard').className).toContain('text-destructive');
    expect(within(tuile('encaisse')).getByText(/sur octobre/).className).toContain('text-success');
    expect(within(tuile('bauxActifs')).queryByText(/./, { selector: 'span.text-xs' })).toBeNull();
  });

  it('une liste fermée à la persona : le chiffre se lit, sans lien', () => {
    const kpis = [{ metric: 'members_count', label: 'Membres', format: 'number' as const, value: 5 }];
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence({ ...RESUME, kpis }, SERIES, { ouvertes: { impayes: false, equipe: false } })} />));
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Membres').closest('[data-chiffre]')?.textContent).toBe('Membres5');
  });

  it('une valeur absente se rend « — », jamais 0', () => {
    const resume = { ...RESUME, occupancy: { rate_percent: null } };
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(resume, SERIES, CLOS)} />));
    expect(tuile('occupation').textContent).toBe('Occupation—');
  });

  it('au téléphone, quatre chiffres puis « Les 6 chiffres », qui déplie le reste', () => {
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME, SERIES, CLOS)} colonnes={6} visiblesAuTelephone={4} />));
    const caches = () => screen.getAllByRole('listitem').filter((li) => li.className.includes('max-md:hidden')).map((li) => li.querySelector('[data-chiffre]')?.getAttribute('data-chiffre'));
    expect(caches()).toEqual(['biensPublies', 'tauxImpayes']);
    const bouton = screen.getByRole('button', { name: 'Les 6 chiffres' });
    expect([bouton.className.includes('md:hidden'), bouton.getAttribute('aria-expanded')]).toEqual([true, 'false']);
    fireEvent.click(bouton);
    expect(caches()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Moins de chiffres' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('sans pli demandé, aucun chiffre caché ni bouton', () => {
    render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME, SERIES, CLOS)} />));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('listitem').every((li) => !li.className.includes('max-md:hidden'))).toBe(true);
  });

  it('deux colonnes au téléphone, quatre ou six au bureau', () => {
    const { rerender } = render(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME, SERIES, CLOS)} />));
    expect(screen.getByRole('list').className).toMatch(/grid-cols-2 .*xl:grid-cols-4/);
    rerender(withIntl(<TuilesDuRapport chiffres={chiffresDeLAgence(RESUME, SERIES, CLOS)} colonnes={6} />));
    expect(screen.getByRole('list').className).toMatch(/lg:grid-cols-3 xl:grid-cols-6/);
  });
});
