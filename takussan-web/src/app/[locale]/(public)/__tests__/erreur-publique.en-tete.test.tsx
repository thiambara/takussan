/**
 * TCK-2568 — l'erreur d'une page publique (`(public)/error.tsx`) ouvre au téléphone sur la BARRE DE
 * MARQUE de la maquette (Erreurs A, « Erreur serveur »), sous N'IMPORTE QUEL chemin — y compris ceux
 * d'une page qui n'a pas la barre du site (`/favorites`, `/compare`, `/account`, la fiche) : sans la
 * surcharge, l'exception y ouvrirait sur un haut vide.
 *
 * `erreur-publique.test.tsx` juge les sorties et mocke la barre ; ici, la VRAIE `Navbar` et sa cale
 * sont montées, pour garder le branchement que la page pose (revue du 2026-11-09 : la surcharge
 * retirée, toute la suite restait verte).
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';

const etat = vi.hoisted(() => ({ chemin: '/fr' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => etat.chemin,
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, setUser: vi.fn(), token: null }),
}));
vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
  apiRequest: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class extends Error {},
}));
vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: () => ({ data: undefined, isLoading: false, isFetching: false }),
}));
vi.mock('@/components/announcements/BandeauxDuSite', () => ({ BandeauxDuSite: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => <footer /> }));

const { default: ErreurPublique } = await import('../error');

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('(public)/error.tsx — la barre de marque au téléphone, sous tout chemin (TCK-2568)', () => {
  it.each(['/fr/favorites', '/fr/compare', '/en/account', '/fr/properties/villa', '/fr'])('%s', (chemin) => {
    etat.chemin = chemin;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        {withIntl(<ErreurPublique error={Object.assign(new Error('boum'), { digest: 'abc123' })} reset={() => undefined} />)}
      </QueryClientProvider>,
    );
    const nav = container.querySelector('nav')!;
    expect(nav.getAttribute('data-en-tete-au-telephone')).toBe('marque');
    expect(nav.className.split(/\s+/)).not.toContain('max-lg:hidden');
    const cale = container.querySelector('[data-cale-navbar]')!;
    expect(cale.className.split(/\s+/)).toContain('h-[57px]');
  });
});
