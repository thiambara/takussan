/**
 * TCK-2638 — le sélecteur « Gestion · Annonces » (mémorisé, repris dans l'URL, AC4) et les filtres
 * comptés du mode Gestion : pastilles du téléphone, tuiles du bureau, lus de `portfolio-summary`.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PastillesGestion, SelecteurDeMode, TuilesGestion } from '@/components/property-dashboard/ModesDeLaListe';
import { COOKIE_MODE_BIENS } from '@/lib/biens/mode-de-liste';
import { withIntl } from '@/test/intl';
import type { ResumeDuPortefeuille } from '@/types/property';

const m = vi.hoisted(() => ({ params: '', replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(m.params),
}));

const RESUME: ResumeDuPortefeuille = {
  total: 84,
  occupied: 61,
  vacant: 9,
  for_sale: 0,
  vacant_over_60_days: 2,
  notice: 3,
  rent_late: 6,
  rent_late_amount: 4_210_000,
  online: 67,
  pending_validation: 2,
  drafts: 5,
  offline: 10,
  sold_or_rented: 8,
  archived: 3,
};

beforeEach(() => {
  m.params = '';
  m.replace.mockReset();
  document.cookie = `${COOKIE_MODE_BIENS}=; path=/app/properties; max-age=0`;
});

describe('SelecteurDeMode', () => {
  it('nomme ses deux modes et marque le mode courant', () => {
    render(withIntl(<SelecteurDeMode mode="gestion" />));
    const liste = screen.getByRole('tablist', { name: 'Mode de la liste' });
    expect(within(liste).getByRole('tab', { name: 'Gestion' })).toHaveAttribute('aria-selected', 'true');
    expect(within(liste).getByRole('tab', { name: 'Annonces' })).toHaveAttribute('aria-selected', 'false');
  });

  it('AC4 : changer de mode garde la recherche et les filtres, et l’appareil s’en souvient', async () => {
    m.params = 'search=Mermoz&occupancy=vacant&mode=gestion';
    const ecrit = vi.spyOn(document, 'cookie', 'set');
    render(withIntl(<SelecteurDeMode mode="gestion" />));

    await userEvent.click(screen.getByRole('tab', { name: 'Annonces' }));

    const url = new URLSearchParams(String(m.replace.mock.calls[0]?.[0]).slice(1));
    expect(url.get('mode')).toBe('annonces');
    expect(url.get('search')).toBe('Mermoz');
    expect(url.get('occupancy')).toBe('vacant');
    expect(ecrit).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${COOKIE_MODE_BIENS}=annonces; path=/app/properties;`)));
    ecrit.mockRestore();
  });

  it('le mode courant ne renavigue pas', async () => {
    render(withIntl(<SelecteurDeMode mode="gestion" />));
    await userEvent.click(screen.getByRole('tab', { name: 'Gestion' }));
    expect(m.replace).not.toHaveBeenCalled();
  });
});

describe('PastillesGestion', () => {
  it('cinq pastilles comptées par le résumé, « Tous » enfoncée par défaut', () => {
    render(withIntl(<PastillesGestion resume={RESUME} />));
    const rangee = within(screen.getByRole('group', { name: 'Filtrer par occupation' }));
    const pastilles = rangee.getAllByRole('button');

    expect(pastilles.map((p) => p.textContent)).toEqual(['Tous84', 'Occupés61', 'Vacants9', 'Loyer en retard6', 'Préavis3']);
    expect(pastilles[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('TCK-2638 : « À vendre » s’ajoute, comptée par `for_sale`, quand le portefeuille en a ; elle ouvre `not_rental`', async () => {
    m.params = 'mode=gestion&occupancy=vacant';
    render(withIntl(<PastillesGestion resume={{ ...RESUME, total: 96, for_sale: 12 }} />));

    expect(screen.getAllByRole('button').map((p) => p.textContent)).toEqual([
      'Tous96', 'Occupés61', 'Vacants9', 'Loyer en retard6', 'Préavis3', 'À vendre12',
    ]);
    await userEvent.click(screen.getByRole('button', { name: /À vendre/ }));
    expect(new URLSearchParams(String(m.replace.mock.calls[0]?.[0]).slice(1)).get('occupancy')).toBe('not_rental');
  });

  it('TCK-2638 : active, « À vendre » reste affichée même à zéro (on peut en revenir)', () => {
    m.params = 'mode=gestion&occupancy=not_rental';
    render(withIntl(<PastillesGestion resume={RESUME} />));
    expect(screen.getByRole('button', { name: /À vendre/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('une pastille remplace la précédente, garde la recherche et repart de la page 1', async () => {
    m.params = 'mode=gestion&search=Mermoz&occupancy=vacant&page=3';
    render(withIntl(<PastillesGestion resume={RESUME} />));

    expect(screen.getByRole('button', { name: /Vacants/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Loyer en retard/ }));

    const url = new URLSearchParams(String(m.replace.mock.calls[0]?.[0]).slice(1));
    expect(url.get('rent_late')).toBe('1');
    expect(url.has('occupancy')).toBe(false);
    expect(url.has('page')).toBe(false);
    expect(url.get('search')).toBe('Mermoz');
    expect(url.get('mode')).toBe('gestion');
  });
});

describe('TuilesGestion', () => {
  it('quatre tuiles : occupés sur les biens à louer, vacants longs, loyers en retard et leur montant, préavis', () => {
    render(withIntl(<TuilesGestion resume={RESUME} />));
    const tuiles = within(screen.getByRole('navigation', { name: /Occupation du portefeuille/ })).getAllByRole('link');

    expect(tuiles).toHaveLength(4);
    // 61 occupés + 9 vacants = 70 biens à louer ; 61 / 70 = 87 %.
    expect(tuiles[0].textContent).toMatch(/^Occupés61\s\/\s70/);
    expect(tuiles[0].textContent).toMatch(/87\s%\sdes biens à louer$/);
    expect(tuiles[1].textContent).toBe('Vacants92 depuis plus de 60 j');
    expect(tuiles[2].textContent).toMatch(/^Loyers en retard64\s210\s000\sF à encaisser$/);
    expect(tuiles[3].textContent).toBe('Préavis33 sorties annoncées');
  });

  it('chaque tuile ouvre son filtre ; la tuile active ramène à « Tous »', () => {
    m.params = 'mode=gestion&rent_late=1';
    render(withIntl(<TuilesGestion resume={RESUME} />));
    const [occupes, , retard] = screen.getAllByRole('link');

    expect(new URLSearchParams(occupes.getAttribute('href')!.slice(1)).get('occupancy')).toBe('occupied');
    expect(retard).toHaveAttribute('aria-current', 'true');
    const retour = new URLSearchParams(retard.getAttribute('href')!.slice(1));
    expect(retour.has('rent_late')).toBe(false);
    expect(retour.get('mode')).toBe('gestion');
  });

  it('TCK-2638 : une cinquième tuile « À vendre », comptée par `for_sale`, ouvre la liste `not_rental`', () => {
    render(withIntl(<TuilesGestion resume={{ ...RESUME, total: 96, for_sale: 12 }} />));
    const nav = screen.getByRole('navigation', { name: /Occupation du portefeuille/ });
    const tuiles = within(nav).getAllByRole('link');

    expect(tuiles).toHaveLength(5);
    expect(nav).toHaveClass('grid-cols-5');
    expect(tuiles[4].textContent).toBe('À vendre12Ni occupés ni vacants');
    expect(new URLSearchParams(tuiles[4].getAttribute('href')!.slice(1)).get('occupancy')).toBe('not_rental');
  });

  it('TCK-2638 : les ventes n’entrent pas dans le taux d’occupation — ni au dénominateur, ni au total affiché', () => {
    // 70 occupés + 30 vacants = 100 biens à louer ; 50 ventes en plus : 150 au portefeuille.
    render(withIntl(<TuilesGestion resume={{ ...RESUME, total: 150, occupied: 70, vacant: 30, for_sale: 50 }} />));
    const occupes = within(screen.getByRole('navigation', { name: /Occupation du portefeuille/ })).getAllByRole('link')[0];

    expect(occupes.textContent).toMatch(/^Occupés70\s\/\s100/);
    expect(occupes.textContent).toMatch(/70\s%\sdes biens à louer$/);
    expect(occupes.textContent).not.toMatch(/150|47\s%|portefeuille/);
  });

  it('TCK-2638 : sans aucun bien à louer, le taux est nul, sans division par zéro', () => {
    render(withIntl(<TuilesGestion resume={{ ...RESUME, total: 4, occupied: 0, vacant: 0, for_sale: 4 }} />));
    const occupes = within(screen.getByRole('navigation', { name: /Occupation du portefeuille/ })).getAllByRole('link')[0];
    expect(occupes.textContent).toMatch(/^Occupés0\s\/\s0.*0\s%\sdes biens à louer$/);
  });

  it('TCK-2638 : sans bien hors location, les quatre tuiles d’avant', () => {
    render(withIntl(<TuilesGestion resume={RESUME} />));
    const nav = screen.getByRole('navigation', { name: /Occupation du portefeuille/ });
    expect(within(nav).getAllByRole('link')).toHaveLength(4);
    expect(nav).toHaveClass('grid-cols-4');
  });

  it('sans retard, la tuile le dit au lieu d’un montant nul', () => {
    render(withIntl(<TuilesGestion resume={{ ...RESUME, rent_late: 0, rent_late_amount: 0 }} />));
    expect(screen.getByText('Tous les loyers sont à jour')).toBeInTheDocument();
  });
});
