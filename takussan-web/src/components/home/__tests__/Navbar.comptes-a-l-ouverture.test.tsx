/**
 * TCK-1229 (P103.04) — les comptes par type du menu « Plus » ne sont demandés qu'à sa première
 * ouverture.
 *
 * La barre les demandait à chaque montage, sur toutes les pages, pour un menu fermé par défaut et
 * absent sous 1 024 px. Décision déléguée du 2026-10-21 : demande à l'ouverture, menu rendu sans
 * comptes d'ici là.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/fr/properties',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...reste }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...reste}>{children}</a>
  ),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null }),
}));

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ apiFetch, ApiError: class extends Error {} }));

vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));

const { Navbar } = await import('@/components/home/Navbar');

function appelsTypes(): number {
  return apiFetch.mock.calls.filter(([chemin]) => String(chemin).includes('property-types')).length;
}

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{withIntl(<Navbar />)}</QueryClientProvider>);
}

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (chemin: string) =>
    chemin.includes('property-types') ? { data: [{ value: 'warehouse', count: 7 }] } : { data: [] },
  );
});

describe('Navbar — comptes du menu « Plus »', () => {
  it('menu fermé : aucun appel à property-types', async () => {
    monter();

    await new Promise((r) => setTimeout(r, 30));
    expect(appelsTypes()).toBe(0);
  });

  it('à l\'ouverture : un appel, et les comptes affichés', async () => {
    monter();

    await userEvent.click(screen.getAllByRole('button', { name: /plus de types|more/i })[0]!);

    expect(await screen.findByText('7 biens')).toBeInTheDocument();
    expect(appelsTypes()).toBe(1);
  });
});
