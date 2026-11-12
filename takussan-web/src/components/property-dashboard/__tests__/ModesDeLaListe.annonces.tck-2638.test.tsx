/**
 * TCK-2638 (lot B) — les filtres comptés du mode Annonces (pastilles du téléphone, onglets du bureau),
 * la jauge du quota et « Afficher les 20 suivants ». Les comptes sont ceux du résumé du portefeuille.
 *
 * Porte la règle de TCK-1289 (P131.02), écrite pour les tuiles d'avant : chaque onglet garde la portée
 * de la liste (`only_mine=1`, `user_id`) sous laquelle son nombre est compté, et « Vendus, loués » ouvre
 * les deux statuts qu'il compte.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AfficherLesSuivants,
  JaugeDuQuota,
  OngletsAnnonces,
  PastillesAnnonces,
} from '@/components/property-dashboard/ModesDeLaListe';
import { withIntl } from '@/test/intl';
import type { ResumeDuPortefeuille } from '@/types/property';

const m = vi.hoisted(() => ({ params: '', replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: m.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(m.params),
}));

const RESUME: ResumeDuPortefeuille = {
  total: 209,
  occupied: 70,
  vacant: 88,
  for_sale: 51,
  vacant_over_60_days: 2,
  notice: 3,
  rent_late: 7,
  rent_late_amount: 4_210_000,
  online: 67,
  pending_validation: 2,
  drafts: 13,
  offline: 127,
  sold_or_rented: 68,
  archived: 5,
};

beforeEach(() => {
  m.params = '';
  m.replace.mockReset();
});

const onglets = () =>
  within(screen.getByRole('navigation', { name: 'Filtrer par état d’annonce' }))
    .getAllByRole('link')
    .map((a) => ({
      nom: a.textContent,
      href: a.getAttribute('href'),
      actif: a.getAttribute('aria-current') === 'true',
    }));

describe('PastillesAnnonces (téléphone)', () => {
  it('« Toutes » puis les quatre états, comptés par le résumé ; « Toutes » enfoncée par défaut', () => {
    render(withIntl(<PastillesAnnonces resume={RESUME} />));
    const rangee = screen.getByRole('group', { name: 'Filtrer par état d’annonce' });
    const boutons = within(rangee).getAllByRole('button');
    expect(boutons.map((b) => b.textContent)).toEqual(['Toutes209', 'En ligne67', 'À valider2', 'Brouillons13', 'Hors ligne127']);
    expect(boutons[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('une pastille ouvre son état, garde la recherche et la portée, repart de la page 1', async () => {
    m.params = 'mode=annonces&search=Mermoz&only_mine=1&page=3';
    render(withIntl(<PastillesAnnonces resume={RESUME} />));
    await userEvent.click(screen.getByRole('button', { name: /Hors ligne/ }));
    expect(m.replace).toHaveBeenCalledWith('?mode=annonces&search=Mermoz&only_mine=1&listing=offline');
  });

  it('l’état actif se lit dans l’URL', () => {
    m.params = 'listing=pending';
    render(withIntl(<PastillesAnnonces resume={RESUME} />));
    expect(screen.getByRole('button', { name: /À valider/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('OngletsAnnonces (bureau)', () => {
  it('les pastilles, puis « Vendus, loués » et « Archivés » ; chacun porte son compte', () => {
    render(withIntl(<OngletsAnnonces resume={RESUME} />));
    expect(onglets().map((o) => o.nom)).toEqual([
      'Toutes209', 'En ligne67', 'À valider2', 'Brouillons13', 'Hors ligne127', 'Vendus, loués68', 'Archivés5',
    ]);
    expect(onglets()[0]?.actif).toBe(true);
  });

  it('TCK-1289 — sous « mes biens », chaque onglet garde `only_mine=1`', () => {
    m.params = 'only_mine=1';
    render(withIntl(<OngletsAnnonces resume={RESUME} />));
    expect(onglets().map((o) => o.href)).toEqual([
      '?only_mine=1',
      '?only_mine=1&listing=online',
      '?only_mine=1&listing=pending',
      '?only_mine=1&listing=draft',
      '?only_mine=1&listing=offline',
      '?only_mine=1&status=sold%2Crented',
      '?only_mine=1&status=archived&include_archived=1',
    ]);
  });

  it('TCK-1289 — sous un agent choisi, chaque onglet garde son `user_id`', () => {
    m.params = 'user_id=12';
    render(withIntl(<OngletsAnnonces resume={RESUME} />));
    expect(onglets().every((o) => new URLSearchParams(o.href!.slice(1)).get('user_id') === '12')).toBe(true);
  });

  it('« Vendus, loués » est actif pour `status=sold,rented`, et ramène à « Toutes »', () => {
    m.params = 'status=sold,rented';
    render(withIntl(<OngletsAnnonces resume={RESUME} />));
    const vendus = onglets()[5];
    expect(vendus).toMatchObject({ actif: true, href: '?' });
  });
});

describe('JaugeDuQuota', () => {
  it('au téléphone : le chiffre de l’agence, ce qu’il compte, et la jauge', () => {
    render(withIntl(<JaugeDuQuota used={42} limit={100} presentation="telephone" />));
    const jauge = screen.getByTestId('jauge-du-quota');
    expect(jauge).toHaveTextContent('42 annonces actives sur 100');
    expect(jauge).toHaveTextContent('Disponibles, validées ou en attente');
    expect(jauge).not.toHaveTextContent(/de validation/);
    expect(within(jauge).getByRole('progressbar', { name: 'Quota d’annonces de votre agence' })).toBeInTheDocument();
    // Le quota compte les annonces ACTIVES, pas celles en ligne (ADR-0097 § 6).
    expect(jauge.textContent).not.toMatch(/en ligne/i);
  });

  it('au bureau : la jauge fine, la définition au survol', () => {
    render(withIntl(<JaugeDuQuota used={42} limit={100} presentation="bureau" />));
    const jauge = screen.getByTestId('jauge-du-quota');
    expect(jauge).toHaveTextContent('42 annonces actives sur 100');
    expect(jauge).toHaveAttribute('title', 'Disponibles, validées ou en attente');
  });

  it('au-delà de la limite, la jauge passe à l’avertissement et reste bornée', () => {
    render(withIntl(<JaugeDuQuota used={120} limit={100} presentation="telephone" />));
    const barre = screen.getByRole('progressbar');
    expect(screen.getByTestId('jauge-du-quota')).toHaveTextContent('120 annonces actives sur 100');
    expect(barre.closest('[data-ton]') ?? barre).toHaveAttribute('data-ton', 'warning');
  });
});

describe('AfficherLesSuivants (téléphone)', () => {
  const meta = (current_page: number, per_page: number, total: number) => ({ current_page, per_page, total, last_page: Math.ceil(total / per_page) });

  it('sur la première page, quand il en reste : le compte montré et « Afficher les 20 suivants »', () => {
    m.params = 'mode=annonces&listing=online';
    render(withIntl(<AfficherLesSuivants meta={meta(1, 20, 67)} />));
    expect(screen.getByText('20 biens sur 67')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Afficher les 20 suivants' })).toHaveAttribute('href', '?mode=annonces&listing=online&voir=40');
  });

  it('le dernier lot dit ce qui reste', () => {
    render(withIntl(<AfficherLesSuivants meta={meta(1, 60, 67)} />));
    expect(screen.getByRole('link', { name: 'Afficher les 7 suivants' })).toHaveAttribute('href', '?voir=80');
  });

  it('un seul reste : « Afficher le suivant » (pluriel ICU)', () => {
    render(withIntl(<AfficherLesSuivants meta={meta(1, 40, 41)} />));
    expect(screen.getByRole('link', { name: 'Afficher le suivant' })).toHaveAttribute('href', '?voir=60');
  });

  it('rien quand tout est montré, au-delà de la première page, ou à la borne de 100', () => {
    const { container, rerender } = render(withIntl(<AfficherLesSuivants meta={meta(1, 20, 20)} />));
    expect(container).toBeEmptyDOMElement();
    rerender(withIntl(<AfficherLesSuivants meta={meta(2, 20, 67)} />));
    expect(container).toBeEmptyDOMElement();
    rerender(withIntl(<AfficherLesSuivants meta={meta(1, 100, 209)} />));
    expect(container).toBeEmptyDOMElement();
  });
});
