/**
 * TCK-895 (P31.02) — la fiche introuvable a son repère `<main>`, comme les trois autres états de la
 * fiche (`page.server.test.tsx`) : un seul, qui contient le titre, la barre et le pied hors de lui.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import NotFound from '../not-found';

vi.mock('@/components/home/Navbar', () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock('@/components/shared/LienLocalise', () => ({
  LienLocalise: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

describe('fiche introuvable — repère <main>', () => {
  it('rend un seul <main>, autour du contenu', () => {
    const { container } = render(withIntl(<NotFound />));

    const mains = container.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    expect(mains[0].querySelector('h1')).not.toBeNull();
    expect(mains[0].querySelector('[data-testid="navbar"], [data-testid="footer"]')).toBeNull();
  });
});
