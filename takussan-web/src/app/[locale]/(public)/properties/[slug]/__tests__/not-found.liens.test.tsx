/**
 * TCK-2515 · AC4 — les deux liens du « Bien introuvable » étaient CROISÉS : « Voir les annonces »
 * menait à l'accueil et « Lancer une recherche » à la liste. Ce test garde chaque libellé sur sa
 * destination, pas seulement la présence de deux liens (un échange les laisserait passer).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import NotFound from '../not-found';

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));

describe('fiche introuvable — TCK-2515 AC4', () => {
  it('« Voir les annonces » mène à la liste, « Lancer une recherche » à la recherche de l’accueil', () => {
    render(withIntl(<NotFound />));

    expect(screen.getByRole('link', { name: 'Voir les annonces' })).toHaveAttribute('href', '/fr/properties');
    expect(screen.getByRole('link', { name: 'Lancer une recherche' })).toHaveAttribute('href', '/fr');
  });
});
