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
  vacant_over_60_days: 2,
  notice: 3,
  rent_late: 6,
  rent_late_amount: 4_210_000,
  online: 67,
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
  it('quatre tuiles : occupés sur le total, vacants longs, loyers en retard et leur montant, préavis', () => {
    render(withIntl(<TuilesGestion resume={RESUME} />));
    const tuiles = within(screen.getByRole('navigation', { name: /Occupation du portefeuille/ })).getAllByRole('link');

    expect(tuiles).toHaveLength(4);
    expect(tuiles[0].textContent).toMatch(/^Occupés61\s\/\s84/);
    expect(tuiles[0].textContent).toMatch(/73\s%\sdu portefeuille$/);
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

  it('sans retard, la tuile le dit au lieu d’un montant nul', () => {
    render(withIntl(<TuilesGestion resume={{ ...RESUME, rent_late: 0, rent_late_amount: 0 }} />));
    expect(screen.getByText('Tous les loyers sont à jour')).toBeInTheDocument();
  });
});
