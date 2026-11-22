/**
 * TCK-641 et TCK-642 — le panneau mobile de la navbar publique devient l'accès au COMPTE, et le
 * solde de crédits de l'espace actif paraît dans la barre (ordinateur) et dans le panneau (mobile).
 *
 * TCK-2493 (ADR-0091) — le panneau mobile a quitté la barre : l'accès au compte est l'onglet
 * « Compte » / « Moi » de la barre du bas, et l'écran `/account` (`EcranDuCompte.test.tsx`). Seule
 * reste ici la pastille de bureau.
 *
 * Retour du porteur du 2026-10-14 (capture du panneau, connecté) : Louer et Acheter en tête, rendu
 * plat. Demandé : sans Louer/Acheter, « Mes biens » à côté de « Mon profil », et les crédits.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import type { User, UserRole } from '@/types/user';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('contract_type=sale'),
  usePathname: () => '/fr/properties',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, replace: _replace, ...reste }: React.ComponentProps<'a'> & { href: string; replace?: boolean }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

const session = vi.hoisted(() => ({ user: null as User | null }));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: session.user, isLoading: false, setUser: vi.fn(), token: null, logout: vi.fn() }),
}));

const soldeMock = vi.hoisted(() => vi.fn<(o: { enabled: boolean }) => number | null>(() => null));
vi.mock('@/lib/queries/credits-solde', () => ({
  useSoldeCredits: (o: { enabled: boolean }) => soldeMock(o),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar } = await import('@/components/home/Navbar');

function compte(roles: UserRole[]): User {
  return {
    id: 7, first_name: 'Mariama', last_name: 'Touré', full_name: 'Mariama Touré',
    email: 'mariama@example.test', roles,
  } as unknown as User;
}

function monter(roles: UserRole[] | null) {
  session.user = roles === null ? null : compte(roles);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>);
}

beforeEach(() => {
  soldeMock.mockReset();
  soldeMock.mockReturnValue(null);
});

describe('TCK-642 — la pastille de la navbar (ordinateur)', () => {
  it('admin d’espace : le solde, qui mène à /app/credits (AC3)', () => {
    soldeMock.mockReturnValue(12);
    const { container } = monter(['agency_admin', 'customer']);
    const barre = container.querySelector('nav')!;
    const pastille = within(barre).getByRole('link', { name: 'Crédits : 12 crédits' });
    expect(pastille).toHaveAttribute('href', '/app/credits');
    expect(pastille).toHaveTextContent('12');
    // Dans le bloc d'actions de bureau (`hidden lg:flex`) ; sur mobile, « Crédits » est une rangée de
    // l'écran « Moi », et entre `lg` et `xl` une ligne de « Mon espace » (`espace-public.test.tsx`).
    expect(pastille.closest('.lg\\:flex')).not.toBeNull();
  });

  it('solde inconnu : aucune pastille, aucun « 0 » (AC5)', () => {
    soldeMock.mockReturnValue(null);
    const { container } = monter(['agency_admin', 'customer']);
    expect(container.querySelector('[data-slot="pastille-credits"]')).toBeNull();
    expect(within(container.querySelector('nav')!).queryByText('0')).toBeNull();
  });

  it('sans droit : ni pastille, ni lecture (AC2)', () => {
    soldeMock.mockReturnValue(12);
    const { container } = monter(['owner', 'customer']);
    expect(container.querySelector('[data-slot="pastille-credits"]')).toBeNull();
    // « Mon espace » monte le hook désarmé (`enabled: false`, TCK-2494) : aucune lecture de l'API.
    expect(soldeMock).not.toHaveBeenCalledWith({ enabled: true });
  });
});
